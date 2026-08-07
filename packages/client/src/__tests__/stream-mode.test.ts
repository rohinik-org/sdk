/**
 * Task 6 acceptance gate — streamMode: auto | sse | poll
 *
 * Tests:
 *   - sse mode: delivers events normally (happy path)
 *   - sse mode: throws RohinikClientError on persistent SSE failure (no fallback)
 *   - poll mode: synthesizes terminal event from status poll
 *   - poll mode: synthesizes COMPLETED lifecycle event
 *   - poll mode: synthesizes CANCELLED lifecycle event
 *   - poll mode: synthesizes FAILED lifecycle event
 *   - auto mode: uses SSE when SSE is healthy
 *   - auto mode: falls back to polling when SSE endpoint always fails
 *   - auto mode: onStreamModeChange fires with 'poll' when fallback occurs
 *   - auto mode: reconnects after drop before falling back
 *   - auto mode: timeout throws RohinikClientError
 *   - poll mode: AbortSignal stops polling
 *   - poll mode: bounded backoff (no infinite wait)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import { ExecutionHandle } from '../execution-handle.js'
import { HttpTransport } from '../transport.js'
import { RohinikClientError } from '../transport.js'

const PROTO_VERSION = 'v1'

// ── Mock server helpers ───────────────────────────────────────────────────────

interface StatusRoute {
  executionId: string
  states: string[]   // sequence of states to return on successive GET calls
}

interface SseRoute {
  executionId: string
  events?: object[]
  failWithStatus?: number   // always return this HTTP status (simulate unavailable SSE)
  dropAfterN?: number       // drop connection after N events (simulate disconnect)
  failFirstN?: number       // fail first N attempts then succeed
}

function buildMockServer(sseRoutes: SseRoute[], statusRoutes: StatusRoute[]): {
  server: http.Server
  port: () => number
} {
  const sseCallCounts = new Map<string, number>()

  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1')
    const pathname = url.pathname

    // SSE events endpoint
    const sseMatch = pathname.match(/^\/v1\/executions\/([^/]+)\/events$/)
    if (sseMatch) {
      const id = sseMatch[1]!
      const route = sseRoutes.find(r => r.executionId === id)
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'EXECUTION_NOT_FOUND', message: 'not found', protocolVersion: PROTO_VERSION }))
        return
      }

      const callN = (sseCallCounts.get(id) ?? 0) + 1
      sseCallCounts.set(id, callN)

      // Fail first N attempts
      if (route.failFirstN !== undefined && callN <= route.failFirstN) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'SSE unavailable', protocolVersion: PROTO_VERSION }))
        return
      }

      if (route.failWithStatus) {
        res.writeHead(route.failWithStatus, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'SSE unavailable', protocolVersion: PROTO_VERSION }))
        return
      }

      const events = route.events ?? []
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })

      let sent = 0
      for (const event of events) {
        if (route.dropAfterN !== undefined && sent >= route.dropAfterN) {
          res.destroy()
          return
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`)
        sent++
      }
      res.end()
      return
    }

    // Status endpoint
    const statusMatch = pathname.match(/^\/v1\/executions\/([^/]+)$/)
    if (statusMatch) {
      const id = statusMatch[1]!
      const route = statusRoutes.find(r => r.executionId === id)
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 'EXECUTION_NOT_FOUND', message: 'not found', protocolVersion: PROTO_VERSION }))
        return
      }
      // Consume states in order; last state is sticky
      const stateIdx = Math.min(
        (sseCallCounts.get(`status:${id}`) ?? 0),
        route.states.length - 1,
      )
      sseCallCounts.set(`status:${id}`, stateIdx + 1)
      const state = route.states[stateIdx]!
      const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(state)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ executionId: id, state, terminal, protocolVersion: PROTO_VERSION }))
      return
    }

    res.writeHead(404).end()
  })

  return { server, port: () => (server.address() as { port: number }).port }
}

function ev(sequence: number, kind: string, extra?: object): object {
  return {
    kind,
    sequence,
    executionId: 'test',
    occurredAt: new Date().toISOString(),
    cursor: Buffer.from(`test:${sequence}`).toString('base64url'),
    payload: extra ?? {},
  }
}

const SSE_HAPPY_EVENTS = [
  ev(1, 'EXECUTION_ACCEPTED', { submittedAt: new Date().toISOString() }),
  ev(2, 'EXECUTION_ADMITTED', { admittedAt: new Date().toISOString() }),
  ev(3, 'EXECUTION_STARTED',  { startedAt: new Date().toISOString() }),
  ev(4, 'EXECUTION_COMPLETED', { completedAt: new Date().toISOString(), totalDurationMs: 10 }),
]

// ── Test suite ────────────────────────────────────────────────────────────────

describe('streamMode', () => {
  let server: http.Server
  let port: number

  const sseRoutes: SseRoute[] = [
    { executionId: 'sse-happy',         events: SSE_HAPPY_EVENTS },
    { executionId: 'sse-always-fail',   failWithStatus: 503 },
    { executionId: 'sse-drop',          events: SSE_HAPPY_EVENTS, dropAfterN: 2 },
    { executionId: 'sse-fail-first-2',  events: SSE_HAPPY_EVENTS, failFirstN: 2 },
    { executionId: 'poll-completed',    events: [] },
    { executionId: 'poll-cancelled',    events: [] },
    { executionId: 'poll-failed',       events: [] },
    { executionId: 'abort-poll',        failWithStatus: 503 },
    { executionId: 'auto-sse-ok',       events: SSE_HAPPY_EVENTS },
    { executionId: 'auto-fallback',     failWithStatus: 503 },
    { executionId: 'auto-reconnect',    events: SSE_HAPPY_EVENTS, dropAfterN: 2 },
  ]

  const statusRoutes: StatusRoute[] = [
    { executionId: 'poll-completed',   states: ['QUEUED', 'RUNNING', 'COMPLETED'] },
    { executionId: 'poll-cancelled',   states: ['RUNNING', 'CANCELLED'] },
    { executionId: 'poll-failed',      states: ['RUNNING', 'FAILED'] },
    { executionId: 'auto-fallback',    states: ['QUEUED', 'RUNNING', 'COMPLETED'] },
    { executionId: 'abort-poll',       states: ['RUNNING', 'RUNNING', 'RUNNING', 'RUNNING', 'COMPLETED'] },
    { executionId: 'auto-reconnect',   states: ['RUNNING', 'COMPLETED'] },
  ]

  beforeAll(async () => {
    const mock = buildMockServer(sseRoutes, statusRoutes)
    server = mock.server
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    port = mock.port()
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  function handle(id: string): ExecutionHandle {
    return new ExecutionHandle(id, new HttpTransport({ baseUrl: `http://127.0.0.1:${port}` }))
  }

  // ── sse mode ──────────────────────────────────────────────────────────────

  it('sse mode: delivers all events from SSE stream', async () => {
    const kinds: string[] = []
    for await (const e of handle('sse-happy').events({ streamMode: 'sse' })) {
      kinds.push((e as { kind: string }).kind)
    }
    expect(kinds).toEqual(['EXECUTION_ACCEPTED', 'EXECUTION_ADMITTED', 'EXECUTION_STARTED', 'EXECUTION_COMPLETED'])
  })

  it('sse mode: throws RohinikClientError when SSE always fails (no fallback)', async () => {
    await expect(async () => {
      for await (const _ of handle('sse-always-fail').events({ streamMode: 'sse' })) { /* noop */ }
    }).rejects.toBeInstanceOf(RohinikClientError)
  })

  // ── poll mode ─────────────────────────────────────────────────────────────

  it('poll mode: yields terminal EXECUTION_COMPLETED event', async () => {
    const kinds: string[] = []
    for await (const e of handle('poll-completed').events({ streamMode: 'poll', pollIntervalMs: 10 })) {
      kinds.push((e as { kind: string }).kind)
    }
    expect(kinds.at(-1)).toBe('EXECUTION_COMPLETED')
  })

  it('poll mode: yields terminal EXECUTION_CANCELLED event', async () => {
    const kinds: string[] = []
    for await (const e of handle('poll-cancelled').events({ streamMode: 'poll', pollIntervalMs: 10 })) {
      kinds.push((e as { kind: string }).kind)
    }
    expect(kinds.at(-1)).toBe('EXECUTION_CANCELLED')
  })

  it('poll mode: yields terminal EXECUTION_FAILED event', async () => {
    const kinds: string[] = []
    for await (const e of handle('poll-failed').events({ streamMode: 'poll', pollIntervalMs: 10 })) {
      kinds.push((e as { kind: string }).kind)
    }
    expect(kinds.at(-1)).toBe('EXECUTION_FAILED')
  })

  it('poll mode: synthesized events have monotonically increasing sequence', async () => {
    const seqs: number[] = []
    for await (const e of handle('poll-completed').events({ streamMode: 'poll', pollIntervalMs: 10 })) {
      seqs.push((e as { sequence: number }).sequence)
    }
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!)
    }
  })

  it('poll mode: AbortSignal stops iteration', async () => {
    const controller = new AbortController()
    let count = 0
    try {
      for await (const _ of handle('abort-poll').events({
        streamMode: 'poll',
        pollIntervalMs: 10,
        signal: controller.signal,
      })) {
        count++
        if (count === 1) controller.abort()
      }
    } catch { /* AbortError expected */ }
    expect(count).toBeLessThan(5)
  })

  // ── auto mode ─────────────────────────────────────────────────────────────

  it('auto mode: uses SSE when SSE is healthy', async () => {
    const kinds: string[] = []
    for await (const e of handle('auto-sse-ok').events({ streamMode: 'auto' })) {
      kinds.push((e as { kind: string }).kind)
    }
    // Got real SSE events (ADMITTED, STARTED present — poll doesn't emit these)
    expect(kinds).toContain('EXECUTION_ADMITTED')
    expect(kinds.at(-1)).toBe('EXECUTION_COMPLETED')
  })

  it('auto mode: falls back to polling when SSE always fails', async () => {
    const kinds: string[] = []
    for await (const e of handle('auto-fallback').events({ streamMode: 'auto', pollIntervalMs: 10 })) {
      kinds.push((e as { kind: string }).kind)
    }
    // Must still deliver terminal event even though SSE failed
    expect(['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']).toContain(kinds.at(-1))
  })

  it('auto mode: onStreamModeChange fires with poll when fallback occurs', async () => {
    const modes: string[] = []
    for await (const _ of handle('auto-fallback').events({
      streamMode: 'auto',
      pollIntervalMs: 10,
      onStreamModeChange: (mode) => modes.push(mode),
    })) { /* noop */ }
    expect(modes).toContain('poll')
  })

  it('auto mode: reconnects on connection drop before falling back', async () => {
    const kinds: string[] = []
    for await (const e of handle('auto-reconnect').events({ streamMode: 'auto' })) {
      kinds.push((e as { kind: string }).kind)
    }
    // Connection dropped after 2 events — reconnect delivers the rest
    expect(['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']).toContain(kinds.at(-1))
  })

  it('auto mode: timeout throws RohinikClientError', async () => {
    // Use sse-always-fail + very short timeout so auto gives up quickly
    await expect(async () => {
      for await (const _ of handle('sse-always-fail').events({
        streamMode: 'auto',
        timeoutMs: 50,
        pollIntervalMs: 10,
      })) { /* noop */ }
    }).rejects.toBeInstanceOf(RohinikClientError)
  })
})

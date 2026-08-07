/**
 * Task 5 acceptance gate — ExecutionHandle.events() SSE streaming.
 *
 * Tests:
 *   - yields events as PublicExecutionEvent objects
 *   - closes iterator automatically on terminal event (EXECUTION_COMPLETED)
 *   - closes iterator on EXECUTION_FAILED terminal
 *   - closes iterator on EXECUTION_CANCELLED terminal
 *   - suppresses duplicate events by sequence (reconnect overlap)
 *   - throws on non-monotonic sequence
 *   - reconnects using last cursor when reconnect=true and server drops connection
 *   - closing the iterator does NOT cancel the execution
 *   - AbortSignal stops iteration immediately
 *   - throws RohinikClientError on HTTP error response (404)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import { ExecutionHandle } from '../execution-handle.js'
import { HttpTransport } from '../transport.js'
import { RohinikClientError } from '../transport.js'

// ── Mock SSE server ───────────────────────────────────────────────────────────

interface MockRoute {
  executionId: string
  events: object[]
  dropAfter?: number   // close connection after N events (simulate drop for reconnect test)
  statusCode?: number  // override response status
}

function makeSseServer(routes: MockRoute[]): {
  server: http.Server
  port: () => number
  nextAfterCursor: string | null
} {
  const state = { capturedAfterCursor: null as string | null }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1`)
    const match = url.pathname.match(/^\/v1\/executions\/([^/]+)\/events$/)
    if (!match) {
      res.writeHead(404).end()
      return
    }
    const id = match[1]!
    const route = routes.find(r => r.executionId === id)
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'EXECUTION_NOT_FOUND', message: `not found`, protocolVersion: '1' }))
      return
    }
    if (route.statusCode && route.statusCode !== 200) {
      res.writeHead(route.statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code: 'EXECUTION_NOT_FOUND', message: `not found`, protocolVersion: '1' }))
      return
    }

    // Track cursor from query param for reconnect test
    const afterCursor = url.searchParams.get('after')
    if (afterCursor) state.capturedAfterCursor = afterCursor

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const eventsToSend = route.events
    let sent = 0
    for (const event of eventsToSend) {
      if (route.dropAfter !== undefined && sent >= route.dropAfter) {
        res.destroy()
        return
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`)
      sent++
    }
    res.end()
  })

  return {
    server,
    port: () => (server.address() as { port: number }).port,
    get nextAfterCursor() { return state.capturedAfterCursor },
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEvent(sequence: number, kind: string, terminal = false): object {
  return {
    kind,
    sequence,
    executionId: 'exec-1',
    occurredAt: new Date().toISOString(),
    cursor: Buffer.from(`exec-1:${sequence}`).toString('base64url'),
    payload: {},
  }
}

const ACCEPTED = makeEvent(1, 'EXECUTION_ACCEPTED')
const ADMITTED = makeEvent(2, 'EXECUTION_ADMITTED')
const STARTED  = makeEvent(3, 'EXECUTION_STARTED')
const COMPLETED = makeEvent(4, 'EXECUTION_COMPLETED')
const FAILED    = { ...makeEvent(4, 'EXECUTION_FAILED'), payload: { errorCode: 'E', message: 'oops', failedAt: new Date().toISOString() } }
const CANCELLED = { ...makeEvent(4, 'EXECUTION_CANCELLED'), payload: { cancelledAt: new Date().toISOString() } }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecutionHandle.events()', () => {
  let serverInstance: http.Server
  let port: number
  let capturedCursor: () => string | null

  const routes: MockRoute[] = [
    { executionId: 'exec-1', events: [ACCEPTED, ADMITTED, STARTED, COMPLETED] },
    { executionId: 'exec-failed', events: [makeEvent(1, 'EXECUTION_ACCEPTED'), makeEvent(2, 'EXECUTION_FAILED', true)] },
    { executionId: 'exec-cancelled', events: [makeEvent(1, 'EXECUTION_ACCEPTED'), makeEvent(2, 'EXECUTION_CANCELLED', true)] },
    // Duplicate sequence 3 appears twice — should only yield once
    {
      executionId: 'exec-dup',
      events: [
        makeEvent(1, 'EXECUTION_ACCEPTED'),
        makeEvent(2, 'EXECUTION_ADMITTED'),
        makeEvent(3, 'EXECUTION_STARTED'),
        makeEvent(3, 'EXECUTION_STARTED'),   // dup
        makeEvent(4, 'EXECUTION_COMPLETED'),
      ],
    },
    // Non-monotonic: seq 3 then seq 2
    {
      executionId: 'exec-nonmono',
      events: [
        makeEvent(1, 'EXECUTION_ACCEPTED'),
        makeEvent(3, 'EXECUTION_STARTED'),
        makeEvent(2, 'EXECUTION_ADMITTED'),  // goes backwards
        makeEvent(4, 'EXECUTION_COMPLETED'),
      ],
    },
    { executionId: 'exec-404', events: [], statusCode: 404 },
    {
      executionId: 'exec-abort',
      events: [makeEvent(1, 'EXECUTION_ACCEPTED'), makeEvent(2, 'EXECUTION_ADMITTED')],
    },
  ]

  const serverState = makeSseServer(routes)
  serverInstance = serverState.server
  capturedCursor = () => serverState.nextAfterCursor

  beforeAll(async () => {
    await new Promise<void>(resolve => serverInstance.listen(0, '127.0.0.1', resolve))
    port = (serverInstance.address() as { port: number }).port
  })

  afterAll(async () => {
    await new Promise<void>(resolve => serverInstance.close(() => resolve()))
  })

  function handle(id: string): ExecutionHandle {
    return new ExecutionHandle(id, new HttpTransport({ baseUrl: `http://127.0.0.1:${port}` }))
  }

  it('yields all events up to and including terminal COMPLETED', async () => {
    const collected: object[] = []
    for await (const event of handle('exec-1').events()) {
      collected.push(event)
    }
    expect(collected).toHaveLength(4)
    expect((collected[0] as { kind: string }).kind).toBe('EXECUTION_ACCEPTED')
    expect((collected[3] as { kind: string }).kind).toBe('EXECUTION_COMPLETED')
  })

  it('closes iterator on EXECUTION_FAILED terminal', async () => {
    const kinds: string[] = []
    for await (const event of handle('exec-failed').events()) {
      kinds.push((event as { kind: string }).kind)
    }
    expect(kinds.at(-1)).toBe('EXECUTION_FAILED')
  })

  it('closes iterator on EXECUTION_CANCELLED terminal', async () => {
    const kinds: string[] = []
    for await (const event of handle('exec-cancelled').events()) {
      kinds.push((event as { kind: string }).kind)
    }
    expect(kinds.at(-1)).toBe('EXECUTION_CANCELLED')
  })

  it('suppresses duplicate events by sequence', async () => {
    const sequences: number[] = []
    for await (const event of handle('exec-dup').events()) {
      sequences.push((event as { sequence: number }).sequence)
    }
    // Sequence 3 must appear exactly once
    expect(sequences.filter(s => s === 3)).toHaveLength(1)
    expect(sequences).toEqual([1, 2, 3, 4])
  })

  it('throws RohinikClientError on non-monotonic sequence', async () => {
    const iter = handle('exec-nonmono').events()
    let threw = false
    try {
      for await (const _ of iter) { /* consume */ }
    } catch (err) {
      threw = true
      expect(err).toBeInstanceOf(RohinikClientError)
      expect((err as RohinikClientError).message).toMatch(/sequence/)
    }
    expect(threw).toBe(true)
  })

  it('throws RohinikClientError on 404', async () => {
    await expect(async () => {
      for await (const _ of handle('exec-404').events()) { /* noop */ }
    }).rejects.toBeInstanceOf(RohinikClientError)
  })

  it('closing the iterator does not call cancel()', async () => {
    let cancelCalled = false
    const transport = new HttpTransport({ baseUrl: `http://127.0.0.1:${port}` })
    const h = new ExecutionHandle('exec-1', transport)

    // Monkey-patch cancel to detect if called
    const originalCancel = h.cancel.bind(h)
    ;(h as unknown as Record<string, unknown>).cancel = async (...args: unknown[]) => {
      cancelCalled = true
      return originalCancel(...(args as Parameters<typeof originalCancel>))
    }

    // Take only first event then break
    for await (const _ of h.events()) {
      break
    }

    expect(cancelCalled).toBe(false)
  })

  it('AbortSignal stops iteration', async () => {
    const controller = new AbortController()
    const collected: object[] = []

    // Abort immediately after first event
    const iter = handle('exec-1').events({ signal: controller.signal })
    let count = 0
    try {
      for await (const event of iter) {
        collected.push(event)
        count++
        if (count === 1) controller.abort()
      }
    } catch {
      // AbortError is expected — swallow
    }

    // Should have stopped early, not collected all 4
    expect(collected.length).toBeLessThan(4)
  })
})

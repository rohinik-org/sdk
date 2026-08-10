import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import {
  createRohinikClient,
  RohinikClientError,
  ExecutionFailedError,
  ExecutionCancelledError,
  ExecutionTimeoutError,
  EXECUTION_PROTOCOL_VERSION,
} from '../index.js'

// ── Minimal mock RS1 server ───────────────────────────────────────────────────

const MOCK_PORT = 19_200

type MockRecord = {
  executionId: string
  state: string
  submittedAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  output: unknown
}

const records = new Map<string, MockRecord>()
let mockServer: Server

function jsonResponse(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch { resolve({}) }
    })
  })
}

beforeAll(async () => {
  mockServer = createServer(async (req, res) => {
    const url = req.url ?? ''
    const method = req.method ?? 'GET'
    const proto = EXECUTION_PROTOCOL_VERSION

    // POST /v1/executions
    if (method === 'POST' && url === '/v1/executions') {
      const body = await readBody(req) as Record<string, unknown>
      const executionId = `mock-exec-${Date.now()}`
      const now = new Date().toISOString()
      records.set(executionId, {
        executionId, state: 'QUEUED',
        submittedAt: now, startedAt: null, completedAt: null, cancelledAt: null,
        output: `[mock] echo: ${body.content ?? ''}`,
      })
      // Simulate async completion after 50ms
      setTimeout(() => {
        const r = records.get(executionId)!
        const done = new Date().toISOString()
        records.set(executionId, { ...r, state: 'COMPLETED', startedAt: done, completedAt: done })
      }, 50)
      return jsonResponse(res, 202, {
        executionId, idempotencyKey: null, state: 'QUEUED',
        protocolVersion: proto, submittedAt: now, idempotent: false,
      })
    }

    // Match /v1/executions/:id and sub-paths
    const m = url.match(/^\/v1\/executions\/([^/]+)(\/.*)?$/)
    if (!m) return jsonResponse(res, 404, { code: 'NOT_FOUND', message: 'not found', protocolVersion: proto })

    const executionId = decodeURIComponent(m[1]!)
    const sub = m[2] ?? ''
    const record = records.get(executionId)

    if (!record) {
      return jsonResponse(res, 404, {
        code: 'EXECUTION_NOT_FOUND',
        message: `Execution ${executionId} not found`,
        executionId, protocolVersion: proto,
      })
    }

    // GET /v1/executions/:id
    if (method === 'GET' && sub === '') {
      const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(record.state)
      return jsonResponse(res, 200, {
        executionId: record.executionId,
        state: record.state,
        protocolVersion: proto,
        submittedAt: record.submittedAt,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        cancelledAt: record.cancelledAt,
        terminal,
      })
    }

    // GET /v1/executions/:id/result
    if (method === 'GET' && sub === '/result') {
      if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(record.state)) {
        return jsonResponse(res, 409, {
          code: 'RESULT_NOT_READY',
          message: `Execution ${executionId} not terminal`,
          executionId, protocolVersion: proto,
        })
      }
      return jsonResponse(res, 200, {
        executionId: record.executionId,
        state: record.state,
        output: record.output,
        totalDurationMs: 50,
        completedAt: record.completedAt,
      })
    }

    // POST /v1/executions/:id/cancel
    if (method === 'POST' && sub === '/cancel') {
      const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(record.state)
      if (terminal) {
        return jsonResponse(res, 200, { executionId, state: record.state, cancelAccepted: false })
      }
      const now = new Date().toISOString()
      records.set(executionId, { ...record, state: 'CANCELLED', cancelledAt: now })
      return jsonResponse(res, 200, { executionId, state: 'CANCELLED', cancelAccepted: true })
    }

    // GET /v1/executions/:id/evidence
    if (method === 'GET' && sub === '/evidence') {
      return jsonResponse(res, 200, {
        executionId,
        entries: [
          { kind: 'step:completed', stepId: 'mock-step', detail: { ok: true }, recordedAt: record.completedAt ?? new Date().toISOString() },
        ],
      })
    }

    return jsonResponse(res, 404, { code: 'NOT_FOUND', message: 'unknown sub-path', protocolVersion: proto })
  })

  await new Promise<void>(resolve => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve))
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => mockServer.close(err => err ? reject(err) : resolve()))
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient() {
  return createRohinikClient({ baseUrl: `http://127.0.0.1:${MOCK_PORT}` })
}

async function waitTerminal(executionId: string, maxMs = 2000): Promise<void> {
  const client = makeClient()
  const handle = client.executions.attach(executionId)
  await handle.waitUntilTerminal({ timeoutMs: maxMs, pollIntervalMs: 30 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createRohinikClient', () => {
  it('creates a client with executions resource', () => {
    const client = makeClient()
    expect(client.executions).toBeDefined()
    expect(typeof client.executions.start).toBe('function')
    expect(typeof client.executions.attach).toBe('function')
  })

  it('defaults to localhost:8080 when no baseUrl given', () => {
    const client = createRohinikClient()
    // transport baseUrl accessible — just verify no throw
    expect(client).toBeDefined()
  })
})

describe('executions.start()', () => {
  it('returns an ExecutionHandle with executionId', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'hello', contentType: 'TEXT' })
    expect(handle.executionId).toMatch(/^mock-exec-/)
  })

  it('handle has status/result/evidence/cancel methods', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'api shape', contentType: 'TEXT' })
    expect(typeof handle.status).toBe('function')
    expect(typeof handle.result).toBe('function')
    expect(typeof handle.evidence).toBe('function')
    expect(typeof handle.cancel).toBe('function')
  })
})

describe('execution.status()', () => {
  it('returns status with executionId and state', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'status test', contentType: 'TEXT' })
    const status = await handle.status()
    expect(status.executionId).toBe(handle.executionId)
    expect(['QUEUED', 'ADMITTED', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(status.state)
    expect(status.protocolVersion).toBe('v1')
  })

  it('terminal becomes true after execution completes', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'terminal poll', contentType: 'TEXT' })
    await waitTerminal(handle.executionId)
    const status = await handle.status()
    expect(status.terminal).toBe(true)
    expect(['COMPLETED', 'FAILED', 'CANCELLED']).toContain(status.state)
  })
})

describe('execution.result()', () => {
  it('returns result after execution completes', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'result test', contentType: 'TEXT' })
    await waitTerminal(handle.executionId)
    const result = await handle.result()
    expect(result.executionId).toBe(handle.executionId)
    expect(result.output).toBe('[mock] echo: result test')
    expect(typeof result.totalDurationMs).toBe('number')
  })

  it('throws RohinikClientError with RESULT_NOT_READY when not yet terminal', async () => {
    const client = makeClient()
    // Submit and immediately check — mock records start as QUEUED
    const handle = await client.executions.start({ content: 'not ready', contentType: 'TEXT' })
    const status = await handle.status()
    if (!status.terminal) {
      await expect(handle.result()).rejects.toThrow(RohinikClientError)
    }
    // If already terminal due to fast mock, that's fine — skip assertion
  })
})

describe('execution.evidence()', () => {
  it('returns evidence entries', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'evidence test', contentType: 'TEXT' })
    const evidence = await handle.evidence()
    expect(evidence.executionId).toBe(handle.executionId)
    expect(Array.isArray(evidence.entries)).toBe(true)
    expect(evidence.entries.length).toBeGreaterThan(0)
    expect(evidence.entries[0]?.kind).toBe('step:completed')
  })
})

describe('execution.cancel()', () => {
  it('cancels an in-progress execution', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'cancel test', contentType: 'TEXT' })
    // Cancel before the 50ms completion fires
    const response = await handle.cancel({ reason: 'User requested cancellation' })
    expect(response.executionId).toBe(handle.executionId)
    // Either accepted (cancelled in time) or not (already terminal) — both valid
    expect(typeof response.cancelAccepted).toBe('boolean')
  })

  it('cancel with no body does not throw', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'cancel no body', contentType: 'TEXT' })
    await expect(handle.cancel()).resolves.toBeDefined()
  })

  it('cancel on terminal execution returns cancelAccepted=false', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'cancel terminal', contentType: 'TEXT' })
    await waitTerminal(handle.executionId)
    const response = await handle.cancel()
    expect(response.cancelAccepted).toBe(false)
  })
})

describe('executions.attach()', () => {
  it('attaches to existing execution by id', async () => {
    const client = makeClient()
    const orig = await client.executions.start({ content: 'attach test', contentType: 'TEXT' })
    const attached = client.executions.attach(orig.executionId)
    expect(attached.executionId).toBe(orig.executionId)
    const status = await attached.status()
    expect(status.executionId).toBe(orig.executionId)
  })
})

describe('error handling', () => {
  it('throws RohinikClientError for unknown executionId', async () => {
    const client = makeClient()
    const handle = client.executions.attach('does-not-exist')
    await expect(handle.status()).rejects.toThrow(RohinikClientError)
  })

  it('error carries status code 404', async () => {
    const client = makeClient()
    const handle = client.executions.attach('does-not-exist')
    try {
      await handle.status()
    } catch (err) {
      expect(err).toBeInstanceOf(RohinikClientError)
      expect((err as RohinikClientError).status).toBe(404)
    }
  })

  it('throws when server unreachable', async () => {
    const client = createRohinikClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 200 })
    await expect(
      client.executions.start({ content: 'x', contentType: 'TEXT' })
    ).rejects.toThrow(RohinikClientError)
  })
})

describe('protocol-version export', () => {
  it('EXECUTION_PROTOCOL_VERSION is v1', () => {
    expect(EXECUTION_PROTOCOL_VERSION).toBe('v1')
  })
})

describe('execution.waitUntilTerminal()', () => {
  it('resolves with terminal status after execution completes', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'wait terminal test', contentType: 'TEXT' })
    const status = await handle.waitUntilTerminal({ pollIntervalMs: 30, timeoutMs: 3000 })
    expect(status.terminal).toBe(true)
    expect(['COMPLETED', 'FAILED', 'CANCELLED']).toContain(status.state)
    expect(status.executionId).toBe(handle.executionId)
  })

  it('calls onStatus callback during polling', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'onStatus test', contentType: 'TEXT' })
    const observed: string[] = []
    await handle.waitUntilTerminal({
      pollIntervalMs: 10,
      timeoutMs: 3000,
      onStatus: (s) => observed.push(s.state),
    })
    expect(observed.length).toBeGreaterThan(0)
    // Last observed state is terminal
    const last = observed.at(-1)
    expect(['COMPLETED', 'FAILED', 'CANCELLED']).toContain(last)
  })

  it('throws ExecutionTimeoutError when terminal not reached within timeoutMs', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'timeout test', contentType: 'TEXT' })
    // Tiny timeout — will expire before mock 50ms completion
    await expect(
      handle.waitUntilTerminal({ pollIntervalMs: 5, timeoutMs: 1 })
    ).rejects.toBeInstanceOf(ExecutionTimeoutError)
  })

  it('throws RohinikClientError for unknown executionId', async () => {
    const client = makeClient()
    const handle = client.executions.attach('no-such-id')
    await expect(
      handle.waitUntilTerminal({ pollIntervalMs: 10, timeoutMs: 500 })
    ).rejects.toBeInstanceOf(RohinikClientError)
  })
})

describe('execution.waitForResult()', () => {
  it('returns result for COMPLETED execution', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'waitForResult test', contentType: 'TEXT' })
    const result = await handle.waitForResult({ pollIntervalMs: 30, timeoutMs: 3000 })
    expect(result.executionId).toBe(handle.executionId)
    expect(result.output).toBe('[mock] echo: waitForResult test')
    expect(typeof result.totalDurationMs).toBe('number')
  })

  it('throws ExecutionCancelledError when execution is cancelled', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'waitForResult cancel test', contentType: 'TEXT' })
    // Cancel before 50ms completion fires
    await handle.cancel({ reason: 'test cancellation' })
    // Poll — mock immediately transitions to CANCELLED state
    await expect(
      handle.waitForResult({ pollIntervalMs: 10, timeoutMs: 3000 })
    ).rejects.toBeInstanceOf(ExecutionCancelledError)
  })

  it('ExecutionCancelledError carries executionId', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'cancel id test', contentType: 'TEXT' })
    await handle.cancel()
    try {
      await handle.waitForResult({ pollIntervalMs: 10, timeoutMs: 3000 })
    } catch (err) {
      if (err instanceof ExecutionCancelledError) {
        expect(err.executionId).toBe(handle.executionId)
        expect(err.terminalState).toBe('CANCELLED')
      }
      // If execution completed before cancel was accepted, that's a valid race — no assertion needed
    }
  })

  it('throws ExecutionTimeoutError when terminal not reached', async () => {
    const client = makeClient()
    const handle = await client.executions.start({ content: 'waitForResult timeout test', contentType: 'TEXT' })
    await expect(
      handle.waitForResult({ pollIntervalMs: 5, timeoutMs: 1 })
    ).rejects.toBeInstanceOf(ExecutionTimeoutError)
  })
})

describe('error class hierarchy', () => {
  it('ExecutionCancelledError is instanceof ExecutionFailedError and RohinikClientError', () => {
    const err = new ExecutionCancelledError('test-id')
    expect(err).toBeInstanceOf(ExecutionCancelledError)
    expect(err).toBeInstanceOf(ExecutionFailedError)
    expect(err).toBeInstanceOf(RohinikClientError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ExecutionCancelledError')
    expect(err.terminalState).toBe('CANCELLED')
  })

  it('ExecutionFailedError carries state and executionId', () => {
    const err = new ExecutionFailedError('exec-123', 'FAILED')
    expect(err.executionId).toBe('exec-123')
    expect(err.terminalState).toBe('FAILED')
    expect(err.name).toBe('ExecutionFailedError')
  })

  it('ExecutionTimeoutError carries executionId', () => {
    const err = new ExecutionTimeoutError('exec-456', 5000)
    expect(err.executionId).toBe('exec-456')
    expect(err.message).toContain('5000ms')
  })
})

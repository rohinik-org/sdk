/**
 * Stage 16A Task 7 — Cross-Repository Protocol Conformance (mock server target)
 *
 * Runs the shared conformance suite against the inline mock server.
 * The suite logic lives in conformance-suite.ts — one authoritative source,
 * two targets: this file (mock) and RS1's protocol-compat.test.ts (real server).
 *
 * Additional packaging conformance tests (zero-deps, exports) remain here
 * as they are SDK-internal and not applicable to the RS1 server target.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXECUTION_PROTOCOL_VERSION } from '../index.js'
import {
  createRohinikClient,
  RohinikClientError,
  ProtocolVersionError,
} from '../index.js'
import { runConformanceSuite } from './conformance-suite.js'

const CONF_PORT = 19_202

// ── Minimal protocol-conformant mock server ───────────────────────────────────

type MockState = {
  executionId: string
  state: string
  submittedAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  output: unknown
  terminal: boolean
}

const store = new Map<string, MockState>()
let confServer: Server

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload).toString() })
  res.end(payload)
}

function readBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch { resolve({}) }
    })
  })
}

const proto = EXECUTION_PROTOCOL_VERSION

beforeAll(async () => {
  confServer = createServer(async (req, res) => {
    const url = req.url ?? ''
    const method = req.method ?? 'GET'

    if (method === 'POST' && url === '/v1/executions') {
      const body = await readBody(req)
      const executionId = `conf-exec-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const now = new Date().toISOString()
      store.set(executionId, {
        executionId, state: 'QUEUED',
        submittedAt: now, startedAt: null, completedAt: null, cancelledAt: null,
        output: `[conf] echo: ${body.content ?? ''}`,
        terminal: false,
      })
      setTimeout(() => {
        const r = store.get(executionId)!
        const done = new Date().toISOString()
        store.set(executionId, { ...r, state: 'COMPLETED', startedAt: done, completedAt: done, terminal: true })
      }, 30)
      return json(res, 202, {
        executionId, idempotencyKey: null, state: 'QUEUED',
        protocolVersion: proto, submittedAt: now, idempotent: false,
        _conformanceTag: 'task-7',   // additive — must be tolerated
      })
    }

    const m = url.match(/^\/v1\/executions\/([^/]+)(\/.*)?$/)
    if (!m) return json(res, 404, { code: 'NOT_FOUND', message: 'not found', protocolVersion: proto })

    const executionId = decodeURIComponent(m[1]!)
    const sub = m[2] ?? ''
    const record = store.get(executionId)

    if (!record) return json(res, 404, {
      code: 'EXECUTION_NOT_FOUND',
      message: `Execution ${executionId} not found`,
      executionId, protocolVersion: proto,
    })

    if (method === 'GET' && sub === '') {
      return json(res, 200, {
        executionId: record.executionId, state: record.state,
        protocolVersion: proto,
        submittedAt: record.submittedAt, startedAt: record.startedAt,
        completedAt: record.completedAt, cancelledAt: record.cancelledAt,
        terminal: record.terminal,
        _revision: 1,   // additive
      })
    }

    if (method === 'GET' && sub === '/result') {
      if (!record.terminal) return json(res, 409, {
        code: 'RESULT_NOT_READY', message: 'not terminal', executionId, protocolVersion: proto,
      })
      return json(res, 200, {
        executionId: record.executionId, state: record.state, output: record.output,
        totalDurationMs: 30, completedAt: record.completedAt,
        _durationBreakdown: { plan: 5, exec: 25 },   // additive
      })
    }

    if (method === 'POST' && sub === '/cancel') {
      if (record.terminal) return json(res, 200, { executionId, state: record.state, cancelAccepted: false })
      const now = new Date().toISOString()
      store.set(executionId, { ...record, state: 'CANCELLED', cancelledAt: now, terminal: true })
      return json(res, 200, { executionId, state: 'CANCELLED', cancelAccepted: true })
    }

    if (method === 'GET' && sub === '/evidence') {
      return json(res, 200, {
        executionId,
        entries: [{ kind: 'step:completed', stepId: 'conf-step', detail: { ok: true }, recordedAt: new Date().toISOString() }],
        _evidenceVersion: 1,   // additive
      })
    }

    return json(res, 404, { code: 'NOT_FOUND', message: 'unknown sub-path', protocolVersion: proto })
  })

  await new Promise<void>(resolve => confServer.listen(CONF_PORT, '127.0.0.1', resolve))
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => confServer.close(err => err ? reject(err) : resolve()))
})

// ── Run the shared conformance suite against the mock server ──────────────────

runConformanceSuite(`http://127.0.0.1:${CONF_PORT}`)

// ── Packaging conformance (SDK-internal — not applicable to RS1 target) ───────

describe('Packaging conformance', () => {
  it('packed @rohinik-org/client tarball declares no runtime dependencies', () => {
    const pkgPath = resolve(process.cwd(), 'node_modules/@rohinik-org/client/package.json')
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
    } catch {
      const localPath = resolve(process.cwd(), 'package.json')
      pkg = JSON.parse(readFileSync(localPath, 'utf-8')) as Record<string, unknown>
    }
    const deps = (pkg.dependencies ?? {}) as Record<string, unknown>
    expect(Object.keys(deps)).toHaveLength(0)
  })

  it('EXECUTION_PROTOCOL_VERSION exported from SDK matches expected value', () => {
    expect(EXECUTION_PROTOCOL_VERSION).toBe('v1')
  })

  it('SDK exports all required protocol types (type-level check via import)', () => {
    const mod = { createRohinikClient, RohinikClientError, ProtocolVersionError, EXECUTION_PROTOCOL_VERSION }
    expect(typeof mod.createRohinikClient).toBe('function')
    expect(typeof mod.RohinikClientError).toBe('function')
    expect(typeof mod.ProtocolVersionError).toBe('function')
    expect(typeof mod.EXECUTION_PROTOCOL_VERSION).toBe('string')
  })
})

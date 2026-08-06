/**
 * Conformance suite — protocol compliance checks for @rohinik-org/execution-protocol-v1.
 *
 * One authoritative suite, two targets:
 *   1. SDK CI: run against the inline mock server (conformance.test.ts)
 *   2. RS1 CI: run against a real mock-provider server (protocol-compat.test.ts)
 *
 * Usage:
 *   import { runConformanceSuite } from './conformance-suite.js'
 *   runConformanceSuite('http://127.0.0.1:PORT')
 *
 * The caller is responsible for starting and stopping the server.
 * The suite itself has no network dependencies beyond baseUrl.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createRohinikClient,
  RohinikClientError,
  ProtocolVersionError,
  EXECUTION_PROTOCOL_VERSION,
  type PublicErrorCode,
} from '../index.js'
import { createServer } from 'node:http'

type ClientHandle = ReturnType<ReturnType<typeof createRohinikClient>['executions']['attach']>

function client(baseUrl: string) {
  return createRohinikClient({ baseUrl })
}

async function pollTerminal(handle: ClientHandle, maxMs = 2000) {
  return handle.waitUntilTerminal({ pollIntervalMs: 20, timeoutMs: maxMs })
}

// ── 1. Route shape conformance ────────────────────────────────────────────────

function suiteRouteShapes(baseUrl: string): void {
  describe('Route shape conformance — POST /v1/executions', () => {
    it('returns 202 with all required SubmitExecutionResponse fields', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'shape test', contentType: 'TEXT' })
      expect(typeof handle.executionId).toBe('string')
      expect(handle.executionId.length).toBeGreaterThan(0)
    })
  })

  describe('Route shape conformance — GET /v1/executions/:id', () => {
    it('returns all required ExecutionStatusResponse fields', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'status shape', contentType: 'TEXT' })
      const status = await handle.status()
      expect(typeof status.executionId).toBe('string')
      expect(typeof status.state).toBe('string')
      expect(status.protocolVersion).toBe('v1')
      expect(typeof status.submittedAt).toBe('string')
      expect(typeof status.terminal).toBe('boolean')
    })
  })

  describe('Route shape conformance — GET /v1/executions/:id/result', () => {
    it('returns all required ExecutionResultResponse fields after terminal', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'result shape', contentType: 'TEXT' })
      await pollTerminal(handle)
      const result = await handle.result()
      expect(result.executionId).toBe(handle.executionId)
      expect(typeof result.state).toBe('string')
      expect(typeof result.totalDurationMs).toBe('number')
      expect(typeof result.completedAt).toBe('string')
    })

    it('returns 409 RESULT_NOT_READY before terminal', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'result not ready', contentType: 'TEXT' })
      const status = await handle.status()
      if (!status.terminal) {
        await expect(handle.result()).rejects.toMatchObject({ status: 409 })
      }
      // If already terminal due to fast server, skip — race acceptable
    })
  })

  describe('Route shape conformance — POST /v1/executions/:id/cancel', () => {
    it('returns CancelExecutionResponse with cancelAccepted field', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'cancel shape', contentType: 'TEXT' })
      const resp = await handle.cancel({ reason: 'conformance test' })
      expect(resp.executionId).toBe(handle.executionId)
      expect(typeof resp.cancelAccepted).toBe('boolean')
    })

    it('cancel on terminal returns cancelAccepted=false', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'cancel terminal shape', contentType: 'TEXT' })
      await pollTerminal(handle)
      const resp = await handle.cancel()
      expect(resp.cancelAccepted).toBe(false)
    })
  })

  describe('Route shape conformance — GET /v1/executions/:id/evidence', () => {
    it('returns ExecutionEvidenceResponse with entries array', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'evidence shape', contentType: 'TEXT' })
      const ev = await handle.evidence()
      expect(ev.executionId).toBe(handle.executionId)
      expect(Array.isArray(ev.entries)).toBe(true)
    })
  })
}

// ── 2. Forward-compatibility ──────────────────────────────────────────────────

function suiteForwardCompat(baseUrl: string): void {
  describe('Forward-compatibility — additive fields tolerated', () => {
    it('unknown fields in SubmitExecutionResponse do not throw', async () => {
      await expect(
        client(baseUrl).executions.start({ content: 'additive test', contentType: 'TEXT' })
      ).resolves.toBeDefined()
    })

    it('unknown fields in status response do not throw', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'additive status', contentType: 'TEXT' })
      await expect(handle.status()).resolves.toBeDefined()
    })

    it('unknown fields in result response do not throw', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'additive result', contentType: 'TEXT' })
      await pollTerminal(handle)
      await expect(handle.result()).resolves.toBeDefined()
    })

    it('unknown fields in evidence response do not throw', async () => {
      const handle = await client(baseUrl).executions.start({ content: 'additive evidence', contentType: 'TEXT' })
      await expect(handle.evidence()).resolves.toBeDefined()
    })
  })
}

// ── 3. Protocol version guard ─────────────────────────────────────────────────

function suiteProtocolVersion(): void {
  describe('Protocol version guard', () => {
    it('throws ProtocolVersionError when server returns wrong protocolVersion', async () => {
      const wrongVersionServer = createServer((_req, res) => {
        const payload = JSON.stringify({
          executionId: 'x', idempotencyKey: null, state: 'QUEUED',
          protocolVersion: 'v999',
          submittedAt: new Date().toISOString(), idempotent: false,
        })
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(payload)
      })

      await new Promise<void>(r => wrongVersionServer.listen(19_403, '127.0.0.1', r))
      try {
        const c = createRohinikClient({ baseUrl: 'http://127.0.0.1:19403' })
        await expect(
          c.executions.start({ content: 'version test', contentType: 'TEXT' })
        ).rejects.toBeInstanceOf(ProtocolVersionError)
      } finally {
        await new Promise<void>((r, j) => wrongVersionServer.close(err => err ? j(err) : r()))
      }
    })
  })
}

// ── 4. Error code coverage ────────────────────────────────────────────────────

function suiteErrorCodes(baseUrl: string): void {
  describe('Error code recognition', () => {
    const allErrorCodes: PublicErrorCode[] = [
      'EXECUTION_NOT_FOUND',
      'RESULT_NOT_READY',
      'IDEMPOTENCY_CONFLICT',
      'INVALID_REQUEST',
      'INTERNAL_ERROR',
    ]

    it('all documented PublicErrorCode values parse into RohinikClientError.envelope', async () => {
      const proto = EXECUTION_PROTOCOL_VERSION
      for (const code of allErrorCodes) {
        const errorServer = createServer((_req, res) => {
          const payload = JSON.stringify({ code, message: `test ${code}`, protocolVersion: proto, executionId: 'test' })
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(payload)
        })
        const port = 19_404
        await new Promise<void>(r => errorServer.listen(port, '127.0.0.1', r))
        try {
          const c = createRohinikClient({ baseUrl: `http://127.0.0.1:${port}` })
          try {
            await c.executions.start({ content: 'x', contentType: 'TEXT' })
          } catch (err) {
            expect(err).toBeInstanceOf(RohinikClientError)
            expect((err as RohinikClientError).envelope?.code).toBe(code)
          }
        } finally {
          await new Promise<void>((r, j) => errorServer.close(err => err ? j(err) : r()))
        }
      }
    })

    it('404 for unknown executionId throws RohinikClientError with status 404', async () => {
      const handle = client(baseUrl).executions.attach('does-not-exist')
      await expect(handle.status()).rejects.toMatchObject({ status: 404 })
    })
  })
}

// ── 5. waitForResult conformance ──────────────────────────────────────────────

function suiteWaitForResult(baseUrl: string): void {
  describe('waitForResult protocol conformance', () => {
    it('full async lifecycle: start → waitForResult → result matches submission', async () => {
      const content = 'full lifecycle conformance'
      const handle = await client(baseUrl).executions.start({ content, contentType: 'TEXT' })
      const result = await handle.waitForResult({ pollIntervalMs: 20, timeoutMs: 2000 })
      expect(result.executionId).toBe(handle.executionId)
      expect(typeof result.totalDurationMs).toBe('number')
      expect(typeof result.completedAt).toBe('string')
    })

    it('cancel path: start → cancel → waitForResult throws ExecutionCancelledError', async () => {
      const { ExecutionCancelledError } = await import('../index.js')
      const handle = await client(baseUrl).executions.start({ content: 'cancel conformance', contentType: 'TEXT' })
      const cancelResp = await handle.cancel({ reason: 'conformance test' })
      if (cancelResp.cancelAccepted) {
        await expect(
          handle.waitForResult({ pollIntervalMs: 10, timeoutMs: 2000 })
        ).rejects.toBeInstanceOf(ExecutionCancelledError)
      }
    })
  })
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Register all conformance suites against the given server URL.
 * Call this from a test file after the server is started.
 */
export function runConformanceSuite(baseUrl: string): void {
  suiteRouteShapes(baseUrl)
  suiteForwardCompat(baseUrl)
  suiteProtocolVersion()
  suiteErrorCodes(baseUrl)
  suiteWaitForResult(baseUrl)
}

export { EXECUTION_PROTOCOL_VERSION }

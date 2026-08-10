/**
 * Deterministic context factories for capability testing.
 *
 * Re-uses the real ExecutionContext shape from capability-manifest.
 * Does NOT emulate private RS1 scheduler, registry, or policy internals.
 */

import { createDeterministicIds } from './fixtures.js'

export interface TestCapabilityContextOptions {
  readonly requestId?:    string
  readonly executionId?:  string
  readonly sessionId?:    string
  readonly workspaceId?:  string
  readonly permissions?:  readonly string[]
  readonly signal?:       AbortSignal
}

export interface TestCapabilityContext {
  readonly requestId:   string
  readonly executionId: string
  readonly sessionId:   string
  readonly workspaceId: string
  readonly permissions: readonly string[]
  readonly signal?:     AbortSignal
}

export function createTestCapabilityContext(
  opts: TestCapabilityContextOptions = {},
  ids?: { next(): string },
): TestCapabilityContext {
  const gen = ids ?? createDeterministicIds()
  return Object.freeze({
    requestId:   opts.requestId   ?? gen.next(),
    executionId: opts.executionId ?? gen.next(),
    sessionId:   opts.sessionId   ?? gen.next(),
    workspaceId: opts.workspaceId ?? 'test-workspace',
    permissions: Object.freeze([...(opts.permissions ?? [])]),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  })
}

/**
 * Deterministic context factory for agent testing.
 */

export interface TestAgentContextOptions {
  readonly workspaceId?: string
  readonly goalLabel?:   string
  readonly params?:      Readonly<Record<string, unknown>>
  readonly signal?:      AbortSignal
}

export interface TestAgentContext {
  readonly workspaceId: string
  readonly goalLabel?:  string
  readonly params:      Readonly<Record<string, unknown>>
  readonly signal?:     AbortSignal
}

export function createTestAgentContext(
  opts: TestAgentContextOptions = {},
): TestAgentContext {
  return Object.freeze({
    workspaceId: opts.workspaceId ?? 'test-workspace',
    ...(opts.goalLabel !== undefined ? { goalLabel: opts.goalLabel } : {}),
    params:      Object.freeze({ ...(opts.params ?? {}) }),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  })
}

// @rohinik-org/testing — public API

export { createTestCapabilityContext }           from './capability-context.js'
export type { TestCapabilityContext, TestCapabilityContextOptions } from './capability-context.js'

export { createTestAgentContext }                from './agent-context.js'
export type { TestAgentContext, TestAgentContextOptions } from './agent-context.js'

export { createTestProviderContext }             from './provider-context.js'
export type { TestProviderContextOptions }       from './provider-context.js'

export { createDeterministicIds, createFakeClock } from './fixtures.js'

export {
  assertValidCapability,
  assertValidAgent,
  assertValidProvider,
  assertValidPackage,
}                                                from './assert.js'

export {
  createMockExecutionClient,
  PublicEventKind,
  PublicExecutionState,
}                                                from './mock-client.js'
export type {
  MockExecutionClient,
  MockExecutionClientOptions,
  MockEventSequence,
  ExecutionEvent,
  ExecutionStatus,
  ExecutionResult,
}                                                from './mock-client.js'

export { createMockProvider }                    from './mock-provider.js'
export type { MockProviderOptions }              from './mock-provider.js'

export { ExecutionEventBuilder }                 from './event-fixtures.js'
export type { EventFixtureOptions }              from './event-fixtures.js'

export type {
  TypedResultPayload,
  DelegationPayload,
  ControlCheckpointPayload,
}                                                from './protocol.js'

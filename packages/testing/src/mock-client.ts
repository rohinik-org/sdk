/**
 * createMockExecutionClient — returns a client-shaped object that emits
 * pre-programmed event sequences using real PublicEventKind / PublicExecutionState
 * values.
 *
 * Does NOT emulate RS1 agent runtime, scheduling, or admission.
 * Useful for testing code that consumes execution events.
 */

import {
  PublicEventKind,
  PublicExecutionState,
  type ExecutionEvent,
  type ExecutionStatus,
  type ExecutionResult,
} from './protocol.js'
import { createDeterministicIds, createFakeClock } from './fixtures.js'

export type MockEventSequence = Array<
  | { kind: typeof PublicEventKind.EXECUTION_ACCEPTED }
  | { kind: typeof PublicEventKind.EXECUTION_ADMITTED }
  | { kind: typeof PublicEventKind.EXECUTION_STARTED }
  | { kind: typeof PublicEventKind.PARTIAL_OUTPUT;    text: string }
  | { kind: typeof PublicEventKind.PROGRESS;          pct: number }
  | { kind: typeof PublicEventKind.USAGE_OBSERVED;    inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { kind: typeof PublicEventKind.WAITING;           reason: string }
  | { kind: typeof PublicEventKind.EXECUTION_COMPLETED }
  | { kind: typeof PublicEventKind.EXECUTION_FAILED;  message: string }
  | { kind: typeof PublicEventKind.EXECUTION_CANCELLED }
>

export interface MockExecutionClientOptions {
  readonly executionId?:  string
  readonly sequence?:     MockEventSequence
  readonly result?:       unknown
  readonly clock?:        ReturnType<typeof createFakeClock>
  readonly ids?:          ReturnType<typeof createDeterministicIds>
}

const DEFAULT_SEQUENCE: MockEventSequence = [
  { kind: PublicEventKind.EXECUTION_ACCEPTED },
  { kind: PublicEventKind.EXECUTION_ADMITTED },
  { kind: PublicEventKind.EXECUTION_STARTED },
  { kind: PublicEventKind.EXECUTION_COMPLETED },
]

function eventFromStep(
  step:        MockEventSequence[number],
  executionId: string,
  seq:         number,
  clock:       ReturnType<typeof createFakeClock>,
): ExecutionEvent {
  const ts   = clock.toISOString()
  clock.tick()
  const base = { sequence: seq, executionId, occurredAt: ts, cursor: `c-${seq}` }

  switch (step.kind) {
    case PublicEventKind.EXECUTION_ACCEPTED:
      return { ...base, kind: step.kind, payload: { submittedAt: ts } }
    case PublicEventKind.EXECUTION_ADMITTED:
      return { ...base, kind: step.kind, payload: { admittedAt: ts } }
    case PublicEventKind.EXECUTION_STARTED:
      return { ...base, kind: step.kind, payload: { startedAt: ts } }
    case PublicEventKind.PARTIAL_OUTPUT:
      return { ...base, kind: step.kind, payload: { delta: step.text } }
    case PublicEventKind.PROGRESS:
      return { ...base, kind: step.kind, payload: { progressPct: step.pct, message: '' } }
    case PublicEventKind.USAGE_OBSERVED:
      return { ...base, kind: step.kind, payload: { inputTokens: step.inputTokens, outputTokens: step.outputTokens, totalTokens: step.totalTokens } }
    case PublicEventKind.WAITING:
      return { ...base, kind: step.kind, payload: { reason: step.reason } }
    case PublicEventKind.EXECUTION_COMPLETED:
      return { ...base, kind: step.kind, payload: { completedAt: ts } }
    case PublicEventKind.EXECUTION_FAILED:
      return { ...base, kind: step.kind, payload: { failedAt: ts, message: step.message } }
    case PublicEventKind.EXECUTION_CANCELLED:
      return { ...base, kind: step.kind, payload: { cancelledAt: ts } }
  }
}

export interface MockExecutionClient {
  readonly executionId: string
  events(): AsyncIterable<ExecutionEvent>
  status(): Promise<ExecutionStatus>
  result(): Promise<ExecutionResult>
}

export function createMockExecutionClient(opts: MockExecutionClientOptions = {}): MockExecutionClient {
  const ids   = opts.ids   ?? createDeterministicIds('exec')
  const clock = opts.clock ?? createFakeClock()
  const executionId = opts.executionId ?? ids.next()
  const seq   = opts.sequence ?? DEFAULT_SEQUENCE

  const builtEvents = seq.map((step, i) => eventFromStep(step, executionId, i, clock))

  const terminalStep = [...seq].reverse().find(s =>
    s.kind === PublicEventKind.EXECUTION_COMPLETED ||
    s.kind === PublicEventKind.EXECUTION_FAILED ||
    s.kind === PublicEventKind.EXECUTION_CANCELLED
  )

  const state =
    terminalStep?.kind === PublicEventKind.EXECUTION_COMPLETED  ? PublicExecutionState.COMPLETED  :
    terminalStep?.kind === PublicEventKind.EXECUTION_FAILED     ? PublicExecutionState.FAILED      :
    terminalStep?.kind === PublicEventKind.EXECUTION_CANCELLED  ? PublicExecutionState.CANCELLED   :
    PublicExecutionState.RUNNING

  return {
    executionId,
    async *events() { for (const ev of builtEvents) yield ev },
    async status(): Promise<ExecutionStatus> {
      return { executionId, state, cursor: `c-${builtEvents.length - 1}` }
    },
    async result(): Promise<ExecutionResult> {
      return { executionId, state, output: opts.result ?? null }
    },
  }
}

export { PublicEventKind, PublicExecutionState }
export type { ExecutionEvent, ExecutionStatus, ExecutionResult }

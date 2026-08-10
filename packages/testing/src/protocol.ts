/**
 * Execution protocol constants used in testing fixtures.
 * Mirrors @rohinik-org/execution-protocol-v1 public surface.
 *
 * Defined locally to avoid transitive resolution of bundled sub-deps.
 */

export const PublicEventKind = Object.freeze({
  EXECUTION_ACCEPTED:       'EXECUTION_ACCEPTED',
  EXECUTION_ADMITTED:       'EXECUTION_ADMITTED',
  EXECUTION_STARTED:        'EXECUTION_STARTED',
  STATUS_CHANGED:           'STATUS_CHANGED',
  PROGRESS:                 'PROGRESS',
  PARTIAL_OUTPUT:           'PARTIAL_OUTPUT',
  USAGE_OBSERVED:           'USAGE_OBSERVED',
  WAITING:                  'WAITING',
  CANCELLATION_REQUESTED:   'CANCELLATION_REQUESTED',
  EXECUTION_COMPLETED:      'EXECUTION_COMPLETED',
  EXECUTION_FAILED:         'EXECUTION_FAILED',
  EXECUTION_CANCELLED:      'EXECUTION_CANCELLED',
} as const)

export type PublicEventKindValue = (typeof PublicEventKind)[keyof typeof PublicEventKind]

export const PublicExecutionState = Object.freeze({
  PENDING:    'PENDING',
  ADMITTED:   'ADMITTED',
  RUNNING:    'RUNNING',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED',
  CANCELLED:  'CANCELLED',
} as const)

export type PublicExecutionStateValue = (typeof PublicExecutionState)[keyof typeof PublicExecutionState]

export interface ExecutionEvent {
  readonly kind:        string
  readonly sequence:    number
  readonly executionId: string
  readonly occurredAt:  string
  readonly cursor:      string
  readonly payload:     Record<string, unknown>
}

export interface ExecutionStatus {
  readonly executionId: string
  readonly state:       string
  readonly cursor:      string
}

export interface ExecutionResult {
  readonly executionId: string
  readonly state:       string
  readonly output:      unknown
}

/** RPC schema for typed output — payload shape for structured results */
export interface TypedResultPayload<T = unknown> {
  readonly value:  T
  readonly schema: string
}

/** Delegation event payload */
export interface DelegationPayload {
  readonly delegationId:   string
  readonly childAgentId:   string
  readonly depth:          number
  readonly maxDepth:       number
}

/** Control approval/verification checkpoint payload */
export interface ControlCheckpointPayload {
  readonly workflowId:   string
  readonly checkpointId: string
  readonly state:        string
}

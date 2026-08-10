/**
 * Stage 16 execution event fixtures — typed builders for all key surfaces:
 *   - execution lifecycle (Stage 16A/B)
 *   - streaming partial output (Stage 16B)
 *   - typed/schema result (Stage 16C)
 *   - delegation (Stage 16D)
 *   - control approval/verification/recovery (Stage 16E)
 */

import { PublicEventKind, type ExecutionEvent } from './protocol.js'
import { createFakeClock } from './fixtures.js'

export interface EventFixtureOptions {
  readonly executionId?: string
  readonly clock?:       ReturnType<typeof createFakeClock>
}

export class ExecutionEventBuilder {
  private seq = 0
  readonly executionId: string
  private readonly clock: ReturnType<typeof createFakeClock>

  constructor(opts: EventFixtureOptions = {}) {
    this.executionId = opts.executionId ?? 'test-execution-id'
    this.clock       = opts.clock ?? createFakeClock()
  }

  private base(kind: string): Omit<ExecutionEvent, 'payload'> {
    const ev = {
      kind,
      sequence:    this.seq++,
      executionId: this.executionId,
      occurredAt:  this.clock.toISOString(),
      cursor:      `c-${this.seq - 1}`,
    }
    this.clock.tick()
    return ev
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  accepted():  ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_ACCEPTED)
    return { ...b, payload: { submittedAt: b.occurredAt } }
  }
  admitted():  ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_ADMITTED)
    return { ...b, payload: { admittedAt: b.occurredAt } }
  }
  started():   ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_STARTED)
    return { ...b, payload: { startedAt: b.occurredAt } }
  }
  completed(): ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_COMPLETED)
    return { ...b, payload: { completedAt: b.occurredAt } }
  }
  failed(message: string): ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_FAILED)
    return { ...b, payload: { failedAt: b.occurredAt, message } }
  }
  cancelled(): ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_CANCELLED)
    return { ...b, payload: { cancelledAt: b.occurredAt } }
  }

  // ── Progress / streaming ────────────────────────────────────────────────────

  progress(pct: number, msg = ''): ExecutionEvent {
    return { ...this.base(PublicEventKind.PROGRESS), payload: { progressPct: pct, message: msg } }
  }
  partialOutput(delta: string): ExecutionEvent {
    return { ...this.base(PublicEventKind.PARTIAL_OUTPUT), payload: { delta } }
  }

  // ── Usage / telemetry ───────────────────────────────────────────────────────

  usageObserved(tokens: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): ExecutionEvent {
    return { ...this.base(PublicEventKind.USAGE_OBSERVED), payload: tokens }
  }

  // ── Control / waiting ───────────────────────────────────────────────────────

  waiting(reason: string): ExecutionEvent {
    return { ...this.base(PublicEventKind.WAITING), payload: { reason } }
  }

  // ── Typed result (Stage 16C) — embedded in EXECUTION_COMPLETED payload ──────

  completedWithSchema<T>(value: T, schema: string): ExecutionEvent {
    const b = this.base(PublicEventKind.EXECUTION_COMPLETED)
    return { ...b, payload: { completedAt: b.occurredAt, typedResult: { value, schema } } }
  }

  // ── Delegation (Stage 16D) — in PROGRESS payload ───────────────────────────

  delegating(opts: { delegationId: string; childAgentId: string; depth: number; maxDepth: number }): ExecutionEvent {
    return {
      ...this.base(PublicEventKind.PROGRESS),
      payload: { progressPct: 0, message: 'delegating', delegation: opts },
    }
  }

  // ── Control checkpoints (Stage 16E) — in WAITING payload ───────────────────

  controlApprovalPending(workflowId: string, checkpointId: string): ExecutionEvent {
    return {
      ...this.base(PublicEventKind.WAITING),
      payload: { reason: 'awaiting-control-approval', workflowId, checkpointId, state: 'PENDING_APPROVAL' },
    }
  }
  controlApproved(workflowId: string, checkpointId: string): ExecutionEvent {
    return {
      ...this.base(PublicEventKind.STATUS_CHANGED),
      payload: { previousState: 'PENDING_APPROVAL', newState: 'APPROVED', workflowId, checkpointId },
    }
  }
  controlVerificationFailed(workflowId: string, checkpointId: string, reason: string): ExecutionEvent {
    return {
      ...this.base(PublicEventKind.STATUS_CHANGED),
      payload: { previousState: 'APPROVED', newState: 'VERIFICATION_FAILED', workflowId, checkpointId, reason },
    }
  }
  controlRecovering(workflowId: string, strategy: string): ExecutionEvent {
    return {
      ...this.base(PublicEventKind.STATUS_CHANGED),
      payload: { previousState: 'VERIFICATION_FAILED', newState: 'RECOVERING', workflowId, strategy },
    }
  }

  // ── Composite paths ─────────────────────────────────────────────────────────

  goldenPath():                          ExecutionEvent[] {
    return [this.accepted(), this.admitted(), this.started(), this.completed()]
  }
  streamingPath(chunks: string[]):       ExecutionEvent[] {
    return [this.accepted(), this.admitted(), this.started(), ...chunks.map(c => this.partialOutput(c)), this.completed()]
  }
  delegationPath(delegationId: string, childAgentId: string): ExecutionEvent[] {
    return [
      this.accepted(), this.admitted(), this.started(),
      this.delegating({ delegationId, childAgentId, depth: 1, maxDepth: 3 }),
      this.completed(),
    ]
  }
  controlApprovalPath(workflowId: string, checkpointId: string): ExecutionEvent[] {
    return [
      this.accepted(),
      this.controlApprovalPending(workflowId, checkpointId),
      this.controlApproved(workflowId, checkpointId),
      this.admitted(), this.started(), this.completed(),
    ]
  }
}

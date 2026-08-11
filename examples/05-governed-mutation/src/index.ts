/**
 * Handle control approval checkpoints that appear when a governed execution
 * requests human or automated approval before proceeding.
 *
 * An execution under a control workflow emits WAITING events with
 * reason = 'awaiting-control-approval'. After the approval is granted
 * (via the control plane API), a STATUS_CHANGED event arrives and the
 * execution resumes.
 *
 * packed ≠ published ≠ trusted ≠ installed — the same constitutional
 * separation applies to control authority: receiving an approval event
 * does not mean the mutation was applied.
 */

export interface ApprovalCheckpoint {
  readonly workflowId:   string
  readonly checkpointId: string
  readonly observedAt:   string
  readonly approved:     boolean
}

export interface GovernedExecutionTrace {
  readonly eventCount:   number
  readonly checkpoints:  ApprovalCheckpoint[]
  readonly completed:    boolean
}

export async function traceGovernedExecution(
  events: AsyncIterable<{ kind: string; occurredAt: string; payload: Record<string, unknown> }>,
): Promise<GovernedExecutionTrace> {
  const checkpoints: ApprovalCheckpoint[] = []
  const pending = new Map<string, { workflowId: string; checkpointId: string; observedAt: string }>()
  let eventCount = 0
  let completed  = false

  for await (const ev of events) {
    eventCount++

    if (ev.kind === 'WAITING' && ev.payload['reason'] === 'awaiting-control-approval') {
      const wf = ev.payload['workflowId']   as string
      const cp = ev.payload['checkpointId'] as string
      pending.set(`${wf}:${cp}`, { workflowId: wf, checkpointId: cp, observedAt: ev.occurredAt })
    }

    if (ev.kind === 'STATUS_CHANGED' && ev.payload['newState'] === 'APPROVED') {
      const wf  = ev.payload['workflowId']   as string
      const cp  = ev.payload['checkpointId'] as string
      const key = `${wf}:${cp}`
      const p   = pending.get(key)
      if (p) {
        checkpoints.push({ ...p, approved: true })
        pending.delete(key)
      }
    }

    if (ev.kind === 'EXECUTION_COMPLETED') completed = true
  }

  // Any still-pending checkpoints were never approved
  for (const p of pending.values()) {
    checkpoints.push({ ...p, approved: false })
  }

  return { eventCount, checkpoints, completed }
}

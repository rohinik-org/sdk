/**
 * Observe delegation events produced when an orchestrator agent hands off
 * to a sub-agent mid-execution.
 *
 * In production this works the same way: consume events() and inspect the
 * PROGRESS event payload for a delegation object.
 */

export interface DelegationObservation {
  readonly delegationId:  string
  readonly childAgentId:  string
  readonly depth:         number
  readonly maxDepth:      number
  readonly observedAt:    string
}

export interface ExecutionTrace {
  readonly eventCount:   number
  readonly delegations:  DelegationObservation[]
  readonly completed:    boolean
}

export async function traceDelegations(
  events: AsyncIterable<{ kind: string; occurredAt: string; payload: Record<string, unknown> }>,
): Promise<ExecutionTrace> {
  const delegations: DelegationObservation[] = []
  let eventCount = 0
  let completed  = false

  for await (const ev of events) {
    eventCount++

    if (ev.kind === 'PROGRESS') {
      const d = ev.payload['delegation'] as Record<string, unknown> | undefined
      if (d) {
        delegations.push({
          delegationId: d['delegationId'] as string,
          childAgentId: d['childAgentId'] as string,
          depth:        d['depth']        as number,
          maxDepth:     d['maxDepth']     as number,
          observedAt:   ev.occurredAt,
        })
      }
    }

    if (ev.kind === 'EXECUTION_COMPLETED') completed = true
  }

  return { eventCount, delegations, completed }
}

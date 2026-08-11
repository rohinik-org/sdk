import { describe, it, expect } from 'vitest'
import { ExecutionEventBuilder } from '@rohinik-org/testing'
import { traceGovernedExecution } from '../src/index.js'

async function* fromArray<T>(arr: T[]): AsyncIterable<T> {
  for (const item of arr) yield item
}

describe('05-governed-mutation', () => {
  it('tracks approval checkpoint through WAITING + STATUS_CHANGED', async () => {
    const b = new ExecutionEventBuilder({ executionId: 'e-005' })
    const events = b.controlApprovalPath('wf-1', 'cp-1')

    const result = await traceGovernedExecution(fromArray(events))

    expect(result.completed).toBe(true)
    expect(result.checkpoints).toHaveLength(1)
    expect(result.checkpoints[0]!.workflowId).toBe('wf-1')
    expect(result.checkpoints[0]!.checkpointId).toBe('cp-1')
    expect(result.checkpoints[0]!.approved).toBe(true)
  })

  it('marks unapproved checkpoints as approved=false', async () => {
    const b = new ExecutionEventBuilder({ executionId: 'e-005b' })
    // Only emit WAITING, no matching STATUS_CHANGED approval
    const events = [b.accepted(), b.controlApprovalPending('wf-2', 'cp-2'), b.completed()]

    const result = await traceGovernedExecution(fromArray(events))

    expect(result.checkpoints).toHaveLength(1)
    expect(result.checkpoints[0]!.approved).toBe(false)
  })

  it('returns clean trace on golden path with no checkpoints', async () => {
    const b = new ExecutionEventBuilder({ executionId: 'e-005c' })
    const result = await traceGovernedExecution(fromArray(b.goldenPath()))
    expect(result.checkpoints).toHaveLength(0)
    expect(result.completed).toBe(true)
  })
})

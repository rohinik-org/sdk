import { describe, it, expect } from 'vitest'
import { ExecutionEventBuilder } from '@rohinik-org/testing'
import { traceDelegations } from '../src/index.js'

async function* fromArray<T>(arr: T[]): AsyncIterable<T> {
  for (const item of arr) yield item
}

describe('04-agent-delegation', () => {
  it('detects delegation in PROGRESS events', async () => {
    const b = new ExecutionEventBuilder({ executionId: 'e-004' })
    const events = b.delegationPath('del-1', 'child-agent-xyz')

    const result = await traceDelegations(fromArray(events))

    expect(result.completed).toBe(true)
    expect(result.delegations).toHaveLength(1)
    expect(result.delegations[0]!.delegationId).toBe('del-1')
    expect(result.delegations[0]!.childAgentId).toBe('child-agent-xyz')
    expect(result.delegations[0]!.depth).toBe(1)
    expect(result.delegations[0]!.maxDepth).toBe(3)
  })

  it('returns empty delegations on golden path', async () => {
    const b = new ExecutionEventBuilder({ executionId: 'e-004b' })
    const result = await traceDelegations(fromArray(b.goldenPath()))
    expect(result.delegations).toHaveLength(0)
    expect(result.completed).toBe(true)
    expect(result.eventCount).toBe(4)
  })
})

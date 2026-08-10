import { describe, it, expect } from 'vitest'
import { createTestAgentContext, assertValidAgent } from '@rohinik-org/testing'
import { myAgent } from '../src/index.js'

describe('myAgent', () => {
  it('passes assertValidAgent', () => {
    assertValidAgent(myAgent)
  })

  it('has correct id and role', () => {
    expect(myAgent.id).toBe('my-agent')
    expect(typeof myAgent.role).toBe('string')
    expect(myAgent.role.length).toBeGreaterThan(0)
  })

  it('instructions is callable', async () => {
    const ctx = createTestAgentContext({ goalLabel: 'Echo test' })
    const instructions = await myAgent.instructions(ctx)
    expect(typeof instructions).toBe('string')
    expect(instructions.length).toBeGreaterThan(0)
  })

  it('maxDelegationDepth is 0 — does not delegate', () => {
    expect(myAgent.authority.maxDelegationDepth).toBe(0)
  })
})

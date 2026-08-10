import { describe, it, expect } from 'vitest'
import { createTestCapabilityContext, assertValidCapability } from '@rohinik-org/testing'
import { myCapability } from '../src/index.js'

describe('myCapability', () => {
  it('passes assertValidCapability', () => {
    assertValidCapability(myCapability)
  })

  it('executes and returns echoed text', async () => {
    const ctx = createTestCapabilityContext()
    const r = await myCapability.execute(ctx, { text: 'hello' })
    expect(r.value['echoed']).toBe('hello')
  })
})

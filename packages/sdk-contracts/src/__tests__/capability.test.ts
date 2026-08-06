// packages/sdk-contracts/src/__tests__/capability.test.ts
import { describe, it, expect } from 'vitest'
import type { SdkCapability, CapabilityCategory } from '../capability.js'

describe('CapabilityCategory', () => {
  it('accepts all 6 canonical values', () => {
    const categories: CapabilityCategory[] = ['data', 'developer', 'reasoning', 'tool', 'memory', 'utility']
    expect(categories).toHaveLength(6)
  })
})

describe('SdkCapability structural conformance', () => {
  it('accepts a valid SdkCapability object', () => {
    const cap: SdkCapability = {
      metadata: {
        capabilityId: 'test.cap',
        name: 'Test',
        version: '1.0.0',
        contractVersion: '1.0',
        description: 'Test capability',
        category: 'tool',
        tags: ['test'],
        execution: { tierId: 'LOCAL_TOOL' },
      },
      skills: [{ metadata: { skillId: 'test.skill', name: 'Test Skill', version: '1.0.0' } }],
    }
    expect(cap.metadata.capabilityId).toBe('test.cap')
    expect(cap.metadata.category).toBe('tool')
  })
})

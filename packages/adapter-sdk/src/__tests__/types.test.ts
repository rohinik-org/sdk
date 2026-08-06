import { describe, it, expect } from 'vitest'
import type { CapabilityAdapter, RawDiscoveryModel, ExecutionBinding } from '../types.js'

describe('CapabilityAdapter interface', () => {
  it('can be implemented without knowledge of Rohinik IRs', () => {
    const adapter: CapabilityAdapter = {
      id: 'test-adapter',
      protocol: 'test',
      version: '1.0.0',
      async discover(_config) {
        return { protocol: 'test', items: [], metadata: {} }
      },
      validate(_raw) {
        return { valid: true, errors: [], warnings: [] }
      },
    }
    expect(adapter.id).toBe('test-adapter')
    expect(adapter.protocol).toBe('test')
  })

  it('ExecutionBinding is transport-neutral', () => {
    const binding: ExecutionBinding = {
      adapterId: 'test-adapter',
      capabilityId: 'test.do-thing',
      async invoke(input) {
        return { result: input }
      },
    }
    expect(binding.capabilityId).toBe('test.do-thing')
  })
})

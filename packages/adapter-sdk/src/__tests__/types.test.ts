import { describe, it, expect } from 'vitest'
import type { AdapterConfig, CapabilityAdapter, RawDiscoveryModel, ExecutionBinding, AdapterManifest } from '../types.js'

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

  it('AdapterConfig is assignable with all-optional fields', () => {
    const empty: AdapterConfig = {}
    const full: AdapterConfig = {
      endpoint: 'http://localhost:3000',
      credentials: { token: 'abc' },
      options: { timeout: 5000 },
    }
    expect(empty).toBeDefined()
    expect(full.endpoint).toBe('http://localhost:3000')
  })

  it('AdapterManifest is locally defined with all required fields', () => {
    const manifest: AdapterManifest = {
      schemaVersion: '1.0',
      id: 'test.adapter',
      version: '1.0.0',
      protocol: 'mcp',
      protocolVersions: ['2024-11-05'],
      minimumRuntime: '15.0.0',
      minimumSdk: '0.15.0',
      dependencies: [],
      permissions: [],
      compliance: { targetLevel: 1, laws: [], benchmarkSuites: [] },
      description: 'Test adapter',
    }
    expect(manifest.id).toBe('test.adapter')
    expect(manifest.compliance.targetLevel).toBe(1)
  })
})

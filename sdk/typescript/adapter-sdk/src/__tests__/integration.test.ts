import { describe, it, expect } from 'vitest'
import { DescriptorBuilder } from '../descriptor-builder.js'
import { CapabilityCompiler } from '../capability-compiler.js'
import { RegistrationPipeline } from '../registration-pipeline.js'

describe('Full pipeline: RawDiscoveryModel → RegistrationRecord', () => {
  it('adapts a mock MCP discovery all the way to RegistrationRecord', () => {
    const rawMcp = {
      protocol: 'mcp',
      items: [
        { name: 'read_file', description: 'Reads a file from the filesystem', tags: ['filesystem'] },
        { name: 'fetch_url', description: 'Fetches a URL via HTTP', tags: ['web'] },
      ],
      metadata: { endpoint: 'http://localhost:3000', protocolVersion: '2024-11-05' },
    }

    const builder = new DescriptorBuilder('@rohinik-org/mcp', '1.0.0', '2024-11-05', 'sess-1', 'snap-1')
    const ir = builder.build(rawMcp)
    expect(ir.meta.kind).toBe('CapabilityDescriptorIR')
    expect(ir.capabilities).toHaveLength(2)

    const bindings = new Map([
      ['read_file', { adapterId: 'test', capabilityId: 'filesystem.read', invoke: async (input: unknown) => input }],
      ['fetch_url', { adapterId: 'test', capabilityId: 'web.fetch', invoke: async (input: unknown) => input }],
    ])
    const compiler = new CapabilityCompiler('@rohinik-org/mcp')
    const capabilities = compiler.compile(ir, bindings)
    expect(capabilities).toHaveLength(2)

    const fsCapability = capabilities.find(c => c.metadata.capabilityId === 'filesystem.read')
    const webCapability = capabilities.find(c => c.metadata.capabilityId === 'web.fetch')
    expect(fsCapability?.metadata.execution?.tierId).toBe('LOCAL_TOOL')
    expect(webCapability?.metadata.execution?.tierId).toBe('EXTERNAL')

    const pipeline = new RegistrationPipeline('0.1.0-alpha.1', '1.0')
    const record = pipeline.admit(capabilities, 'sess-1', 'snap-1', ir.meta.artifactId)
    expect(record.status).toBe('ADMITTED')
    expect(record.registeredCapabilityIds).toContain('filesystem.read')
    expect(record.registeredCapabilityIds).toContain('web.fetch')
    expect(record.subject.references.some(r => r.id === ir.meta.artifactId)).toBe(true)
  })

  it('Law 18: pipeline rejects empty discovery', () => {
    const raw = { protocol: 'mcp', items: [], metadata: {} }
    const builder = new DescriptorBuilder('@rohinik-org/mcp', '1.0.0', '2024-11-05', 'sess-1', 'snap-1')
    const ir = builder.build(raw)
    expect(ir.capabilities).toHaveLength(0)

    const compiler = new CapabilityCompiler('@rohinik-org/mcp')
    const caps = compiler.compile(ir, new Map())
    expect(caps).toHaveLength(0)

    const pipeline = new RegistrationPipeline('0.1.0-alpha.1', '1.0')
    const record = pipeline.admit(caps, 'sess-1', 'snap-1', ir.meta.artifactId)
    expect(record.status).toBe('REJECTED')
  })
})

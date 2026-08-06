import { describe, it, expect } from 'vitest'
import { AdapterDescriptorBuilder } from '../adapter-descriptor-builder.js'

describe('AdapterDescriptorBuilder — full discovery model', () => {
  it('converts RawDiscoveryModel with multiple items to CapabilityDescriptorIR', () => {
    const raw = {
      protocol: 'mcp',
      items: [
        { name: 'read_file', description: 'Reads a file', tags: ['filesystem'] },
        { name: 'fetch_url', description: 'Fetches a URL', tags: ['web'] },
      ],
      metadata: { endpoint: 'http://localhost:3000', protocolVersion: '2024-11-05' },
    }
    const builder = new AdapterDescriptorBuilder('@rohinik-org/mcp', '1.0.0', '2024-11-05')
    const ir = builder.build(raw, {
      sessionId: 'sess-1',
      systemSnapshotId: 'snap-1',
      capturedAt: '2026-08-06T00:00:00.000Z',
    })
    expect(ir.meta.kind).toBe('CapabilityDescriptorIR')
    expect(ir.capabilities).toHaveLength(2)
    expect(ir.origin.protocol).toBe('mcp')
    expect(ir.origin.adapterId).toBe('@rohinik-org/mcp')
    expect(ir.integrity.checksum).toHaveLength(64)
    expect(ir.capabilities.map((c: { id: string }) => c.id)).toEqual(['read_file', 'fetch_url'])
  })
})

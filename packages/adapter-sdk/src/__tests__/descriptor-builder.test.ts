import { describe, it, expect } from 'vitest'
import { DescriptorBuilder } from '../descriptor-builder.js'
import type { RawDiscoveryModel } from '../types.js'

const TEST_RAW: RawDiscoveryModel = {
  protocol: 'mcp',
  items: [
    { name: 'read_file', description: 'Reads a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
    { name: 'write_file', description: 'Writes a file', sideEffects: ['filesystem'] },
  ],
  metadata: { serverName: 'filesystem', protocolVersion: '2024-11-05' },
}

describe('DescriptorBuilder', () => {
  const builder = new DescriptorBuilder('@rohinik-org/mcp', '1.0.0', '2024-11-05', 'install-session-1', 'sys-snap-1')

  it('produces a CapabilityDescriptorIR from RawDiscoveryModel', () => {
    const ir = builder.build(TEST_RAW)
    expect(ir.meta.kind).toBe('CapabilityDescriptorIR')
    expect(ir.origin.protocol).toBe('mcp')
    expect(ir.capabilities).toHaveLength(2)
  })

  it('is content-addressed — same input produces same artifactId', () => {
    const ir1 = builder.build(TEST_RAW)
    const ir2 = builder.build(TEST_RAW)
    expect(ir1.meta.artifactId).toBe(ir2.meta.artifactId)
  })

  it('maps items to CapabilityDefinitions', () => {
    const ir = builder.build(TEST_RAW)
    expect(ir.capabilities[0]!.id).toBe('read_file')
    expect(ir.capabilities[0]!.description).toBe('Reads a file')
  })

  it('carries provenance', () => {
    const ir = builder.build(TEST_RAW)
    expect(ir.provenance.sessionId).toBe('install-session-1')
    expect(ir.provenance.systemSnapshotId).toBe('sys-snap-1')
  })

  it('discoveryHash is deterministic', () => {
    const ir1 = builder.build(TEST_RAW)
    const ir2 = builder.build(TEST_RAW)
    expect(ir1.origin.discoveryHash).toBe(ir2.origin.discoveryHash)
  })
})

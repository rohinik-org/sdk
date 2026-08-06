import { describe, it, expect } from 'vitest'
import { AdapterDescriptorBuilder, InvalidDiscoveryItemError } from '../adapter-descriptor-builder.js'
import type { DescriptorBuildContext } from '../adapter-descriptor-builder.js'

const BASE_CONTEXT: DescriptorBuildContext = {
  sessionId: 'sess-1',
  systemSnapshotId: 'snap-1',
  capturedAt: '2026-08-06T00:00:00.000Z',
}

describe('AdapterDescriptorBuilder', () => {
  it('builds a valid CapabilityDescriptorIR from raw discovery model', () => {
    const raw = {
      protocol: 'mcp',
      items: [{ name: 'read_file', description: 'Reads a file' }],
      metadata: {},
    }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ir = builder.build(raw, BASE_CONTEXT)

    expect(ir.meta.kind).toBe('CapabilityDescriptorIR')
    expect(ir.meta.producer).toBe('@test/adapter@1.0.0')
    expect(ir.capabilities).toHaveLength(1)
    expect(ir.capabilities[0].id).toBe('read_file')
    expect(ir.origin.protocol).toBe('mcp')
    expect(ir.origin.adapterId).toBe('@test/adapter')
    expect(ir.integrity.checksum).toHaveLength(64)
  })

  it('is deterministic: identical input + context → identical output', () => {
    const raw = { protocol: 'mcp', items: [{ name: 'tool_a' }], metadata: {} }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ir1 = builder.build(raw, BASE_CONTEXT)
    const ir2 = builder.build(raw, BASE_CONTEXT)

    expect(ir1.integrity.checksum).toBe(ir2.integrity.checksum)
    expect(ir1.meta.artifactId).toBe(ir2.meta.artifactId)
  })

  it('different capturedAt changes the checksum', () => {
    const raw = { protocol: 'mcp', items: [{ name: 'tool_a' }], metadata: {} }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ctx1 = { ...BASE_CONTEXT, capturedAt: '2026-08-06T00:00:00.000Z' }
    const ctx2 = { ...BASE_CONTEXT, capturedAt: '2026-08-06T01:00:00.000Z' }
    const ir1 = builder.build(raw, ctx1)
    const ir2 = builder.build(raw, ctx2)

    expect(ir1.integrity.checksum).not.toBe(ir2.integrity.checksum)
  })

  it('canonical JSON: object key order does not affect checksum', () => {
    const raw1 = {
      protocol: 'mcp',
      items: [{ name: 'tool_a', description: 'A tool', id: 'tool_a_id' }],
      metadata: {},
    }
    const raw2 = {
      protocol: 'mcp',
      items: [{ id: 'tool_a_id', description: 'A tool', name: 'tool_a' }],
      metadata: {},
    }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ir1 = builder.build(raw1, BASE_CONTEXT)
    const ir2 = builder.build(raw2, BASE_CONTEXT)

    expect(ir1.integrity.checksum).toBe(ir2.integrity.checksum)
  })

  it('fail-closed: throws InvalidDiscoveryItemError for item without id or name', () => {
    const raw = {
      protocol: 'mcp',
      items: [{ description: 'No id or name here' }],
      metadata: {},
    }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    expect(() => builder.build(raw, BASE_CONTEXT)).toThrow(InvalidDiscoveryItemError)
    expect(() => builder.build(raw, BASE_CONTEXT)).toThrow('requires a non-empty id or name')
  })

  it('fail-closed: throws for null item', () => {
    const raw = { protocol: 'mcp', items: [null], metadata: {} }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    expect(() => builder.build(raw as never, BASE_CONTEXT)).toThrow(InvalidDiscoveryItemError)
  })

  it('fail-closed: throws for empty capturedAt', () => {
    const raw = { protocol: 'mcp', items: [], metadata: {} }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ctx = { ...BASE_CONTEXT, capturedAt: '' }
    expect(() => builder.build(raw, ctx)).toThrow('capturedAt is required')
  })

  it('uses id field when present, falls back to name', () => {
    const raw = {
      protocol: 'mcp',
      items: [
        { id: 'explicit-id', name: 'display-name' },
        { name: 'fallback-name' },
      ],
      metadata: {},
    }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ir = builder.build(raw, BASE_CONTEXT)
    expect(ir.capabilities[0].id).toBe('explicit-id')
    expect(ir.capabilities[1].id).toBe('fallback-name')
  })

  it('handles empty items array', () => {
    const raw = { protocol: 'mcp', items: [], metadata: {} }
    const builder = new AdapterDescriptorBuilder('@test/adapter', '1.0.0', '2024-11-05')
    const ir = builder.build(raw, BASE_CONTEXT)
    expect(ir.capabilities).toHaveLength(0)
    expect(ir.integrity.checksum).toHaveLength(64)
  })
})

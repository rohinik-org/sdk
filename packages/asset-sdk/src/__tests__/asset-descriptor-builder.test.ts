import { describe, it, expect } from 'vitest'
import { AssetDescriptorBuilder } from '../asset-descriptor-builder.js'
import type { RawAssetModel } from '../types.js'

const RAW: RawAssetModel = {
  ecosystem: 'claude',
  assetKind: 'skill',
  items: [
    {
      id: 'autocad-draw',
      name: 'AutoCAD Draw',
      description: 'Creates 2D AutoCAD drawings from natural language',
      content: '# AutoCAD Draw\nCreates drawings...',
      examples: ['draw a gearbox with 12 teeth'],
      tags: ['cad', 'design'],
    },
  ],
  metadata: { sourceFile: '.claude/skills/autocad.md' },
}

const CAPTURED_AT = '2026-08-06T00:00:00.000Z'

describe('AssetDescriptorBuilder', () => {
  it('builds a valid CapabilityDescriptorIR from RawAssetModel', () => {
    const builder = new AssetDescriptorBuilder(
      '@rohinik-org/claude-asset-frontend', '1.0.0', 'claude', 'session-1', 'snap-1',
    )
    const ir = builder.build(RAW, CAPTURED_AT)
    expect(ir.meta.kind).toBe('CapabilityDescriptorIR')
    expect(ir.origin.protocol).toBe('asset')
    expect(ir.origin.adapterId).toBe('@rohinik-org/claude-asset-frontend')
    expect(ir.capabilities).toHaveLength(1)
  })

  it('maps id, name, description from RawAssetItem', () => {
    const builder = new AssetDescriptorBuilder(
      '@rohinik-org/claude-asset-frontend', '1.0.0', 'claude', 'session-1', 'snap-1',
    )
    const ir = builder.build(RAW, CAPTURED_AT)
    const cap = ir.capabilities[0]!
    expect(cap.id).toBe('autocad-draw')
    expect(cap.name).toBe('AutoCAD Draw')
    expect(cap.description).toBe('Creates 2D AutoCAD drawings from natural language')
  })

  it('maps examples and tags including ecosystem tag', () => {
    const builder = new AssetDescriptorBuilder(
      '@rohinik-org/claude-asset-frontend', '1.0.0', 'claude', 's', 'snap',
    )
    const ir = builder.build(RAW, CAPTURED_AT)
    const cap = ir.capabilities[0]!
    expect(cap.examples).toContain('draw a gearbox with 12 teeth')
    expect(cap.tags).toContain('claude')
    expect(cap.tags).toContain('cad')
  })

  it('does NOT forward content field to CapabilityDefinition', () => {
    const builder = new AssetDescriptorBuilder(
      '@rohinik-org/claude-asset-frontend', '1.0.0', 'claude', 's', 'snap',
    )
    const ir = builder.build(RAW, CAPTURED_AT)
    const cap = ir.capabilities[0]! as unknown as Record<string, unknown>
    expect(cap['content']).toBeUndefined()
  })

  it('maps parameters to inputSchema', () => {
    const raw: RawAssetModel = {
      ...RAW,
      items: [{
        id: 'test', name: 'Test', description: 'Test', content: 'raw',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      }],
    }
    const builder = new AssetDescriptorBuilder('@rohinik-org/x', '1.0.0', 'x', 's', 'snap')
    const ir = builder.build(raw, CAPTURED_AT)
    expect(ir.capabilities[0]?.inputSchema).toBeDefined()
  })

  it('is deterministic: identical input + capturedAt → identical checksum', () => {
    const builder = new AssetDescriptorBuilder(
      '@rohinik-org/claude-asset-frontend', '1.0.0', 'claude', 'session-1', 'snap-1',
    )
    const ir1 = builder.build(RAW, CAPTURED_AT)
    const ir2 = builder.build(RAW, CAPTURED_AT)
    expect(ir1.integrity.checksum).toBe(ir2.integrity.checksum)
    expect(ir1.meta.artifactId).toBe(ir2.meta.artifactId)
  })

  it('different capturedAt changes the checksum', () => {
    const builder = new AssetDescriptorBuilder(
      '@rohinik-org/claude-asset-frontend', '1.0.0', 'claude', 'session-1', 'snap-1',
    )
    const ir1 = builder.build(RAW, '2026-08-06T00:00:00.000Z')
    const ir2 = builder.build(RAW, '2026-08-06T01:00:00.000Z')
    expect(ir1.integrity.checksum).not.toBe(ir2.integrity.checksum)
  })

  it('fail-closed: throws for empty capturedAt', () => {
    const builder = new AssetDescriptorBuilder('@rohinik-org/x', '1.0.0', 'x', 's', 'snap')
    expect(() => builder.build(RAW, '')).toThrow('capturedAt is required')
  })
})

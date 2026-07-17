import { describe, it, expect } from 'vitest'
import type {
  SemanticFrontend, DetectionResult, DetectionMethod,
  RawAssetModel, RawAssetItem, AssetValidationResult,
} from '../types.js'

describe('SemanticFrontend types', () => {
  it('SemanticFrontend interface is structurally valid', () => {
    const frontend: SemanticFrontend = {
      id: '@rohinik-org/claude-asset-frontend',
      ecosystem: 'claude',
      version: '1.0.0',
      supportedTypes: ['skill'],
      detect: (_path: string) => ({
        confidence: 1.0,
        frontend: undefined as unknown as SemanticFrontend,
        method: 'schema' as DetectionMethod,
        evidence: ['found .claude/skills/'],
      }),
      discover: async (_path: string) => ({
        ecosystem: 'claude',
        assetKind: 'skill',
        items: [],
        metadata: {},
      }),
      validate: (_raw: RawAssetModel) => ({ valid: true, errors: [], warnings: [] }),
    }
    expect(frontend.id).toBe('@rohinik-org/claude-asset-frontend')
    expect(frontend.ecosystem).toBe('claude')
  })

  it('RawAssetItem has required fields', () => {
    const item: RawAssetItem = {
      id: 'autocad-draw',
      name: 'AutoCAD Draw',
      description: 'Creates 2D AutoCAD drawings',
      content: '# AutoCAD Draw\nCreates drawings...',
    }
    expect(item.id).toBe('autocad-draw')
  })

  it('RawAssetItem accepts optional fields', () => {
    const item: RawAssetItem = {
      id: 'test', name: 'Test', description: 'Desc', content: 'raw',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      examples: ['draw a gearbox'],
      tags: ['cad', 'design'],
      frontmatter: { author: 'community' },
    }
    expect(item.tags).toContain('cad')
  })

  it('DetectionResult confidence is 0-1', () => {
    const result: DetectionResult = {
      confidence: 0.95,
      frontend: undefined as unknown as SemanticFrontend,
      method: 'schema',
      evidence: ['found .claude/skills/'],
    }
    expect(result.confidence).toBe(0.95)
    expect(result.method).toBe('schema')
  })

  it('AssetValidationResult shape', () => {
    const valid: AssetValidationResult = { valid: true, errors: [], warnings: [] }
    const invalid: AssetValidationResult = { valid: false, errors: ['missing name'], warnings: [] }
    expect(valid.valid).toBe(true)
    expect(invalid.errors[0]).toBe('missing name')
  })
})

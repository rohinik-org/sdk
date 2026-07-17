import { describe, it, expect } from 'vitest'
import { SemanticFrontendRegistry } from '../registry.js'
import { SemanticFrontendResolver } from '../resolver.js'
import type { SemanticFrontend, DetectionResult, RawAssetModel, AssetValidationResult } from '../types.js'

function makeFrontend(ecosystem: string, confidence: number): SemanticFrontend {
  return {
    id: `@rohinik-org/${ecosystem}-frontend`,
    ecosystem,
    version: '1.0.0',
    supportedTypes: ['skill'],
    detect: (_path: string): DetectionResult => ({
      confidence,
      frontend: undefined as unknown as SemanticFrontend,
      method: confidence >= 0.95 ? 'schema' : 'structural',
      evidence: [`detected as ${ecosystem}`],
    }),
    discover: async (_path: string): Promise<RawAssetModel> => ({
      ecosystem, assetKind: 'skill', items: [], metadata: {},
    }),
    validate: (_raw: RawAssetModel): AssetValidationResult => ({ valid: true, errors: [], warnings: [] }),
  }
}

describe('SemanticFrontendRegistry', () => {
  it('registers frontends and returns detection results sorted by confidence', () => {
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend('cursor', 0.5))
    registry.register(makeFrontend('claude', 0.95))
    const results = registry.detect('/some/path')
    expect(results[0]?.frontend.ecosystem).toBe('claude')
    expect(results[1]?.frontend.ecosystem).toBe('cursor')
  })

  it('returns empty array when no frontends registered', () => {
    const registry = new SemanticFrontendRegistry()
    expect(registry.detect('/some/path')).toHaveLength(0)
  })

  it('returns all results even when confidence is 0', () => {
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend('gemini', 0))
    const results = registry.detect('/some/path')
    expect(results).toHaveLength(1)
  })
})

describe('SemanticFrontendResolver', () => {
  it('resolves to highest confidence frontend without confirmation', async () => {
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend('claude', 0.95))
    registry.register(makeFrontend('cursor', 0.3))
    const resolver = new SemanticFrontendResolver(registry)
    const resolved = await resolver.resolve('/some/path')
    expect(resolved.frontend.ecosystem).toBe('claude')
    expect(resolved.requiresConfirmation).toBe(false)
  })

  it('requiresConfirmation is true when confidence < threshold', async () => {
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend('claude', 0.5))
    const resolver = new SemanticFrontendResolver(registry)
    const resolved = await resolver.resolve('/some/path')
    expect(resolved.requiresConfirmation).toBe(true)
  })

  it('hint bypasses detection and selects by ecosystem id', async () => {
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend('claude', 0.1))
    registry.register(makeFrontend('cursor', 0.1))
    const resolver = new SemanticFrontendResolver(registry)
    const resolved = await resolver.resolve('/some/path', 'cursor')
    expect(resolved.frontend.ecosystem).toBe('cursor')
    expect(resolved.requiresConfirmation).toBe(false)
  })

  it('throws when no frontends registered', async () => {
    const registry = new SemanticFrontendRegistry()
    const resolver = new SemanticFrontendResolver(registry)
    await expect(resolver.resolve('/some/path')).rejects.toThrow()
  })
})

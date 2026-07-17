import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { AssetInstallManager } from '../asset-install-manager.js'
import { SemanticFrontendRegistry } from '../registry.js'
import type { SemanticFrontend, RawAssetModel, AssetValidationResult, DetectionResult } from '../types.js'

const roots: string[] = []

async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `asset-install-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}

afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

function makeFrontend(): SemanticFrontend {
  return {
    id: '@rohinik-org/test-frontend',
    ecosystem: 'test',
    version: '1.0.0',
    supportedTypes: ['skill'],
    detect: (_path: string): DetectionResult => ({
      confidence: 0.99, frontend: undefined as unknown as SemanticFrontend,
      method: 'schema', evidence: ['found test/'],
    }),
    discover: async (_path: string): Promise<RawAssetModel> => ({
      ecosystem: 'test',
      assetKind: 'skill',
      items: [{
        id: 'test-skill', name: 'Test Skill',
        description: 'A test capability', content: 'raw content',
        tags: ['test'],
      }],
      metadata: {},
    }),
    validate: (_raw: RawAssetModel): AssetValidationResult => ({ valid: true, errors: [], warnings: [] }),
  }
}

describe('AssetInstallManager', () => {
  it('installs an asset through the full pipeline', async () => {
    const root = await tmpRoot()
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend())
    const manager = new AssetInstallManager(registry, root, '0.1.0-alpha.1', '1.0')
    const record = await manager.install(root)
    expect(record.status).toBe('ADMITTED')
    expect(record.registeredCapabilityIds.length).toBeGreaterThan(0)
  })

  it('throws when no frontend detected', async () => {
    const root = await tmpRoot()
    const registry = new SemanticFrontendRegistry()
    const manager = new AssetInstallManager(registry, root, '0.1.0-alpha.1', '1.0')
    await expect(manager.install(root)).rejects.toThrow()
  })

  it('throws when validation fails', async () => {
    const root = await tmpRoot()
    const registry = new SemanticFrontendRegistry()
    const badFrontend: SemanticFrontend = {
      ...makeFrontend(),
      discover: async () => ({ ecosystem: 'test', assetKind: 'skill', items: [], metadata: {} }),
      validate: () => ({ valid: false, errors: ['no items'], warnings: [] }),
    }
    registry.register(badFrontend)
    const manager = new AssetInstallManager(registry, root, '0.1.0-alpha.1', '1.0')
    await expect(manager.install(root)).rejects.toThrow('no items')
  })

  it('persists installed entry to catalog', async () => {
    const root = await tmpRoot()
    const registry = new SemanticFrontendRegistry()
    registry.register(makeFrontend())
    const manager = new AssetInstallManager(registry, root, '0.1.0-alpha.1', '1.0')
    await manager.install(root)
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(root, '.aios', 'catalog.json'))).toBe(true)
  })
})

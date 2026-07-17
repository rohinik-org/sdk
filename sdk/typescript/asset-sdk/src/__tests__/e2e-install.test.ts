import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { SemanticFrontendRegistry } from '../registry.js'
import { AssetInstallManager } from '../asset-install-manager.js'

// Import ClaudeAssetFrontend from its package
// NOTE: This test requires @rohinik-org/claude-asset-frontend to be installed as a dev dep.
// If the import fails, the test is skipped gracefully.

const roots: string[] = []

async function makeClaudeSkillRepo(skills: Record<string, string>): Promise<string> {
  const root = join(tmpdir(), `e2e-install-${randomUUID()}`)
  await mkdir(join(root, '.claude', 'skills'), { recursive: true })
  await mkdir(join(root, '.aios'), { recursive: true })
  for (const [filename, content] of Object.entries(skills)) {
    await writeFile(join(root, '.claude', 'skills', filename), content, 'utf-8')
  }
  roots.push(root)
  return root
}

afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('AssetInstallManager — end-to-end', () => {
  it('installs a Claude Skill from filesystem through the full compiler pipeline', async () => {
    // Dynamically import ClaudeAssetFrontend — skip if not built
    let ClaudeAssetFrontend: new () => import('../types.js').SemanticFrontend
    try {
      const mod = await import('@rohinik-org/claude-asset-frontend')
      ClaudeAssetFrontend = mod.ClaudeAssetFrontend
    } catch {
      console.warn('Skipping e2e test: @rohinik-org/claude-asset-frontend not available')
      return
    }

    const root = await makeClaudeSkillRepo({
      'autocad.md': `---
name: AutoCAD Draw
description: Creates 2D AutoCAD drawings from natural language
tags:
  - cad
  - design
examples:
  - draw a gearbox with 12 teeth
---
# AutoCAD Draw
This skill creates AutoCAD drawings.
`,
    })

    const registry = new SemanticFrontendRegistry()
    registry.register(new ClaudeAssetFrontend())
    const manager = new AssetInstallManager(registry, root, '0.1.0-alpha.1', '1.0')

    const record = await manager.install(root)

    // Pipeline result
    expect(record.status).toBe('ADMITTED')
    expect(record.registeredCapabilityIds.length).toBeGreaterThan(0)

    // Catalog written to disk
    const catalogPath = join(root, '.aios', 'catalog.json')
    expect(existsSync(catalogPath)).toBe(true)

    const { readFile } = await import('node:fs/promises')
    const catalog = JSON.parse(await readFile(catalogPath, 'utf-8')) as {
      entries: Array<{ id: string; protocol: string; status: string }>
    }

    expect(catalog.entries).toHaveLength(1)
    expect(catalog.entries[0]?.id).toBe('@rohinik-org/claude-asset-frontend')
    expect(catalog.entries[0]?.protocol).toBe('asset:claude')
    expect(catalog.entries[0]?.status).toBe('enabled')
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InstallManager } from '../install-manager.js'
import { CapabilityCatalog } from '../catalog.js'
import type { CapabilityAdapter, RawDiscoveryModel } from '../types.js'

const TMP = join(tmpdir(), `aios-install-mgr-test-${Date.now()}`)
beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

function mockAdapter(protocol: string, toolNames: string[]): CapabilityAdapter {
  return {
    id: `@rohinik-org/${protocol}`, protocol, version: '1.0.0',
    discover: vi.fn().mockResolvedValue({
      protocol, metadata: {},
      items: toolNames.map(name => ({ name, description: `${name} tool`, tags: ['filesystem'] })),
    } satisfies RawDiscoveryModel),
    validate: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  }
}

describe('InstallManager', () => {
  it('installs adapter and writes to catalog', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const manager = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const record = await manager.install(mockAdapter('mcp', ['read_file', 'write_file']), { endpoint: 'http://localhost:3000' }, new Map())
    expect(record.status).toBe('ADMITTED')
    expect(record.registeredCapabilityIds).toContain('filesystem.read')
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]!.id).toBe('@rohinik-org/mcp')
  })

  it('REJECTED: nothing written to catalog', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const manager = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const record = await manager.install(mockAdapter('mcp', []), { endpoint: 'http://localhost:3000' }, new Map())
    expect(record.status).toBe('REJECTED')
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(0)
  })

  it('throws on duplicate install', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const manager = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    await manager.install(mockAdapter('mcp', ['read_file']), { endpoint: 'http://localhost:3000' }, new Map())
    await expect(
      manager.install(mockAdapter('mcp', ['read_file']), { endpoint: 'http://localhost:3000' }, new Map())
    ).rejects.toThrow('already installed')
  })

  it('entry has descriptorIrId and registrationRecordId', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const manager = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    await manager.install(mockAdapter('mcp', ['read_file']), { endpoint: 'http://localhost:3000' }, new Map())
    const snapshot = await catalog.read()
    const entry = snapshot.entries[0]!
    expect(entry.descriptorIrId).toBeTruthy()
    expect(entry.registrationRecordId).toBeTruthy()
  })
})

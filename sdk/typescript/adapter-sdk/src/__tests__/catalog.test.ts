import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CapabilityCatalog } from '../catalog.js'
import type { InstalledCapabilityEntry } from '@rohinik-org/compiler'

const TMP = join(tmpdir(), `aios-catalog-test-${Date.now()}`)
beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

function makeEntry(id: string): InstalledCapabilityEntry {
  return {
    id, version: '1.0.0', protocol: 'mcp',
    source: { scheme: 'file', location: './adapter' },
    installedAt: '2026-07-07T00:00:00Z', status: 'enabled',
    registeredCapabilityIds: ['filesystem.read'],
    descriptorIrId: `cdir-${id}`, registrationRecordId: `rr-${id}`, complianceLevel: 1,
  }
}

describe('CapabilityCatalog', () => {
  it('starts empty when file does not exist', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(0)
    expect(snapshot.catalogVersion).toBe('1.0')
  })

  it('persists and reads back an entry', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@rohinik-org/mcp'))
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]!.id).toBe('@rohinik-org/mcp')
  })

  it('throws on duplicate ID', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@rohinik-org/mcp'))
    await expect(catalog.add(makeEntry('@rohinik-org/mcp'))).rejects.toThrow('already installed')
  })

  it('removes an entry', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@rohinik-org/mcp'))
    await catalog.remove('@rohinik-org/mcp')
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(0)
  })

  it('updates status', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@rohinik-org/mcp'))
    await catalog.setStatus('@rohinik-org/mcp', 'disabled')
    const snapshot = await catalog.read()
    expect(snapshot.entries[0]!.status).toBe('disabled')
  })

  it('lists only enabled entries', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@rohinik-org/mcp'))
    await catalog.add(makeEntry('@rohinik-org/openapi-adapter'))
    await catalog.setStatus('@rohinik-org/openapi-adapter', 'disabled')
    const enabled = await catalog.listEnabled()
    expect(enabled).toHaveLength(1)
    expect(enabled[0]!.id).toBe('@rohinik-org/mcp')
  })
})

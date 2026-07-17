import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { InstalledCapabilityEntry, CapabilityCatalogSnapshot, InstalledCapabilityStatus } from '@rohinik-org/compiler'

const CATALOG_FILE = '.rohinik/catalog.json'
const CATALOG_VERSION = '1.0'

export class CapabilityCatalog {
  private readonly catalogPath: string

  constructor(projectRoot: string) {
    this.catalogPath = join(projectRoot, CATALOG_FILE)
  }

  async read(): Promise<CapabilityCatalogSnapshot> {
    if (!existsSync(this.catalogPath)) {
      return { catalogVersion: CATALOG_VERSION, updatedAt: new Date().toISOString(), entries: [] }
    }
    const raw = await readFile(this.catalogPath, 'utf-8')
    return JSON.parse(raw) as CapabilityCatalogSnapshot
  }

  async add(entry: InstalledCapabilityEntry): Promise<void> {
    const snapshot = await this.read()
    if (snapshot.entries.some(e => e.id === entry.id)) {
      throw new Error(`Adapter '${entry.id}' already installed. Use 'rhk update' to upgrade.`)
    }
    await this.write({ ...snapshot, updatedAt: new Date().toISOString(), entries: [...snapshot.entries, entry] })
  }

  async remove(id: string): Promise<void> {
    const snapshot = await this.read()
    const filtered = snapshot.entries.filter(e => e.id !== id)
    if (filtered.length === snapshot.entries.length) {
      throw new Error(`Adapter '${id}' is not installed.`)
    }
    await this.write({ ...snapshot, updatedAt: new Date().toISOString(), entries: filtered })
  }

  async setStatus(id: string, status: InstalledCapabilityStatus): Promise<void> {
    const snapshot = await this.read()
    const updated = snapshot.entries.map(e =>
      e.id === id ? { ...e, status, updatedAt: new Date().toISOString() } : e
    )
    if (!updated.some(e => e.id === id)) throw new Error(`Adapter '${id}' is not installed.`)
    await this.write({ ...snapshot, updatedAt: new Date().toISOString(), entries: updated })
  }

  async listEnabled(): Promise<readonly InstalledCapabilityEntry[]> {
    const snapshot = await this.read()
    return snapshot.entries.filter(e => e.status === 'enabled')
  }

  private async write(snapshot: CapabilityCatalogSnapshot): Promise<void> {
    await mkdir(join(this.catalogPath, '..'), { recursive: true })
    await writeFile(this.catalogPath, JSON.stringify(snapshot, null, 2), 'utf-8')
  }
}

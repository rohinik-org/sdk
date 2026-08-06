import { createHash } from 'node:crypto'
import type { CapabilityDescriptorIR, CapabilityDefinition } from '@rohinik-org/compiler'
import type { RawAssetModel, RawAssetItem } from './types.js'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export class AssetDescriptorBuilder {
  constructor(
    private readonly frontendId: string,
    private readonly frontendVersion: string,
    private readonly ecosystem: string,
    private readonly sessionId: string,
    private readonly systemSnapshotId: string,
  ) {}

  build(raw: RawAssetModel, capturedAt: string): CapabilityDescriptorIR {
    if (!capturedAt.trim()) {
      throw new Error('capturedAt is required')
    }

    const capabilities = raw.items.map(item => this.toCapabilityDefinition(item))
    const discoveryHash = sha256(raw.items.map(i => ({ id: i.id, name: i.name })))

    const artifactWithoutIntegrity = {
      meta: {
        schemaVersion: '1.0',
        kind: 'CapabilityDescriptorIR',
        createdAt: capturedAt,
        producer: `${this.frontendId}@${this.frontendVersion}`,
        artifactId: '',
      },
      provenance: {
        systemSnapshotId: this.systemSnapshotId,
        parentArtifacts: [],
        sessionId: this.sessionId,
      },
      lifecycle: { state: 'ACTIVE' as const },
      origin: {
        protocol: 'asset',
        adapterId: this.frontendId,
        adapterVersion: this.frontendVersion,
        protocolVersion: '1.0',
        discoveryHash,
        capturedAt,
        ...(raw.metadata['sourceFile'] ? { endpoint: String(raw.metadata['sourceFile']) } : {}),
      },
      capabilities,
    }

    const checksum = sha256(artifactWithoutIntegrity)

    return {
      ...artifactWithoutIntegrity,
      meta: { ...artifactWithoutIntegrity.meta, artifactId: checksum },
      integrity: { checksum },
    } as unknown as CapabilityDescriptorIR
  }

  private toCapabilityDefinition(item: RawAssetItem): CapabilityDefinition {
    // content is deliberately NOT forwarded — the IR describes what, not the raw prompt text
    const tags = [...(item.tags ?? []), this.ecosystem, 'asset']

    const result: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      description: item.description,
      tags,
    }

    if (item.examples !== undefined && item.examples.length > 0) result['examples'] = item.examples
    if (item.parameters !== undefined) result['inputSchema'] = item.parameters

    return result as unknown as CapabilityDefinition
  }
}

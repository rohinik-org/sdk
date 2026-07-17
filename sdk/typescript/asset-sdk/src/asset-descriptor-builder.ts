import { createHash } from 'node:crypto'
import type { CapabilityDescriptorIR, CapabilityDefinition } from '@rohinik-org/compiler'
import type { RawAssetModel, RawAssetItem } from './types.js'

export class AssetDescriptorBuilder {
  constructor(
    private readonly frontendId: string,
    private readonly frontendVersion: string,
    private readonly ecosystem: string,
    private readonly sessionId: string,
    private readonly systemSnapshotId: string,
  ) {}

  build(raw: RawAssetModel): CapabilityDescriptorIR {
    const capabilities = raw.items.map(item => this.toCapabilityDefinition(item))

    const discoveryHash = createHash('sha256')
      .update(JSON.stringify(raw.items.map(i => ({ id: i.id, name: i.name }))))
      .digest('hex')

    const body = { origin: { protocol: 'asset', adapterId: this.frontendId, discoveryHash }, capabilities }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const now = new Date().toISOString()

    return {
      meta: {
        artifactId: checksum,
        schemaVersion: '1.0',
        kind: 'CapabilityDescriptorIR',
        createdAt: now,
        producer: `${this.frontendId}@${this.frontendVersion}`,
      },
      provenance: {
        systemSnapshotId: this.systemSnapshotId,
        parentArtifacts: [],
        sessionId: this.sessionId,
      },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      origin: {
        protocol: 'asset',
        adapterId: this.frontendId,
        adapterVersion: this.frontendVersion,
        protocolVersion: '1.0',
        discoveryHash,
        capturedAt: now,
        ...(raw.metadata['sourceFile'] ? { endpoint: String(raw.metadata['sourceFile']) } : {}),
      },
      capabilities,
    }
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

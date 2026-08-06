import { createHash } from 'node:crypto'
import type { CapabilityDescriptorIR, CapabilityDefinition } from '@rohinik-org/compiler'
import type { RawDiscoveryModel } from './types.js'

export class DescriptorBuilder {
  constructor(
    private readonly adapterId: string,
    private readonly adapterVersion: string,
    private readonly protocolVersion: string,
    private readonly sessionId: string,
    private readonly systemSnapshotId: string,
  ) {}

  build(raw: RawDiscoveryModel): CapabilityDescriptorIR {
    const capabilities = raw.items.map(item => this.toCapabilityDefinition(item))
    const discoveryHash = createHash('sha256')
      .update(JSON.stringify(raw.items))
      .digest('hex')

    const body = {
      origin: {
        protocol: raw.protocol,
        adapterId: this.adapterId,
        adapterVersion: this.adapterVersion,
        protocolVersion: this.protocolVersion,
        discoveryHash,
      },
      capabilities,
    }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const now = new Date().toISOString()

    return {
      meta: {
        artifactId: checksum,
        schemaVersion: '1.0',
        kind: 'CapabilityDescriptorIR',
        createdAt: now,
        producer: `${this.adapterId}@${this.adapterVersion}`,
      },
      provenance: {
        systemSnapshotId: this.systemSnapshotId,
        parentArtifacts: [],
        sessionId: this.sessionId,
      },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      origin: {
        protocol: raw.protocol,
        adapterId: this.adapterId,
        adapterVersion: this.adapterVersion,
        protocolVersion: this.protocolVersion,
        discoveryHash,
        capturedAt: now,
      },
      capabilities,
    }
  }

  private toCapabilityDefinition(item: unknown): CapabilityDefinition {
    const obj = item as Record<string, unknown>
    const base = {
      id: String(obj['name'] ?? obj['id'] ?? 'unknown'),
      name: String(obj['title'] ?? obj['name'] ?? obj['id'] ?? 'Unknown'),
      description: String(obj['description'] ?? ''),
    }

    const result: Record<string, unknown> = { ...base }
    if (Array.isArray(obj['examples'])) result['examples'] = obj['examples'] as string[]
    if (obj['inputSchema'] !== undefined) result['inputSchema'] = obj['inputSchema']
    if (obj['outputSchema'] !== undefined) result['outputSchema'] = obj['outputSchema']
    if (Array.isArray(obj['tags'])) result['tags'] = obj['tags'] as string[]
    if (obj['estimatedLatency']) result['estimatedLatency'] = obj['estimatedLatency']
    if (obj['estimatedCost']) result['estimatedCost'] = obj['estimatedCost']
    if (Array.isArray(obj['sideEffects'])) result['sideEffects'] = obj['sideEffects'] as string[]
    if (typeof obj['idempotent'] === 'boolean') result['idempotent'] = obj['idempotent']

    return result as unknown as CapabilityDefinition
  }
}

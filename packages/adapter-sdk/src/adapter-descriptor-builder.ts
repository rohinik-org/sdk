import { createHash } from 'node:crypto'
import type { CapabilityDescriptorIR, CapabilityDefinition } from '@rohinik-org/compiler'
import type { RawDiscoveryModel } from './types.js'

export interface DescriptorBuildContext {
  readonly sessionId: string
  readonly systemSnapshotId: string
  readonly capturedAt: string
}

export class InvalidDiscoveryItemError extends Error {
  readonly code = 'SDK.INVALID_DISCOVERY_ITEM'

  constructor(message: string) {
    super(message)
    this.name = 'InvalidDiscoveryItemError'
  }
}

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

export class AdapterDescriptorBuilder {
  constructor(
    private readonly adapterId: string,
    private readonly adapterVersion: string,
    private readonly protocolVersion: string,
  ) {}

  build(raw: RawDiscoveryModel, context: DescriptorBuildContext): CapabilityDescriptorIR {
    if (!context.capturedAt.trim()) {
      throw new Error('DescriptorBuildContext.capturedAt is required')
    }

    const capabilities = raw.items.map((item, index) =>
      this.toCapabilityDefinition(item, index),
    )
    const discoveryHash = sha256(raw.items)

    const artifactWithoutIntegrity = {
      meta: {
        schemaVersion: '1.0',
        kind: 'CapabilityDescriptorIR',
        createdAt: context.capturedAt,
        producer: `${this.adapterId}@${this.adapterVersion}`,
        // ponytail: artifactId computed below from checksum — set after integrity pass
        artifactId: '',
      },
      provenance: {
        systemSnapshotId: context.systemSnapshotId,
        parentArtifacts: [],
        sessionId: context.sessionId,
      },
      lifecycle: { state: 'ACTIVE' as const },
      origin: {
        protocol: raw.protocol,
        adapterId: this.adapterId,
        adapterVersion: this.adapterVersion,
        protocolVersion: this.protocolVersion,
        discoveryHash,
        capturedAt: context.capturedAt,
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

  private toCapabilityDefinition(item: unknown, index: number): CapabilityDefinition {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new InvalidDiscoveryItemError(`Discovery item ${index} must be an object`)
    }

    const obj = item as Record<string, unknown>
    const idCandidate = typeof obj.id === 'string' ? obj.id.trim() : ''
    const nameCandidate = typeof obj.name === 'string' ? obj.name.trim() : ''
    const id = idCandidate || nameCandidate

    if (!id) {
      throw new InvalidDiscoveryItemError(
        `Discovery item ${index} requires a non-empty id or name`,
      )
    }

    const displayName =
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim()
        : nameCandidate || id

    const result: Record<string, unknown> = {
      id,
      name: displayName,
      description: typeof obj.description === 'string' ? obj.description : '',
    }

    if (Array.isArray(obj.examples)) result.examples = obj.examples
    if (obj.inputSchema !== undefined) result.inputSchema = obj.inputSchema
    if (obj.outputSchema !== undefined) result.outputSchema = obj.outputSchema
    if (Array.isArray(obj.tags)) result.tags = obj.tags
    if (obj.estimatedLatency !== undefined) result.estimatedLatency = obj.estimatedLatency
    if (obj.estimatedCost !== undefined) result.estimatedCost = obj.estimatedCost
    if (Array.isArray(obj.sideEffects)) result.sideEffects = obj.sideEffects
    if (typeof obj.idempotent === 'boolean') result.idempotent = obj.idempotent

    return result as unknown as CapabilityDefinition
  }
}

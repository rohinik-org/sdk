import { createHash, randomUUID } from 'node:crypto'
import type { SdkCapability } from '@rohinik-org/foundation'
import type { RegistrationRecord } from '@rohinik-org/compiler'

export class RegistrationPipeline {
  constructor(
    private readonly runtimeVersion: string,
    private readonly sdkVersion: string,
  ) {}

  admit(
    capabilities: readonly SdkCapability[],
    sessionId: string,
    systemSnapshotId: string,
    descriptorIrId: string,
  ): RegistrationRecord {
    const errors: string[] = []
    const warnings: string[] = []

    if (capabilities.length === 0) {
      errors.push('No capabilities to register')
    }

    const capIds = capabilities.map(c => c.metadata.capabilityId)
    const unique = new Set(capIds)
    if (unique.size !== capIds.length) {
      warnings.push('Duplicate capability IDs detected — only first occurrence registered')
    }

    const status = errors.length === 0 ? 'ADMITTED' as const : 'REJECTED' as const
    const now = new Date().toISOString()
    const registeredIds = status === 'ADMITTED' ? [...unique] : []

    const body = { status, registeredCapabilityIds: registeredIds, errors, warnings }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')

    const record: RegistrationRecord = {
      meta: {
        artifactId: randomUUID(),
        schemaVersion: '1.0',
        kind: 'RegistrationRecord',
        createdAt: now,
        producer: `@rohinik-org/adapter-sdk@${this.runtimeVersion}`,
      },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      subject: {
        kind: 'artifact-set',
        references: [{ kind: 'CapabilityDescriptorIR', id: descriptorIrId }],
      },
      status,
      compatibilityStatus: errors.length === 0 ? 'COMPATIBLE' : 'INCOMPATIBLE',
      complianceLevel: 0,
      registeredCapabilityIds: registeredIds,
      ...(errors.length > 0 ? { errors } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    }

    return record
  }
}

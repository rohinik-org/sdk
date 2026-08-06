import { randomUUID } from 'node:crypto'
import type { RegistrationRecord, InstalledCapabilityEntry } from '@rohinik-org/compiler'
import { CapabilityCompiler, RegistrationPipeline, CapabilityCatalog } from '@rohinik-org/adapter-sdk'
import { AssetDescriptorBuilder } from './asset-descriptor-builder.js'
import { SemanticFrontendResolver } from './resolver.js'
import type { SemanticFrontendRegistry } from './registry.js'
import type { RawAssetModel } from './types.js'

export class AssetInstallManager {
  private readonly pipeline: RegistrationPipeline
  private readonly catalog: CapabilityCatalog

  constructor(
    private readonly registry: SemanticFrontendRegistry,
    private readonly projectRoot: string,
    runtimeVersion: string,
    sdkVersion: string,
  ) {
    this.pipeline = new RegistrationPipeline(runtimeVersion, sdkVersion)
    this.catalog = new CapabilityCatalog(projectRoot)
  }

  async install(localPath: string, hint?: string): Promise<RegistrationRecord> {
    const sessionId = randomUUID()
    const systemSnapshotId = randomUUID()

    const resolver = new SemanticFrontendResolver(this.registry)
    const resolved = await resolver.resolve(localPath, hint)
    const { frontend } = resolved

    const raw = await frontend.discover(localPath)
    const semanticMeta = this.extractSemanticMetadata(raw)
    const validation = frontend.validate(raw)
    if (!validation.valid) {
      throw new Error(`Asset validation failed: ${validation.errors.join('; ')}`)
    }

    const builder = new AssetDescriptorBuilder(
      frontend.id, frontend.version, frontend.ecosystem, sessionId, systemSnapshotId,
    )
    const descriptorIR = builder.build(raw)

    const compiler = new CapabilityCompiler(frontend.id)
    const capabilities = compiler.compile(descriptorIR, new Map())

    const record = this.pipeline.admit(capabilities, sessionId, systemSnapshotId, descriptorIR.meta.artifactId)

    if (record.status === 'ADMITTED') {
      const entry: InstalledCapabilityEntry = {
        id: frontend.id,
        version: frontend.version,
        protocol: `asset:${frontend.ecosystem}`,
        source: { scheme: 'asset', location: localPath },
        installedAt: new Date().toISOString(),
        status: 'enabled',
        registeredCapabilityIds: [...record.registeredCapabilityIds],
        descriptorIrId: descriptorIR.meta.artifactId,
        registrationRecordId: record.meta.artifactId,
        complianceLevel: record.complianceLevel,
        ...(semanticMeta.length > 0 ? { notes: JSON.stringify({ semanticMetadata: semanticMeta }) } : {}),
      }
      await this.catalog.add(entry)
    }

    return record
  }

  private extractSemanticMetadata(raw: RawAssetModel): unknown[] {
    if (raw.ecosystem !== 'claude') return []
    try {
      return raw.items.map(item => {
        const fm = (item.frontmatter as Record<string, unknown> | undefined) ?? {}
        const requires = (fm['requires'] as { host?: string[]; providers?: string[] } | undefined) ?? {}
        const toArr = (v: unknown): string[] =>
          Array.isArray(v) ? (v as unknown[]).filter(x => typeof x === 'string') as string[] : []
        return {
          capabilityId: item.id,
          requiresHost: Array.isArray(requires.host) ? (requires.host as string[]) : [],
          requiresProviders: Array.isArray(requires.providers) ? (requires.providers as string[]) : [],
          consumes: toArr(fm['consumes']),
          produces: toArr(fm['produces']),
          implements: toArr(fm['implements']),
          recommends: toArr(fm['recommends']),
        }
      }).filter(m =>
        m.requiresHost.length + m.consumes.length + m.produces.length +
        m.implements.length + m.recommends.length > 0
      )
    } catch {
      return []
    }
  }
}

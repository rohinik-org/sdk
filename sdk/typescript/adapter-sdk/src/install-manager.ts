import { randomUUID } from 'node:crypto'
import type { RegistrationRecord, InstalledCapabilityEntry } from '@rohinik-org/compiler'
import type { CapabilityAdapter, AdapterConfig, ExecutionBinding } from './types.js'
import { DescriptorBuilder } from './descriptor-builder.js'
import { CapabilityCompiler } from './capability-compiler.js'
import { RegistrationPipeline } from './registration-pipeline.js'
import { CapabilityCatalog } from './catalog.js'

export class InstallManager {
  private readonly pipeline: RegistrationPipeline

  constructor(
    private readonly catalog: CapabilityCatalog,
    private readonly projectRoot: string,
    runtimeVersion: string,
    sdkVersion: string,
  ) {
    this.pipeline = new RegistrationPipeline(runtimeVersion, sdkVersion)
  }

  async install(
    adapter: CapabilityAdapter,
    config: AdapterConfig,
    bindings: Map<string, ExecutionBinding>,
  ): Promise<RegistrationRecord> {
    const sessionId = randomUUID()
    const systemSnapshotId = randomUUID()

    const raw = await adapter.discover(config)
    const validation = adapter.validate(raw)
    if (!validation.valid) {
      throw new Error(`Adapter validation failed: ${validation.errors.join('; ')}`)
    }

    const builder = new DescriptorBuilder(
      adapter.id, adapter.version,
      (raw.metadata['protocolVersion'] as string | undefined) ?? '1.0',
      sessionId, systemSnapshotId,
    )
    const descriptorIR = builder.build(raw)

    const compiler = new CapabilityCompiler(adapter.id)
    const capabilities = compiler.compile(descriptorIR, bindings)

    const record = this.pipeline.admit(capabilities, sessionId, systemSnapshotId, descriptorIR.meta.artifactId)

    if (record.status === 'ADMITTED') {
      const source = config.endpoint
        ? { scheme: adapter.protocol, location: config.endpoint }
        : { scheme: 'file', location: this.projectRoot }

      const entry: InstalledCapabilityEntry = {
        id: adapter.id,
        version: adapter.version,
        protocol: adapter.protocol,
        source,
        installedAt: new Date().toISOString(),
        status: 'enabled',
        registeredCapabilityIds: [...record.registeredCapabilityIds],
        descriptorIrId: descriptorIR.meta.artifactId,
        registrationRecordId: record.meta.artifactId,
        complianceLevel: record.complianceLevel,
      }
      await this.catalog.add(entry)
      // Enrich capability graph (non-fatal — fire and forget)
      void this.enrichGraph(this.projectRoot).catch(() => { /* non-fatal */ })
    }

    return record
  }

  private async enrichGraph(projectRoot: string): Promise<void> {
    try {
      const { createRequire } = await import('node:module')
      const { resolve } = await import('node:path')
      const { existsSync } = await import('node:fs')
      const { pathToFileURL } = await import('node:url')
      let mod: unknown = null
      for (const base of [process.cwd()]) {
        try { mod = await import(createRequire(base + '/package.json').resolve('@rohinik-org/knowledge-graph')); break } catch { /* continue */ }
      }
      if (!mod) {
        const candidate = resolve(process.cwd(), 'packages/knowledge-graph/dist/index.js')
        if (existsSync(candidate)) mod = await import(pathToFileURL(candidate).href)
      }
      if (!mod || typeof mod !== 'object' || !('GraphStore' in mod) || !('GraphBuilder' in mod) || !('CapabilityContributor' in mod)) return
      const m = mod as Record<string, new (...args: unknown[]) => unknown>
      const store = new m['GraphStore']!(projectRoot)
      const builder = new m['GraphBuilder']!(store)
      builder.register(new m['CapabilityContributor']!())
      const existing = await (store as { read(): Promise<unknown> }).read()
      const updated = await (builder as { build(ctx: unknown): Promise<unknown> }).build({ projectRoot, existingGraph: existing })
      await (store as { write(g: unknown): Promise<void> }).write(updated)
    } catch { /* non-fatal */ }
  }
}

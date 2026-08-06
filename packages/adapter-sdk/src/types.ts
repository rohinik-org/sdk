// Re-export canonical adapter contract types from @rohinik-org/adapter-ir
export type {
  AdapterConfig,
  RawDiscoveryModel,
  AdapterValidationResult,
  ExecutionBinding,
  InstallSource,
  CapabilityAdapter,
} from '@rohinik-org/adapter-ir'

// SDK-owned authoring type — not in adapter-ir
export interface AdapterManifest {
  readonly schemaVersion: string
  readonly id: string
  readonly version: string
  readonly protocol: string
  readonly protocolVersions: readonly string[]
  readonly minimumRuntime: string
  readonly minimumSdk: string
  readonly dependencies: readonly string[]
  readonly permissions: readonly string[]
  readonly compliance: {
    readonly targetLevel: number
    readonly laws: readonly number[]
    readonly benchmarkSuites: readonly string[]
  }
  readonly description: string
  readonly author?: string
  readonly license?: string
}

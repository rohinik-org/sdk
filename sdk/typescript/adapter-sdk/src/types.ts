export interface AdapterConfig {
  readonly endpoint?: string
  readonly credentials?: Record<string, string>
  readonly options?: Record<string, unknown>
}

export interface RawDiscoveryModel {
  readonly protocol: string
  readonly items: readonly unknown[]
  readonly metadata: Record<string, unknown>
}

export interface AdapterValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

export interface ExecutionBinding {
  readonly adapterId: string
  readonly capabilityId: string
  invoke(input: unknown): Promise<unknown>
}

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

export interface InstallSource {
  readonly scheme: string
  readonly location: string
}

export interface CapabilityAdapter {
  readonly id: string
  readonly protocol: string
  readonly version: string
  discover(config: AdapterConfig): Promise<RawDiscoveryModel>
  validate(raw: RawDiscoveryModel): AdapterValidationResult
}

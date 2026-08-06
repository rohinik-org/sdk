// packages/sdk-contracts/src/capability.ts
export type CapabilityCategory =
  | 'data'
  | 'developer'
  | 'reasoning'
  | 'tool'
  | 'memory'
  | 'utility'

export type CostTier = 'free' | 'low' | 'medium' | 'high'
export type LatencyTier = 'very-low' | 'low' | 'medium' | 'high'

export type TierId = 'MEMORY' | 'DETERMINISTIC' | 'LOCAL_TOOL' | 'EXTERNAL' | 'REASONING'

export interface CapabilityExecutionMetadata {
  readonly tierId: TierId
}

export interface SdkSkillMetadata {
  readonly skillId: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly tags: readonly string[]
  readonly costTier: CostTier
  readonly latencyTier: LatencyTier
  readonly examples?: readonly string[]
}

export interface SdkSkill {
  readonly metadata: { readonly skillId: string; readonly name: string; readonly version: string }
}

export interface SdkCapabilityMetadata {
  readonly capabilityId: string
  readonly name: string
  readonly version: string
  readonly contractVersion: string
  readonly description: string
  readonly category: CapabilityCategory
  readonly tags: readonly string[]
  readonly author?: string
  readonly execution?: CapabilityExecutionMetadata
}

export interface SdkCapability {
  readonly metadata: SdkCapabilityMetadata
  readonly skills: readonly SdkSkill[]
}

export interface SdkProvider {
  readonly metadata: {
    readonly providerId: string
    readonly name: string
    readonly version: string
  }
  isAvailable(): Promise<boolean>
}

export interface SdkServices {
  readonly logger: {
    info(msg: string, data?: Record<string, unknown>): void
    error(msg: string, data?: Record<string, unknown>): void
  }
}

export type ActivateFn = (services: SdkServices) => void | Promise<void>
export type DeactivateFn = () => void | Promise<void>

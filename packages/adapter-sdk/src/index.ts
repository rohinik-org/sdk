// Adapter authoring contracts (canonical source: @rohinik-org/adapter-ir)
export type {
  AdapterConfig,
  RawDiscoveryModel,
  AdapterValidationResult,
  ExecutionBinding,
  InstallSource,
  CapabilityAdapter,
} from './types.js'

// SDK-owned authoring types
export type { AdapterManifest } from './types.js'

// Descriptor builder (pure declarative authoring — no runtime operations)
export { AdapterDescriptorBuilder, InvalidDiscoveryItemError } from './adapter-descriptor-builder.js'
export type { DescriptorBuildContext } from './adapter-descriptor-builder.js'

// Re-export canonical interchange IR types (source: @rohinik-org/compiler)
// ponytail: transitional — replace @rohinik-org/compiler with @rohinik-org/compiler-ir when RS-1 splits that package
export type { CapabilityDescriptorIR, CapabilityDefinition, SemanticCapabilityID } from '@rohinik-org/compiler'

export const ASSET_SDK_VERSION = '0.1.0'
export type {
  SemanticFrontend, DetectionResult, DetectionMethod,
  RawAssetModel, RawAssetItem, AssetValidationResult,
  ResolvedFrontend, ResolverOptions,
} from './types.js'
export { SemanticFrontendRegistry } from './registry.js'
export { SemanticFrontendResolver } from './resolver.js'
export { AssetDescriptorBuilder } from './asset-descriptor-builder.js'
export { AssetInstallManager } from './asset-install-manager.js'
export { titleFromMarkdown } from './utils.js'
export type { SemanticMetadata, SemanticExtractor } from './semantic-metadata.js'

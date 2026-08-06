import type { RawAssetItem } from './types.js'

// Ecosystem-neutral semantic metadata produced by any SemanticExtractor.
// All concept IDs are bare names (e.g. 'python', 'csv') — the graph layer
// prepends 'concept://' when creating nodes.
export interface SemanticMetadata {
  readonly capabilityId: string
  readonly requiresHost: readonly string[]
  readonly requiresProviders: readonly string[]
  readonly consumes: readonly string[]
  readonly produces: readonly string[]
  readonly implements: readonly string[]
  readonly recommends: readonly string[]
}

// Implemented by each Semantic Frontend to extract SemanticMetadata from its
// ecosystem-specific frontmatter. The graph layer never knows which extractor ran.
export interface SemanticExtractor {
  readonly ecosystemId: string
  extract(item: RawAssetItem): SemanticMetadata | null
}

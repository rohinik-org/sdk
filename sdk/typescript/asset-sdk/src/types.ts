export type DetectionMethod =
  | 'manifest'      // Layer 1: rohinik-package.json declares assetType (confidence 1.0)
  | 'schema'        // Layer 2: well-known ecosystem signature found (0.95–1.0)
  | 'structural'    // Layer 3: heuristic inspection (0.5–0.9)
  | 'none'          // no match

export interface RawAssetItem {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly content: string               // raw text — NOT forwarded to CapabilityDescriptorIR
  readonly parameters?: unknown          // parsed parameter schema (JSON Schema compatible)
  readonly examples?: readonly string[]
  readonly tags?: readonly string[]
  readonly frontmatter?: Record<string, unknown>
}

export interface RawAssetModel {
  readonly ecosystem: string             // 'claude' | 'cursor' | 'gemini' | ...
  readonly assetKind: string             // 'skill' | 'rule' | 'gem' | 'instruction' | ...
  readonly items: readonly RawAssetItem[]
  readonly metadata: Record<string, unknown>
}

export interface AssetValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

export interface DetectionResult {
  readonly confidence: number            // 0–1
  readonly frontend: SemanticFrontend
  readonly method: DetectionMethod
  readonly evidence: readonly string[]
}

// The extension point every Semantic Frontend implements.
// Mirrors CapabilityAdapter exactly — discover() takes a localPath instead of an endpoint.
export interface SemanticFrontend {
  readonly id: string
  readonly ecosystem: string
  readonly version: string
  readonly supportedTypes: readonly string[]

  detect(localPath: string): DetectionResult
  discover(localPath: string): Promise<RawAssetModel>
  validate(raw: RawAssetModel): AssetValidationResult
}

export interface ResolvedFrontend {
  readonly frontend: SemanticFrontend
  readonly detection: DetectionResult
  readonly requiresConfirmation: boolean
}

export interface ResolverOptions {
  readonly confidenceThreshold?: number  // default 0.7
  readonly confirm?: (candidates: readonly DetectionResult[]) => Promise<SemanticFrontend>
}

import type {
  SemanticFrontend,
  DetectionResult,
  RawAssetModel,
  RawAssetItem,
  AssetValidationResult,
} from '../../types.js'

export interface TestFrontendOptions {
  readonly id?: string
  readonly ecosystem?: string
  readonly confidence?: number
  readonly items?: readonly RawAssetItem[]
}

export function makeTestFrontend(
  options: TestFrontendOptions = {},
): SemanticFrontend {
  const id = options.id ?? 'test-frontend'
  const ecosystem = options.ecosystem ?? 'test'
  const confidence = options.confidence ?? 1
  const items = options.items ?? []

  return {
    id,
    ecosystem,
    version: '1.0.0',
    supportedTypes: ['skill'],

    detect(_localPath: string): DetectionResult {
      return {
        confidence,
        frontend: this,
        method: 'manifest',
        evidence: ['test'],
      }
    },

    async discover(_localPath: string): Promise<RawAssetModel> {
      return {
        ecosystem,
        assetKind: 'skill',
        items,
        metadata: {},
      }
    },

    validate(_raw: RawAssetModel): AssetValidationResult {
      return { valid: true, errors: [], warnings: [] }
    },
  }
}

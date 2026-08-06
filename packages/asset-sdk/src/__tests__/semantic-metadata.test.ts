import { describe, it, expect } from 'vitest'
import type { SemanticMetadata, SemanticExtractor } from '../semantic-metadata.js'
import type { RawAssetItem } from '../types.js'

describe('SemanticMetadata types', () => {
  it('accepts minimal SemanticMetadata', () => {
    const meta: SemanticMetadata = {
      capabilityId: 'pandas-analyze',
      requiresHost: ['python'],
      requiresProviders: [],
      consumes: ['csv'],
      produces: ['dataframe'],
      implements: ['data-analysis'],
      recommends: ['jupyter'],
    }
    expect(meta.capabilityId).toBe('pandas-analyze')
    expect(meta.requiresHost).toContain('python')
  })

  it('accepts empty SemanticMetadata', () => {
    const meta: SemanticMetadata = {
      capabilityId: 'greet',
      requiresHost: [],
      requiresProviders: [],
      consumes: [],
      produces: [],
      implements: [],
      recommends: [],
    }
    expect(meta.requiresHost).toHaveLength(0)
  })

  it('SemanticExtractor interface is structurally valid', () => {
    const extractor: SemanticExtractor = {
      ecosystemId: 'claude',
      extract: (_item: RawAssetItem) => ({
        capabilityId: 'test',
        requiresHost: [], requiresProviders: [],
        consumes: [], produces: [], implements: [], recommends: [],
      }),
    }
    expect(extractor.ecosystemId).toBe('claude')
    expect(extractor.extract({ id: 'x', name: 'X', description: '', content: '' })).toBeTruthy()
  })
})

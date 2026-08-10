/**
 * createMockProvider — builds a ProviderDefinition with a scripted execute().
 * Uses real defineProvider() so all authoring contracts hold.
 */

import {
  defineProvider,
  type ProviderDefinition,
  type ProviderRequest,
  type ProviderResult,
} from '@rohinik-org/provider-sdk'

export interface MockProviderOptions {
  readonly id:           string
  readonly version?:     string
  readonly secretRefs?:  readonly string[]
  readonly capabilities?: {
    text?:            boolean
    streaming?:       boolean
    structuredOutput?: boolean
    tools?:           boolean
    vision?:          boolean
    longContext?:      boolean
  }
  readonly onExecute?:  (_req: ProviderRequest) => Promise<ProviderResult> | ProviderResult
  readonly healthStatus?: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'
}

export function createMockProvider(opts: MockProviderOptions): ProviderDefinition {
  const caps = opts.capabilities ?? { text: true }
  return defineProvider({
    id:           opts.id,
    version:      opts.version ?? '0.1.0',
    capabilities: caps,
    secretRefs:   opts.secretRefs ?? [],
    async execute(_ctx, req) {
      if (opts.onExecute) return opts.onExecute(req)
      return { text: `mock response for ${req.capability}` }
    },
    async health(_ctx) {
      return { status: opts.healthStatus ?? 'HEALTHY' }
    },
  })
}

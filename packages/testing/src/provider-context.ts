/**
 * createTestProviderContext — thin wrapper around the real makeProviderContext()
 * from @rohinik-org/provider-sdk.
 *
 * Delegates entirely to the SDK's implementation so test-time secret gating
 * is identical to runtime gating.
 */

import { makeProviderContext } from '@rohinik-org/provider-sdk'

export type { ProviderContext } from '@rohinik-org/provider-sdk'

export interface TestProviderContextOptions {
  readonly declaredRefs: readonly string[]
  readonly secrets?:     Record<string, string>
  readonly requestId?:   string
  readonly signal?:      AbortSignal
}

export function createTestProviderContext(opts: TestProviderContextOptions) {
  return makeProviderContext({
    declaredRefs: opts.declaredRefs,
    secrets:      opts.secrets ?? {},
    requestId:    opts.requestId,
    signal:       opts.signal,
  })
}

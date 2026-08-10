/**
 * ProviderDefinition — the author-facing output of defineProvider().
 *
 * This is NOT a ProviderEntry (runtime registry record), NOT an admission
 * decision, NOT a routing certificate. It is the author's declared intent.
 *
 * What this is:
 *   - Declared capabilities (claimed, not granted)
 *   - Declared secret references (names only — never values)
 *   - Declared ID and version
 *   - execute() and health() implementations
 *
 * What this is NOT:
 *   - A routable provider (no routing key, no baseUrl)
 *   - A trusted provider (no trust certificate)
 *   - An admitted provider (no admission token)
 *   - A secret store (no resolved secret values)
 */

import type { ProviderCapabilities } from './capabilities.js'
import type { ProviderContext } from './context.js'
import type { ProviderRequest, ProviderResult } from './request.js'

export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'

export interface ProviderHealthResult {
  readonly status:     ProviderHealthStatus
  readonly latencyMs?: number
  readonly message?:   string
}

export interface ProviderDefinition {
  readonly id:           string
  readonly version:      string
  readonly capabilities: ProviderCapabilities
  readonly secretRefs:   readonly string[]
  readonly execute:      (ctx: ProviderContext, request: ProviderRequest) => Promise<ProviderResult>
  readonly health:       (ctx: ProviderContext) => Promise<ProviderHealthResult>
}

export interface DefineProviderOptions {
  id:           string
  version:      string
  capabilities: ProviderCapabilities
  /**
   * Names of secrets this provider needs.
   * Reference names only — actual values are NEVER stored here.
   * Rohinik resolves values at runtime via SecretReader.
   * Attempting secretRef() on an undeclared name throws.
   */
  secretRefs?:  readonly string[]
  execute:      (ctx: ProviderContext, request: ProviderRequest) => Promise<ProviderResult>
  health:       (ctx: ProviderContext) => Promise<ProviderHealthResult>
}

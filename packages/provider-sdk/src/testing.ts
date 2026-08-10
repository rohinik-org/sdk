/**
 * makeProviderContext — creates a bounded ProviderContext for local testing.
 *
 * Used in tests to wire a ProviderDefinition's execute()/health() without
 * a live runtime. In production, the runtime constructs the real context
 * with actual secret resolution, telemetry sinks, and request tracing.
 *
 * The test context enforces the same secretRef boundary: only declared
 * secretRefs are resolvable. Attempting to resolve an undeclared name throws
 * (same behaviour as the runtime's SecretReader).
 */

import type { ProviderContext, ProviderTelemetry } from './context.js'

export interface MakeProviderContextOptions {
  requestId?:   string
  signal?:      AbortSignal
  /** Map of declared secret names → test values. Keys must match secretRefs[]. */
  secrets?:     Readonly<Record<string, string>>
  /** Which secret names are declared by this provider (to enforce boundary). */
  declaredRefs: readonly string[]
}

export function makeProviderContext(opts: MakeProviderContextOptions): ProviderContext {
  const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }[] = []
  const evidence: Array<{ key: string; value: unknown }> = []

  const telemetry: ProviderTelemetry = {
    recordUsage(u) { usage.push(u) },
    emit(key, value) { evidence.push({ key, value }) },
  }

  return {
    requestId: opts.requestId ?? `test-${Date.now()}`,
    signal:    opts.signal,
    telemetry,
    secretRef(name) {
      const declaredSet = new Set(opts.declaredRefs)
      if (!declaredSet.has(name)) {
        throw new Error(
          `secretRef("${name}"): not declared in provider secretRefs. ` +
          `Declared: [${[...declaredSet].join(', ')}]`,
        )
      }
      const value = opts.secrets?.[name]
      if (value === undefined) {
        throw new Error(`secretRef("${name}"): secret not set in test context`)
      }
      return value
    },
  }
}

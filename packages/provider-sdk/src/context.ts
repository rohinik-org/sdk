/**
 * ProviderContext — what execute() and health() receive at runtime.
 *
 * Bounded surface: only request identity, cancellation, secret lookup
 * (by declared reference only), and a bounded telemetry emitter.
 *
 * NOT present: RuntimeHost, registries, policy engines, raw secret stores,
 * filesystem access, or any service locator. A provider gets exactly what
 * it declared it needs — nothing more.
 *
 * Secret rule: secretRef(name) resolves only names declared in the
 * provider's secretRefs[]. Attempting to resolve an undeclared name throws
 * at author-test time and is refused at runtime. The actual secret value
 * is never embedded in the ProviderDefinition — Rohinik resolves it.
 */

export interface ProviderTelemetry {
  /** Record a usage observation for this request (advisory, not authoritative billing). */
  recordUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): void
  /** Emit a named evidence entry for observability. */
  emit(key: string, value: unknown): void
}

export interface ProviderContext {
  /** Unique ID for this provider invocation */
  readonly requestId: string
  /** Cancellation signal — abort any in-flight network calls when triggered */
  readonly signal?: AbortSignal
  /**
   * Resolve a declared secret reference to its value.
   * Throws if name was not declared in secretRefs[].
   * At author-test time, resolves to process.env[name] when set.
   */
  secretRef(name: string): string
  /** Bounded telemetry — advisory only; runtime seals authoritative evidence separately */
  readonly telemetry: ProviderTelemetry
}

/**
 * Provider capability flags.
 *
 * These are DECLARED capabilities — what the provider claims to support.
 * The runtime decides whether to trust, route, or validate the claim.
 *
 * Critical boundary invariants:
 *   provider declares structuredOutput: true  ≠  output is automatically trusted
 *   provider declares tools: true             ≠  tool calling is enabled for caller
 *   provider declares streaming: true         ≠  streaming is guaranteed
 *
 * These flags feed into routing/admission decisions. Schema validation,
 * tool policy, and output trust remain server-authoritative.
 *
 * Maps to ProvidedCapabilityDeclaration[] in @rohinik-org/package-manifest-ir.
 * The runtime may add or override these during package ingestion.
 */

export interface ProviderCapabilities {
  /** Provider supports text generation */
  readonly text?: boolean
  /** Provider supports streaming (chunked) output */
  readonly streaming?: boolean
  /**
   * Provider supports structured JSON output aligned to a declared schema.
   * Declaring true does NOT bypass server-side output schema validation.
   */
  readonly structuredOutput?: boolean
  /**
   * Provider supports tool/function calling.
   * Must be explicitly declared — a text-only provider cannot masquerade as tool-capable.
   */
  readonly tools?: boolean
  /** Provider supports image/file inputs */
  readonly vision?: boolean
  /** Provider supports extended context windows */
  readonly longContext?: boolean
}

/** Capability key names that map to ProvidedCapabilityDeclaration.capability */
export const CAPABILITY_NAMES: Readonly<Record<keyof ProviderCapabilities, string>> = {
  text:             'text',
  streaming:        'streaming',
  structuredOutput: 'structured-output',
  tools:            'tool-calling',
  vision:           'vision',
  longContext:      'long-context',
}

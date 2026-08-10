/**
 * @rohinik-org/provider-sdk
 *
 * Developer authoring SDK for Rohinik providers.
 *
 * Core boundary invariants (enforced by this SDK, not defeatable):
 *   provider declares capabilities       ≠ Rohinik trusts capabilities
 *   provider references secret           ≠ provider owns secret
 *   provider returns usage               ≠ usage is authoritative billing truth
 *   provider supports structuredOutput   ≠ output is automatically trusted
 *   provider implementation exists       ≠ provider is routable
 *
 * Secret rule: secretRefs[] contains env-var names only — never values.
 *   ProviderContext.secretRef(name) is gated to declared names only.
 *   No secret value is present on ProviderDefinition.
 */

// Primary authoring API
export { defineProvider } from './define.js'

// Types
export type { ProviderDefinition, DefineProviderOptions, ProviderHealthResult, ProviderHealthStatus } from './definition.js'
export type { ProviderContext, ProviderTelemetry } from './context.js'
export type { ProviderCapabilities } from './capabilities.js'
export { CAPABILITY_NAMES } from './capabilities.js'
export type { ProviderRequest, ProviderResult, ProviderMessage, ProviderToolDefinition, ProviderToolCall, ProviderUsage } from './request.js'

// Validation
export { validateProviderDefinition } from './validate.js'
export type { ProviderValidationResult } from './validate.js'

// Testing utilities
export { makeProviderContext } from './testing.js'
export type { MakeProviderContextOptions } from './testing.js'

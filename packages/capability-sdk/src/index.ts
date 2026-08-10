/**
 * @rohinik-org/capability-sdk
 *
 * Developer authoring SDK for Rohinik capabilities.
 *
 * Core boundary invariants (enforced by this SDK, not defeatable):
 *   defineCapability() ≠ register capability ID
 *   capability definition ≠ capability contract (CapabilityManifestIR)
 *   package contains capability ≠ runtime admits capability
 *   runtime admits capability ≠ permission granted
 */

// Primary authoring API
export { defineCapability } from './define.js'

// Types
export type { CapabilityDefinition, DefineCapabilityOptions } from './definition.js'
export type { CapabilityContext } from './context.js'

// Validation
export { validateCapabilityDefinition } from './validate.js'
export type { ValidationResult } from './validate.js'

// Permission helpers
export { permission, permissions } from './permissions.js'
export type { PermissionDeclaration } from './permissions.js'

// Schema field helpers
export { inputField, outputField } from './schema.js'
export type { CapabilityInputSchema, CapabilityOutputSchema } from './schema.js'

// Result helpers
export { result } from './result.js'
export type { CapabilityResult } from './result.js'

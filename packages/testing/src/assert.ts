/**
 * Assert helpers — thin wrappers over real SDK validation functions.
 * Throw descriptive errors; designed for use inside any test framework.
 *
 * All validation delegates to the SDK's own validateXxx() — no reimplementation.
 */

import { validateCapabilityDefinition } from '@rohinik-org/capability-sdk'
import { validateAgentDefinition }      from '@rohinik-org/agent-sdk'
import { validateProviderDefinition }   from '@rohinik-org/provider-sdk'
import { validatePackageDefinition }    from '@rohinik-org/package-sdk'

function raise(label: string, errors: readonly string[]): never {
  throw new Error(`${label} validation failed:\n${errors.map(e => `  • ${e}`).join('\n')}`)
}

export function assertValidCapability(def: unknown): void {
  const r = validateCapabilityDefinition(def as Parameters<typeof validateCapabilityDefinition>[0])
  if (!r.ok) raise('assertValidCapability', r.errors)
}

export function assertValidAgent(def: unknown): void {
  const r = validateAgentDefinition(def as Parameters<typeof validateAgentDefinition>[0])
  if (!r.ok) raise('assertValidAgent', r.errors)
}

export function assertValidProvider(def: unknown): void {
  const r = validateProviderDefinition(def as Parameters<typeof validateProviderDefinition>[0])
  if (!r.ok) raise('assertValidProvider', r.errors)
}

export function assertValidPackage(def: unknown): void {
  const r = validatePackageDefinition(def as Parameters<typeof validatePackageDefinition>[0])
  if (!r.ok) raise('assertValidPackage', r.errors)
}

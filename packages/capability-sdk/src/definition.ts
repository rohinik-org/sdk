/**
 * CapabilityDefinition — the author-facing output of defineCapability().
 *
 * This is NOT a CapabilityManifestIR. It is richer: it carries the typed
 * execute function. The runtime extracts the manifest portion at package install;
 * the SDK validates it locally. A definition existing does not admit the
 * capability to the runtime — that is the runtime's trust/install decision.
 */

import type { CapabilityInputSchema, CapabilityOutputSchema } from '@rohinik-org/capability-manifest'
import type { CapabilityContext } from './context.js'
import type { PermissionDeclaration } from './permissions.js'

export interface CapabilityDefinition<TInput = unknown, TOutput = unknown> {
  readonly id:          string
  readonly name?:       string
  readonly description?: string
  readonly version?:    string
  readonly tier?:       string
  readonly tags?:       readonly string[]
  readonly input:       readonly CapabilityInputSchema[]
  readonly output:      readonly CapabilityOutputSchema[]
  readonly permissions: readonly PermissionDeclaration[]
  readonly execute:     (ctx: CapabilityContext, input: TInput) => Promise<TOutput>
}

export interface DefineCapabilityOptions<TInput = unknown, TOutput = unknown> {
  id:          string
  name?:       string
  description?: string
  version?:    string
  tier?:       string
  tags?:       readonly string[]
  input:       readonly CapabilityInputSchema[]
  output:      readonly CapabilityOutputSchema[]
  permissions: readonly PermissionDeclaration[]
  execute:     (ctx: CapabilityContext, input: TInput) => Promise<TOutput>
}

/**
 * defineCapability — the primary authoring API.
 *
 * Validates the definition locally and returns it frozen.
 * Throws if the capability ID or any field is invalid — errors surface
 * at module load time, not at runtime ingestion.
 *
 * What this does NOT do:
 *   - Register the capability with the runtime
 *   - Admit the capability ID as valid in the runtime's registry
 *   - Grant any permissions
 *   - Import any runtime-internal package
 */

import type { DefineCapabilityOptions, CapabilityDefinition } from './definition.js'
import { validateCapabilityDefinition } from './validate.js'

export function defineCapability<TInput = unknown, TOutput = unknown>(
  opts: DefineCapabilityOptions<TInput, TOutput>,
): CapabilityDefinition<TInput, TOutput> {
  // Cast through unknown to satisfy the validator's non-generic signature
  const def = Object.freeze({
    id:          opts.id,
    name:        opts.name,
    description: opts.description,
    version:     opts.version  ?? '0.1.0',
    tier:        opts.tier     ?? 'LOCAL',
    tags:        opts.tags     ?? [],
    input:       opts.input,
    output:      opts.output,
    permissions: opts.permissions,
    execute:     opts.execute,
  }) as CapabilityDefinition<TInput, TOutput>

  const result = validateCapabilityDefinition(def as CapabilityDefinition)
  if (!result.ok) {
    throw new Error(
      `defineCapability("${opts.id}") failed validation:\n` +
      result.errors.map(e => `  • ${e}`).join('\n'),
    )
  }

  return def
}

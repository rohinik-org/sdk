/**
 * defineProvider — the primary authoring API.
 *
 * Validates the definition locally and returns it frozen.
 * Throws if any field is structurally invalid or a potential secret value
 * is detected in secretRefs.
 *
 * Critical invariants enforced here:
 *   provider declares capabilities ≠ Rohinik trusts capabilities
 *   provider references secret       ≠ provider owns secret
 *   provider returns usage           ≠ usage is authoritative billing truth
 *   provider supports structuredOutput ≠ output is automatically trusted
 *   provider implementation exists   ≠ provider is routable
 *
 * The returned ProviderDefinition contains NO secret values — only names.
 */

import type { DefineProviderOptions, ProviderDefinition } from './definition.js'
import { validateProviderDefinition } from './validate.js'

export function defineProvider(opts: DefineProviderOptions): ProviderDefinition {
  const def: ProviderDefinition = Object.freeze({
    id:           opts.id,
    version:      opts.version,
    capabilities: Object.freeze({ ...opts.capabilities }),
    secretRefs:   Object.freeze([...(opts.secretRefs ?? [])]),
    execute:      opts.execute,
    health:       opts.health,
  })

  const result = validateProviderDefinition(def)
  if (!result.ok) {
    throw new Error(
      `defineProvider("${opts.id}") failed validation:\n` +
      result.errors.map(e => `  • ${e}`).join('\n'),
    )
  }

  return def
}

/**
 * defineAgent — the primary authoring API.
 *
 * Validates the definition locally and returns it frozen.
 * Throws if any field is structurally invalid — errors surface at module
 * load time, not at admission time.
 *
 * What this does NOT produce:
 *   - An AgentInstance (no instanceId)
 *   - An AgentRunHandle (no runId, no run lifecycle)
 *   - A DelegationCertificate (no fingerprint, no grantedAuthority)
 *   - An AgentAdmissionResult (no admitted: true/false from the runtime)
 *
 * defineAgent() ≠ admit()
 * requested authority ≠ granted authority
 * declared capabilities ≠ available capabilities
 * default budget ≠ admitted budget
 */

import type { DefineAgentOptions, AgentDefinition } from './definition.js'
import { validateAgentDefinition } from './validate.js'

export function defineAgent(opts: DefineAgentOptions): AgentDefinition {
  const def: AgentDefinition = Object.freeze({
    id:           opts.id,
    version:      opts.version,
    role:         opts.role,
    goals:        opts.goals        ?? [],
    capabilities: opts.capabilities ?? [],
    authority: Object.freeze({
      allowedCapabilities: opts.authority?.allowedCapabilities ?? [],
      allowedActions:      opts.authority?.allowedActions      ?? [],
      deniedActions:       opts.authority?.deniedActions       ?? [],
      maxDelegationDepth:  opts.authority?.maxDelegationDepth  ?? 0,
    }),
    budget: Object.freeze({
      maxCostUsd:   opts.budget?.maxCostUsd,
      maxLatencyMs: opts.budget?.maxLatencyMs,
      maxTokens:    opts.budget?.maxTokens,
    }),
    policy:       opts.policy ?? [],
    instructions: opts.instructions,
  })

  const result = validateAgentDefinition(def)
  if (!result.ok) {
    throw new Error(
      `defineAgent("${opts.id}") failed validation:\n` +
      result.errors.map(e => `  • ${e}`).join('\n'),
    )
  }

  return def
}

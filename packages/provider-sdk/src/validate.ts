/**
 * Local validation of a ProviderDefinition.
 *
 * Mirrors constraints from package-manifest-ir and provider contracts.
 * Errors surface at author-time, not at runtime ingestion.
 *
 * Rules:
 *   1. ID: non-empty string, no whitespace
 *   2. Version: non-empty semver-like (N.N.N minimum)
 *   3. Capabilities: at least one declared; no contradictions
 *      - tools: true requires text: true or structuredOutput: true
 *        (a tool-only provider with no output capability is incoherent)
 *   4. SecretRefs: each entry non-empty, no duplicates
 *   5. Secrets: provider must NOT embed actual secret values.
 *      Scan declared secretRefs for common secret value patterns.
 *      (Defense-in-depth; real scan happens at pack time.)
 *   6. execute and health must be functions
 *
 * Security: The secret-value pattern scan here is author-time guidance only.
 * The authoritative scan runs at T8 pack time against the full artifact.
 */

import type { ProviderDefinition } from './definition.js'

const SEMVER_RE     = /^\d+\.\d+\.\d+/
const NO_WHITESPACE = /^\S+$/

// Common secret value patterns — heuristic to catch obvious mistakes
const SECRET_VALUE_PATTERNS = [
  /^sk-[A-Za-z0-9]{20,}/,     // OpenAI-style keys
  /^Bearer\s+\S+/i,            // Auth headers accidentally passed as names
  /^[A-Za-z0-9+/]{40,}={0,2}$/, // Base64-encoded blobs (>= 40 chars)
  /^ghp_[A-Za-z0-9]{36}/,      // GitHub personal access tokens
  /^xoxb-/,                    // Slack bot tokens
]

function looksLikeSecretValue(s: string): boolean {
  return SECRET_VALUE_PATTERNS.some(re => re.test(s))
}

export interface ProviderValidationResult {
  readonly ok:     boolean
  readonly errors: readonly string[]
}

export function validateProviderDefinition(def: ProviderDefinition): ProviderValidationResult {
  const errors: string[] = []

  // ID
  if (!def.id.trim() || !NO_WHITESPACE.test(def.id)) {
    errors.push(`id "${def.id}" is invalid — must be a non-empty string with no whitespace`)
  }

  // Version
  if (!def.version.trim() || !SEMVER_RE.test(def.version)) {
    errors.push(`version "${def.version}" is invalid — must start with N.N.N`)
  }

  // Capabilities: at least one must be true
  const caps = def.capabilities
  const hasCap = Object.values(caps).some(v => v === true)
  if (!hasCap) {
    errors.push('capabilities: at least one capability must be declared true')
  }

  // tools: true requires a text or structured output channel
  if (caps.tools && !caps.text && !caps.structuredOutput) {
    errors.push('capabilities: tools:true requires text:true or structuredOutput:true (provider must have an output channel)')
  }

  // SecretRefs
  const seen = new Set<string>()
  for (const ref of def.secretRefs) {
    if (!ref.trim()) {
      errors.push('secretRefs: entry is empty — secret references must be non-empty env-var names')
      continue
    }
    if (seen.has(ref)) {
      errors.push(`secretRefs: duplicate entry "${ref}"`)
    }
    seen.add(ref)

    // Heuristic: name itself looks like a secret value (e.g., author accidentally inlined the key)
    if (looksLikeSecretValue(ref)) {
      errors.push(
        `secretRefs: "${ref.slice(0, 20)}..." looks like an actual secret value, not a reference name. ` +
        `Use the env-var name (e.g., "MY_API_KEY"), not the value.`,
      )
    }
  }

  // execute and health
  if (typeof def.execute !== 'function') errors.push('execute must be a function')
  if (typeof def.health  !== 'function') errors.push('health must be a function')

  return { ok: errors.length === 0, errors }
}

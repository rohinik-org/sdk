/**
 * Local validation of a CapabilityDefinition.
 *
 * Mirrors the rules from capability-manifest/manifest-parser.ts and
 * capability-ir so authors get errors at author-time, not at install-time.
 *
 * Rules enforced here:
 *   1. ID format: /^[a-z0-9-]+:[a-z0-9-]+$/  (manifest-parser's stricter rule)
 *   2. Reserved prefixes: system:, internal:, runtime:
 *   3. Permissions: domain and value non-empty
 *   4. Input/output fields: name and type non-empty
 *   5. execute must be a function
 */

import { CAPABILITY_ID_PATTERN } from '@rohinik-org/capability-ir'
import type { CapabilityDefinition } from './definition.js'

export interface ValidationResult {
  readonly ok:     boolean
  readonly errors: readonly string[]
}

// Manifest-parser uses this stricter pattern (domain:capability only, no 3–4 segments)
const MANIFEST_ID_RE = /^[a-z0-9-]+:[a-z0-9-]+$/
const RESERVED_PREFIXES = ['system:', 'internal:', 'runtime:']

export function validateCapabilityDefinition(def: CapabilityDefinition): ValidationResult {
  const errors: string[] = []

  // ID must satisfy the strict manifest-parser pattern (superset of capability-ir pattern)
  if (!MANIFEST_ID_RE.test(def.id)) {
    errors.push(
      `id "${def.id}" is invalid — must match ^[a-z0-9-]+:[a-z0-9-]+$ ` +
      `(CAPABILITY_ID_PATTERN also requires: ${CAPABILITY_ID_PATTERN})`,
    )
  }

  for (const prefix of RESERVED_PREFIXES) {
    if (def.id.startsWith(prefix)) {
      errors.push(`id "${def.id}" uses reserved prefix "${prefix}"`)
    }
  }

  for (const field of def.input) {
    if (!field.name.trim()) errors.push('input field has empty name')
    if (!field.type.trim()) errors.push(`input field "${field.name}" has empty type`)
  }

  for (const field of def.output) {
    if (!field.name.trim()) errors.push('output field has empty name')
    if (!field.type.trim()) errors.push(`output field "${field.name}" has empty type`)
  }

  for (const perm of def.permissions) {
    if (!perm.domain.trim()) errors.push('permission has empty domain')
    if (!perm.value.trim())  errors.push(`permission domain "${perm.domain}" has empty value`)
  }

  if (typeof def.execute !== 'function') {
    errors.push('execute must be a function')
  }

  return { ok: errors.length === 0, errors }
}

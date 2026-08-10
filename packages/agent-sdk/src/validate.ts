/**
 * Local validation of an AgentDefinition.
 *
 * Mirrors structural constraints from agent-ir and agent-delegation contracts
 * so authors get errors at author-time, not at admission-time.
 *
 * Rules:
 *   1. ID: non-empty, lowercase alphanumeric + hyphens, no spaces
 *   2. Version: non-empty semver-like (at least N.N.N)
 *   3. Role: non-empty string
 *   4. Goals: each description non-empty; priority must be known value if set
 *   5. Capabilities: each entry non-empty string matching capability ID pattern
 *   6. Authority: maxDelegationDepth >= 0 (integer); no capability in both
 *      allowedCapabilities and deniedActions would be odd but not rejected here
 *      (runtime enforces semantic policy)
 *   7. Budget: all numeric fields >= 0 when present
 *   8. Policy refs: policyId and policyKind both non-empty
 *   9. instructions must be a function
 */

import type { AgentDefinition } from './definition.js'

const AGENT_ID_RE  = /^[a-z][a-z0-9-]*$/
const SEMVER_RE    = /^\d+\.\d+\.\d+/
const CAPABILITY_RE = /^[a-z0-9-]+:[a-z0-9-]+$/
const VALID_PRIORITIES = new Set(['CRITICAL', 'HIGH', 'NORMAL', 'LOW'])

export interface AgentValidationResult {
  readonly ok:     boolean
  readonly errors: readonly string[]
}

export function validateAgentDefinition(def: AgentDefinition): AgentValidationResult {
  const errors: string[] = []

  // ID
  if (!def.id.trim() || !AGENT_ID_RE.test(def.id)) {
    errors.push(`id "${def.id}" is invalid — must match ^[a-z][a-z0-9-]*$ (lowercase, no spaces)`)
  }

  // Version
  if (!def.version.trim() || !SEMVER_RE.test(def.version)) {
    errors.push(`version "${def.version}" is invalid — must start with N.N.N`)
  }

  // Role
  if (!def.role.trim()) {
    errors.push('role must be a non-empty string')
  }

  // Goals
  for (const goal of def.goals) {
    if (!goal.description.trim()) errors.push('goal has empty description')
    if (goal.priority && !VALID_PRIORITIES.has(goal.priority)) {
      errors.push(`goal priority "${goal.priority}" must be CRITICAL | HIGH | NORMAL | LOW`)
    }
  }

  // Capabilities
  for (const cap of def.capabilities) {
    if (!CAPABILITY_RE.test(cap)) {
      errors.push(`capability "${cap}" is invalid — must match ^[a-z0-9-]+:[a-z0-9-]+$`)
    }
  }

  // Authority
  const auth = def.authority
  if (!Number.isInteger(auth.maxDelegationDepth) || auth.maxDelegationDepth < 0) {
    errors.push(`authority.maxDelegationDepth must be a non-negative integer, got ${auth.maxDelegationDepth}`)
  }
  for (const cap of auth.allowedCapabilities) {
    if (!CAPABILITY_RE.test(cap)) {
      errors.push(`authority.allowedCapabilities entry "${cap}" is invalid — must match ^[a-z0-9-]+:[a-z0-9-]+$`)
    }
  }

  // Budget
  const budget = def.budget
  if (budget.maxCostUsd   !== undefined && budget.maxCostUsd   < 0) errors.push('budget.maxCostUsd must be >= 0')
  if (budget.maxLatencyMs !== undefined && budget.maxLatencyMs < 0) errors.push('budget.maxLatencyMs must be >= 0')
  if (budget.maxTokens    !== undefined && budget.maxTokens    < 0) errors.push('budget.maxTokens must be >= 0')

  // Policy refs
  for (const ref of def.policy) {
    if (!ref.policyId.trim())   errors.push('policy ref has empty policyId')
    if (!ref.policyKind.trim()) errors.push('policy ref has empty policyKind')
  }

  // instructions
  if (typeof def.instructions !== 'function') {
    errors.push('instructions must be a function')
  }

  return { ok: errors.length === 0, errors }
}

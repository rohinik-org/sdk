/**
 * AgentDefinition — the author-facing output of defineAgent().
 *
 * This is NOT an AgentVersion, AgentInstance, or AgentAdmissionResult.
 * It is richer than AgentDefinition from agent-ir (which is minimal metadata only)
 * and corresponds semantically to AgentVersion's composite fields, minus
 * all runtime-assigned IDs, timestamps, and admission state.
 *
 * What this is:
 *   - Author's declared intent for an agent
 *   - Locally validated against agent-ir contracts
 *
 * What this is NOT:
 *   - An admitted agent (no runId, no instanceId)
 *   - A delegation certificate (no fingerprint, no grantedAuthority)
 *   - An AgentHandle or AgentRunHandle (those belong to @rohinik-org/agent)
 */

import type { AgentContext } from './context.js'
import type { AuthorityDeclaration } from './authority.js'
import type { BudgetDeclaration } from './budget.js'

export interface GoalDeclaration {
  readonly description: string
  readonly priority?:   'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
  readonly required?:   boolean
}

export interface PolicyReference {
  readonly policyId:   string
  readonly policyKind: string
}

export interface AgentDefinition {
  readonly id:           string
  readonly version:      string
  readonly role:         string
  readonly goals:        readonly GoalDeclaration[]
  readonly capabilities: readonly string[]
  readonly authority:    AuthorityDeclaration
  readonly budget:       BudgetDeclaration
  readonly policy:       readonly PolicyReference[]
  readonly instructions: (ctx: AgentContext) => Promise<string>
}

export interface DefineAgentOptions {
  id:           string
  version:      string
  role:         string
  goals?:       readonly GoalDeclaration[]
  capabilities?: readonly string[]
  authority?:   Partial<AuthorityDeclaration>
  budget?:      BudgetDeclaration
  policy?:      readonly PolicyReference[]
  instructions: (ctx: AgentContext) => Promise<string>
}

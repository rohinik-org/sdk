/**
 * @rohinik-org/agent-sdk
 *
 * Developer authoring SDK for Rohinik agents.
 *
 * Core boundary invariants (enforced by this SDK, not defeatable):
 *   AgentDefinition ≠ AgentInstance
 *   requested authority ≠ granted authority
 *   declared capabilities ≠ available capabilities
 *   default budget ≠ admitted budget
 *   defineAgent() ≠ admit()
 *
 * Runtime handles (AgentHandle, AgentRunHandle, DelegationHandle, admit()) live
 * in @rohinik-org/agent — the operate/admit/run/delegate package.
 */

// Primary authoring API
export { defineAgent } from './define.js'

// Types
export type { AgentDefinition, DefineAgentOptions, GoalDeclaration, PolicyReference } from './definition.js'
export type { AgentContext } from './context.js'
export type { AuthorityDeclaration } from './authority.js'
export type { BudgetDeclaration } from './budget.js'

// Validation
export { validateAgentDefinition } from './validate.js'
export type { AgentValidationResult } from './validate.js'

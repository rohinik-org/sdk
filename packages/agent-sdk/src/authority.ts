/**
 * Author-facing authority declaration.
 *
 * Maps to AgentAuthority from @rohinik-org/agent-ir, minus the runtime-assigned
 * authorityId. This is REQUESTED authority — the runtime decides what is GRANTED.
 *
 * Attenuation invariant (from agent-delegation):
 *   delegated child authority MUST be strictly ⊆ parent authority
 *   delegated child maxDelegationDepth MUST be strictly < parent maxDelegationDepth
 *
 * The SDK validates structural validity (non-negative depth, no contradictions).
 * It cannot validate whether the runtime will grant what is requested.
 */

export interface AuthorityDeclaration {
  /** Capability IDs this agent requests permission to use */
  readonly allowedCapabilities: readonly string[]
  /** Action strings this agent requests permission to perform */
  readonly allowedActions:      readonly string[]
  /** Action strings explicitly denied (cannot be granted even if in allowedActions) */
  readonly deniedActions:       readonly string[]
  /**
   * Maximum delegation chain depth this agent may initiate.
   * 0 = cannot delegate. The runtime enforces strict attenuation.
   */
  readonly maxDelegationDepth: number
}

/**
 * Author-facing budget declaration.
 *
 * Maps to AgentBudget from @rohinik-org/agent-ir, minus the runtime-assigned
 * budgetId. This is the DEFAULT/REQUESTED ceiling — the runtime decides the
 * ADMITTED budget (which may be lower).
 *
 * All fields optional; omitted fields mean "no declared ceiling".
 * The runtime's admission service may apply its own ceilings regardless.
 */

export interface BudgetDeclaration {
  /** Maximum cost in USD this agent is expected to incur */
  readonly maxCostUsd?:   number
  /** Maximum wall-clock latency in milliseconds */
  readonly maxLatencyMs?: number
  /** Maximum tokens across all model invocations */
  readonly maxTokens?:    number
}

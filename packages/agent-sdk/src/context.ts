/**
 * AgentContext — what the instructions() function receives at author-time.
 *
 * Contains only what an agent author needs to render instructions:
 * identity of the requesting session, the goal being executed, and
 * any user-supplied parameters.
 *
 * No runtime handles, no run IDs, no delegation certificates.
 * Those belong to @rohinik-org/agent (operate/admit layer), not here.
 */

export interface AgentContext {
  /** ID of the workspace this agent is executing within */
  readonly workspaceId: string
  /** Human-readable label for the current goal/task */
  readonly goalLabel?: string
  /** Arbitrary author-supplied parameters (passed at invocation time) */
  readonly params: Readonly<Record<string, unknown>>
  /** Cancellation signal — respect this in any async work inside instructions() */
  readonly signal?: AbortSignal
}

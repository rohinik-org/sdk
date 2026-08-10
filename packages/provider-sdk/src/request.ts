/**
 * ProviderRequest and ProviderResult — the execute() contract.
 *
 * ProviderRequest is a normalized inbound request; the provider normalizes
 * its response into ProviderResult. The runtime then validates the result
 * against declared schemas — provider-reported output is not automatically
 * trusted even if structuredOutput: true is declared.
 *
 * Usage in ProviderResult is advisory. The runtime seals authoritative
 * evidence separately (TokenUsageObservation / CostObservation in
 * execution-evidence-ir). Provider-reported usage ≠ authoritative billing.
 */

export interface ProviderMessage {
  readonly role:    'user' | 'assistant' | 'system'
  readonly content: string
}

export interface ProviderRequest {
  /** Normalized capability being invoked */
  readonly capability: string
  /** Conversation messages or prompt */
  readonly messages: readonly ProviderMessage[]
  /** Optional declared output schema ID (from 16C OutputSchemaRef.schemaId) */
  readonly outputSchemaId?: string
  /** Tool definitions when tools capability is in use */
  readonly tools?: readonly ProviderToolDefinition[]
  /** Caller-supplied model parameters (temperature, maxTokens, etc.) */
  readonly params?: Readonly<Record<string, unknown>>
}

export interface ProviderToolDefinition {
  readonly name:        string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}

export interface ProviderToolCall {
  readonly id:        string
  readonly name:      string
  readonly arguments: Readonly<Record<string, unknown>>
}

export interface ProviderUsage {
  readonly inputTokens?:  number
  readonly outputTokens?: number
  readonly totalTokens?:  number
}

export interface ProviderResult {
  /** Primary text output — present for text capability */
  readonly text?:       string
  /** Parsed JSON for structuredOutput capability — NOT authoritative; runtime re-validates */
  readonly data?:       unknown
  /** Tool calls requested by the model */
  readonly toolCalls?:  readonly ProviderToolCall[]
  /**
   * Self-reported usage — advisory only.
   * Runtime seals authoritative evidence separately.
   * provider returns usage ≠ usage is authoritative billing truth.
   */
  readonly usage?:      ProviderUsage
  /** Stop reason from the underlying model */
  readonly stopReason?: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | string
}

// packages/sdk-contracts/src/matching.ts
export interface MatcherRoutingRequest {
  readonly intentHint?: string
  readonly content?: string
  readonly contentType?: string
}

export interface MatchContext {
  readonly sessionId?: string
}

export interface MatchExplanation {
  readonly code: string
  readonly message: string
  readonly data?: Record<string, unknown>
}

export interface MatchResult {
  readonly matched: boolean
  readonly rawConfidence: number
  readonly matcherId: string
  readonly explanation: MatchExplanation
  readonly evidence?: Record<string, unknown>
}

export interface Matcher {
  readonly id: string
  match(request: MatcherRoutingRequest, context?: MatchContext): MatchResult
}

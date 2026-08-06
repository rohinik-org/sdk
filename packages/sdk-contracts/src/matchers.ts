// packages/sdk-contracts/src/matchers.ts
import type { Matcher, MatchResult, MatcherRoutingRequest, MatchContext } from './matching.js'

export interface Token { readonly value: string }
export interface Tokenizer { tokenize(text: string): readonly Token[] }

export class EnglishTokenizer implements Tokenizer {
  tokenize(text: string): readonly Token[] {
    if (text.length === 0) return []
    const raw = text.toLowerCase().split(/\W+/)
    const tokens: Token[] = []
    for (const t of raw) { if (t.length > 0) tokens.push({ value: t }) }
    return tokens
  }
}

export const DEFAULT_TOKENIZER: Tokenizer = new EnglishTokenizer()
export type KeywordTarget = 'intentHint' | 'content'

export class KeywordMatcher implements Matcher {
  readonly id = 'keyword' as const
  readonly keywords: readonly string[]
  readonly target: KeywordTarget
  readonly tokenizer: Tokenizer

  constructor(keywords: readonly string[], target: KeywordTarget = 'intentHint', tokenizer: Tokenizer = DEFAULT_TOKENIZER) {
    if (keywords.length === 0) throw new Error('KeywordMatcher requires at least one keyword')
    this.keywords = Object.freeze(keywords.map(k => k.toLowerCase()))
    this.target = target
    this.tokenizer = tokenizer
  }

  match(request: MatcherRoutingRequest, _context?: MatchContext): MatchResult {
    const raw = this.target === 'intentHint' ? request.intentHint : request.content
    const tokenValues = this.tokenizer.tokenize(raw ?? '').map(t => t.value)
    for (const keyword of this.keywords) {
      if (tokenValues.includes(keyword)) {
        return { matched: true, rawConfidence: 1.0, matcherId: this.id, explanation: { code: 'MATCH.KEYWORD', message: `Matched keyword '${keyword}' in ${this.target}`, data: { keyword, target: this.target } }, evidence: { matchedToken: keyword, target: this.target, allTokens: tokenValues } }
      }
    }
    return { matched: false, rawConfidence: 0, matcherId: this.id, explanation: { code: 'MISS.KEYWORD', message: `No keyword from [${this.keywords.join(', ')}] found in ${this.target}`, data: { keywords: [...this.keywords], target: this.target } } }
  }
}

export type ExactTarget = 'intentHint' | 'content' | 'contentType'

export class ExactMatcher implements Matcher {
  readonly id = 'exact' as const
  readonly value: string
  readonly target: ExactTarget

  constructor(value: string, target: ExactTarget = 'intentHint') { this.value = value.toLowerCase(); this.target = target }

  match(request: MatcherRoutingRequest, _context?: MatchContext): MatchResult {
    let raw: string | undefined
    switch (this.target) { case 'intentHint': raw = request.intentHint; break; case 'content': raw = request.content; break; case 'contentType': raw = request.contentType; break }
    const actual = (raw ?? '').toLowerCase()
    if (actual === this.value) return { matched: true, rawConfidence: 1.0, matcherId: this.id, explanation: { code: 'MATCH.EXACT', message: `${this.target} equals '${this.value}'`, data: { value: this.value, target: this.target } } }
    return { matched: false, rawConfidence: 0, matcherId: this.id, explanation: { code: 'MISS.EXACT', message: `${this.target} is '${actual}', expected '${this.value}'`, data: { expected: this.value, actual, target: this.target } } }
  }
}

export class ContentTypeMatcher implements Matcher {
  readonly id = 'content-type' as const
  constructor(readonly contentType: string) {}
  match(request: MatcherRoutingRequest, _context?: MatchContext): MatchResult {
    if (request.contentType === this.contentType) return { matched: true, rawConfidence: 1.0, matcherId: this.id, explanation: { code: 'MATCH.CONTENT_TYPE', message: `contentType is '${this.contentType}'`, data: { contentType: this.contentType } } }
    return { matched: false, rawConfidence: 0, matcherId: this.id, explanation: { code: 'MISS.CONTENT_TYPE', message: `contentType is '${request.contentType}', expected '${this.contentType}'`, data: { expected: this.contentType, actual: request.contentType } } }
  }
}

export class AllOfMatcher implements Matcher {
  readonly id = 'all-of' as const
  readonly matchers: readonly Matcher[]
  constructor(...matchers: readonly Matcher[]) { if (matchers.length === 0) throw new Error('AllOfMatcher requires at least one child matcher'); this.matchers = Object.freeze([...matchers]) }
  match(request: MatcherRoutingRequest, context?: MatchContext): MatchResult {
    const childCodes: string[] = []; let product = 1
    for (const m of this.matchers) {
      const r = m.match(request, context); childCodes.push(r.explanation.code)
      if (!r.matched) return { matched: false, rawConfidence: 0, matcherId: this.id, explanation: { code: 'MISS.ALL_REQUIRED', message: `Required child matcher '${m.id}' did not match: ${r.explanation.message}`, data: { failedChild: m.id, failedCode: r.explanation.code } } }
      product *= r.rawConfidence
    }
    return { matched: true, rawConfidence: product, matcherId: this.id, explanation: { code: 'MATCH.ALL', message: `All ${childCodes.length} child matchers matched`, data: { childCodes } } }
  }
}

export class AnyOfMatcher implements Matcher {
  readonly id = 'any-of' as const
  readonly matchers: readonly Matcher[]
  constructor(...matchers: readonly Matcher[]) { if (matchers.length === 0) throw new Error('AnyOfMatcher requires at least one child matcher'); this.matchers = Object.freeze([...matchers]) }
  match(request: MatcherRoutingRequest, context?: MatchContext): MatchResult {
    const childCodes: string[] = []; let bestConfidence = 0; let bestCode: string | undefined
    for (const m of this.matchers) {
      const r = m.match(request, context); childCodes.push(r.explanation.code)
      if (r.matched && r.rawConfidence > bestConfidence) { bestConfidence = r.rawConfidence; bestCode = r.explanation.code }
    }
    if (bestCode !== undefined) return { matched: true, rawConfidence: bestConfidence, matcherId: this.id, explanation: { code: 'MATCH.ANY', message: `At least one child matcher matched (best: ${bestCode})`, data: { bestChildCode: bestCode, childCodes } } }
    return { matched: false, rawConfidence: 0, matcherId: this.id, explanation: { code: 'MISS.ANY', message: `No child matcher matched`, data: { childCodes } } }
  }
}

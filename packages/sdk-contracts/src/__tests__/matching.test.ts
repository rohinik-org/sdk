// packages/sdk-contracts/src/__tests__/matching.test.ts
import { describe, it, expect } from 'vitest'
import { KeywordMatcher, ExactMatcher, ContentTypeMatcher, AllOfMatcher, AnyOfMatcher, EnglishTokenizer } from '../matchers.js'

describe('EnglishTokenizer', () => {
  it('tokenizes text to lowercase words', () => {
    const tokens = new EnglishTokenizer().tokenize('Read the FILE')
    const values = tokens.map(t => t.value)
    expect(values).toContain('read')
    expect(values).toContain('file')
  })
  it('returns empty for empty string', () => {
    expect(new EnglishTokenizer().tokenize('')).toHaveLength(0)
  })
})

describe('KeywordMatcher', () => {
  it('matches keyword in intentHint', () => {
    const r = new KeywordMatcher(['read']).match({ intentHint: 'read the file' })
    expect(r.matched).toBe(true)
    expect(r.rawConfidence).toBe(1.0)
  })
  it('misses absent keyword', () => {
    const r = new KeywordMatcher(['write']).match({ intentHint: 'read the file' })
    expect(r.matched).toBe(false)
    expect(r.rawConfidence).toBe(0)
  })
  it('throws on empty keyword array', () => {
    expect(() => new KeywordMatcher([])).toThrow('KeywordMatcher requires at least one keyword')
  })
  it('matches against content target', () => {
    expect(new KeywordMatcher(['python'], 'content').match({ content: 'write python script' }).matched).toBe(true)
  })
})

describe('ExactMatcher', () => {
  it('matches case-insensitively', () => {
    expect(new ExactMatcher('HELLO').match({ intentHint: 'hello' }).matched).toBe(true)
  })
  it('misses partial match', () => {
    expect(new ExactMatcher('hello world').match({ intentHint: 'hello' }).matched).toBe(false)
  })
})

describe('ContentTypeMatcher', () => {
  it('matches contentType', () => {
    expect(new ContentTypeMatcher('text/markdown').match({ contentType: 'text/markdown' }).matched).toBe(true)
    expect(new ContentTypeMatcher('text/markdown').match({ contentType: 'text/plain' }).matched).toBe(false)
  })
})

describe('AllOfMatcher', () => {
  it('matches when all children match', () => {
    const m = new AllOfMatcher(new KeywordMatcher(['read']), new KeywordMatcher(['file']))
    expect(m.match({ intentHint: 'read the file' }).matched).toBe(true)
  })
  it('fails when any child misses', () => {
    const m = new AllOfMatcher(new KeywordMatcher(['read']), new KeywordMatcher(['write']))
    expect(m.match({ intentHint: 'read the file' }).matched).toBe(false)
  })
  it('throws on empty children', () => { expect(() => new AllOfMatcher()).toThrow() })
})

describe('AnyOfMatcher', () => {
  it('matches when any child matches', () => {
    expect(new AnyOfMatcher(new KeywordMatcher(['read']), new KeywordMatcher(['write'])).match({ intentHint: 'read file' }).matched).toBe(true)
  })
  it('misses when no child matches', () => {
    expect(new AnyOfMatcher(new KeywordMatcher(['delete']), new KeywordMatcher(['remove'])).match({ intentHint: 'read file' }).matched).toBe(false)
  })
})

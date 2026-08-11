import { describe, it, expect } from 'vitest'
import {
  assertValidCapability,
  assertValidPackage,
  createTestCapabilityContext,
} from '@rohinik-org/testing'
import { wordCountCapability } from '../src/index.js'
import definition from '../src/package-definition.js'

describe('06-custom-capability', () => {
  it('passes capability validation', () => {
    expect(() => assertValidCapability(wordCountCapability)).not.toThrow()
  })

  it('passes package definition validation', () => {
    expect(() => assertValidPackage(definition)).not.toThrow()
  })

  it('counts words correctly', async () => {
    const ctx = createTestCapabilityContext()
    const res = await wordCountCapability.execute(ctx, { text: 'hello world foo bar' } as never)
    const out = (res as Record<string, unknown>)['value'] as Record<string, unknown>
    expect(out['count']).toBe(4)
  })

  it('returns 0 for empty string', async () => {
    const ctx = createTestCapabilityContext()
    const res = await wordCountCapability.execute(ctx, { text: '' } as never)
    const out = (res as Record<string, unknown>)['value'] as Record<string, unknown>
    expect(out['count']).toBe(0)
  })

  it('returns 0 for whitespace-only input', async () => {
    const ctx = createTestCapabilityContext()
    const res = await wordCountCapability.execute(ctx, { text: '   ' } as never)
    const out = (res as Record<string, unknown>)['value'] as Record<string, unknown>
    expect(out['count']).toBe(0)
  })

  it('capability id has no dots', () => {
    expect(wordCountCapability.id).toMatch(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/)
  })
})

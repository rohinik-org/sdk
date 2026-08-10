import { describe, it, expect } from 'vitest'
import { createTestProviderContext, assertValidProvider } from '@rohinik-org/testing'
import { myProvider } from '../src/index.js'

describe('myProvider', () => {
  it('passes assertValidProvider', () => {
    assertValidProvider(myProvider)
  })

  it('execute echoes user message', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['MY_PROVIDER_API_KEY'],
      secrets:      { MY_PROVIDER_API_KEY: 'test-key' },
    })
    const r = await myProvider.execute(ctx, {
      capability: 'text',
      messages:   [{ role: 'user', content: 'hello provider' }],
    })
    expect(r.text).toContain('hello provider')
  })

  it('health returns HEALTHY when secret is set', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['MY_PROVIDER_API_KEY'],
      secrets:      { MY_PROVIDER_API_KEY: 'test-key' },
    })
    const h = await myProvider.health(ctx)
    expect(h.status).toBe('HEALTHY')
  })

  it('health returns DEGRADED when secret not set', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['MY_PROVIDER_API_KEY'],
      secrets:      {},
    })
    const h = await myProvider.health(ctx)
    expect(h.status).toBe('DEGRADED')
  })

  it('ProviderDefinition has no secret values', () => {
    const json = JSON.stringify(myProvider, (_, v) => typeof v === 'function' ? '[fn]' : v)
    expect(json).not.toMatch(/sk-/)
    expect(json).not.toMatch(/Bearer /)
    expect(myProvider.secretRefs).toEqual(['MY_PROVIDER_API_KEY'])
  })
})

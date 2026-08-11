import { describe, it, expect } from 'vitest'
import {
  assertValidProvider,
  assertValidPackage,
  createTestProviderContext,
} from '@rohinik-org/testing'
import { echoProvider } from '../src/index.js'
import definition from '../src/package-definition.js'

describe('07-custom-provider', () => {
  it('passes provider validation', () => {
    expect(() => assertValidProvider(echoProvider)).not.toThrow()
  })

  it('passes package definition validation', () => {
    expect(() => assertValidPackage(definition)).not.toThrow()
  })

  it('echoes last user message', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['ECHO_PROVIDER_API_KEY'],
      secrets: { ECHO_PROVIDER_API_KEY: 'test-key' },
    })
    const result = await echoProvider.execute(ctx, {
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'response' },
        { role: 'user', content: 'second question' },
      ],
    } as never)
    const out = result as Record<string, unknown>
    expect(out['text']).toBe('echo: second question')
  })

  it('health returns HEALTHY when secret is declared', async () => {
    const ctx = createTestProviderContext({
      declaredRefs: ['ECHO_PROVIDER_API_KEY'],
      secrets: { ECHO_PROVIDER_API_KEY: 'test-key' },
    })
    const health = await echoProvider.health(ctx)
    expect(health.status).toBe('HEALTHY')
  })

  it('health returns DEGRADED when secret is not declared', async () => {
    const ctx = createTestProviderContext({ declaredRefs: [] })
    const health = await echoProvider.health(ctx)
    expect(health.status).toBe('DEGRADED')
  })

  it('execute throws when secret not declared', async () => {
    const ctx = createTestProviderContext({ declaredRefs: [] })
    await expect(
      echoProvider.execute(ctx, { messages: [{ role: 'user', content: 'hi' }] } as never)
    ).rejects.toThrow()
  })
})

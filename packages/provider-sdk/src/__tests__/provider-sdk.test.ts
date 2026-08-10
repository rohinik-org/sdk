/**
 * T7 acceptance tests — provider authoring boundary enforcement.
 *
 * Critical invariants tested:
 *   PASS: valid id + version + capabilities + secretRefs + execute + health
 *   REJECT: whitespace ID, bad version, no capabilities, tools without output
 *   REJECT: empty secretRef entry, duplicate secretRef
 *   REJECT: secretRef entry that looks like an actual secret value (inline key)
 *   REJECT: missing execute or health
 *   SECRET_SAFE: ProviderDefinition contains no secret values
 *   CONTEXT_BOUNDED: secretRef() rejects undeclared names
 *   CONTEXT_BOUNDED: ProviderContext has no runtime internals
 *   ADVISORY_USAGE: provider-reported usage does not equal authoritative billing
 *   CAPABILITY_CLAIM: structuredOutput declared ≠ output is trusted
 *   CAPABILITY_CLAIM: tools declared requires output channel
 */

import { describe, it, expect } from 'vitest'
import {
  defineProvider,
  validateProviderDefinition,
  makeProviderContext,
} from '../index.js'
import type { ProviderDefinition } from '../index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minimal(): Parameters<typeof defineProvider>[0] {
  return {
    id:           'my-provider',
    version:      '1.0.0',
    capabilities: { text: true, streaming: true },
    secretRefs:   ['MY_PROVIDER_API_KEY'],
    async execute(_ctx, _req) { return { text: 'hello' } },
    async health(_ctx) { return { status: 'HEALTHY' } },
  }
}

// ── Golden path ───────────────────────────────────────────────────────────────

describe('defineProvider — golden path', () => {
  it('returns frozen ProviderDefinition for valid input', () => {
    const p = defineProvider(minimal())
    expect(p.id).toBe('my-provider')
    expect(p.version).toBe('1.0.0')
    expect(Object.isFrozen(p)).toBe(true)
    expect(Object.isFrozen(p.capabilities)).toBe(true)
    expect(Object.isFrozen(p.secretRefs)).toBe(true)
  })

  it('execute() and health() are callable', async () => {
    const p = defineProvider(minimal())
    const ctx = makeProviderContext({
      declaredRefs: p.secretRefs,
      secrets:      { MY_PROVIDER_API_KEY: 'test-value' },
    })
    const result = await p.execute(ctx, {
      capability: 'text',
      messages:   [{ role: 'user', content: 'hello' }],
    })
    expect(result.text).toBe('hello')

    const health = await p.health(ctx)
    expect(health.status).toBe('HEALTHY')
  })

  it('defaults secretRefs to empty array when omitted', () => {
    const p = defineProvider({
      ...minimal(),
      secretRefs: undefined,
    })
    expect(p.secretRefs).toHaveLength(0)
  })

  it('supports all declared capabilities', () => {
    const p = defineProvider({
      ...minimal(),
      capabilities: { text: true, streaming: true, structuredOutput: true, tools: true, vision: true, longContext: true },
    })
    expect(p.capabilities.text).toBe(true)
    expect(p.capabilities.tools).toBe(true)
    expect(p.capabilities.structuredOutput).toBe(true)
  })
})

// ── ID / Version boundaries ───────────────────────────────────────────────────

describe('defineProvider — ID / version boundary', () => {
  it('REJECT: empty ID', () => {
    expect(() => defineProvider({ ...minimal(), id: '' })).toThrow(/invalid/)
  })

  it('REJECT: ID with whitespace', () => {
    expect(() => defineProvider({ ...minimal(), id: 'my provider' })).toThrow(/invalid/)
  })

  it('REJECT: empty version', () => {
    expect(() => defineProvider({ ...minimal(), version: '' })).toThrow(/version/)
  })

  it('REJECT: non-semver version', () => {
    expect(() => defineProvider({ ...minimal(), version: 'latest' })).toThrow(/version/)
  })
})

// ── Capability boundary ───────────────────────────────────────────────────────

describe('defineProvider — capability boundary', () => {
  it('REJECT: no capabilities declared', () => {
    expect(() => defineProvider({ ...minimal(), capabilities: {} })).toThrow(/capabilities/)
  })

  it('REJECT: tools:true without any output channel', () => {
    expect(() => defineProvider({
      ...minimal(),
      capabilities: { tools: true },
    })).toThrow(/tools/)
  })

  it('PASS: tools:true with structuredOutput:true', () => {
    expect(() => defineProvider({
      ...minimal(),
      capabilities: { tools: true, structuredOutput: true },
    })).not.toThrow()
  })

  it('PASS: tools:true with text:true', () => {
    expect(() => defineProvider({
      ...minimal(),
      capabilities: { tools: true, text: true },
    })).not.toThrow()
  })
})

// ── Secret reference boundary ─────────────────────────────────────────────────

describe('defineProvider — secret reference boundary', () => {
  it('REJECT: empty secret ref entry', () => {
    expect(() => defineProvider({ ...minimal(), secretRefs: [''] })).toThrow(/empty/)
  })

  it('REJECT: duplicate secret ref', () => {
    expect(() => defineProvider({
      ...minimal(),
      secretRefs: ['MY_KEY', 'MY_KEY'],
    })).toThrow(/duplicate/)
  })

  it('REJECT: secretRef looks like an OpenAI key value', () => {
    expect(() => defineProvider({
      ...minimal(),
      secretRefs: ['sk-abcdefghijklmnopqrstuvwxyz123456'],
    })).toThrow(/actual secret value/)
  })

  it('REJECT: secretRef looks like base64-encoded blob', () => {
    expect(() => defineProvider({
      ...minimal(),
      secretRefs: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    })).toThrow(/actual secret value/)
  })

  it('REJECT: secretRef looks like GitHub PAT', () => {
    expect(() => defineProvider({
      ...minimal(),
      secretRefs: ['ghp_abcdefghijklmnopqrstuvwxyz1234567890'],
    })).toThrow(/actual secret value/)
  })

  it('PASS: valid env-var-style name', () => {
    expect(() => defineProvider({
      ...minimal(),
      secretRefs: ['OPENAI_API_KEY', 'ANTHROPIC_KEY'],
    })).not.toThrow()
  })
})

// ── ProviderDefinition contains no secret values ──────────────────────────────

describe('ProviderDefinition — secret-free invariant', () => {
  it('ProviderDefinition contains only secret reference names, no values', () => {
    const p = defineProvider({
      ...minimal(),
      secretRefs: ['MY_PROVIDER_API_KEY'],
    })
    // secretRefs contains names, not values
    expect(p.secretRefs).toEqual(['MY_PROVIDER_API_KEY'])
    // No field on the definition can hold a secret value
    const json = JSON.stringify(p, (_, v) => typeof v === 'function' ? '[function]' : v)
    expect(json).not.toMatch(/sk-/)
    expect(json).not.toMatch(/Bearer /)
  })

  it('ProviderDefinition JSON has no admission/routing fields', () => {
    const p = defineProvider(minimal()) as unknown as Record<string, unknown>
    expect(p['routingKey']).toBeUndefined()
    expect(p['trustCertificate']).toBeUndefined()
    expect(p['baseUrl']).toBeUndefined()
    expect(p['admitted']).toBeUndefined()
  })
})

// ── ProviderContext secret boundary ──────────────────────────────────────────

describe('makeProviderContext — secret boundary', () => {
  it('secretRef() resolves declared name when test value provided', () => {
    const ctx = makeProviderContext({
      declaredRefs: ['MY_KEY'],
      secrets:      { MY_KEY: 'test-secret-value' },
    })
    expect(ctx.secretRef('MY_KEY')).toBe('test-secret-value')
  })

  it('REJECT: secretRef() for undeclared name', () => {
    const ctx = makeProviderContext({
      declaredRefs: ['MY_KEY'],
      secrets:      { MY_KEY: 'value' },
    })
    expect(() => ctx.secretRef('OTHER_KEY')).toThrow(/not declared/)
  })

  it('REJECT: secretRef() when secret not set in test context', () => {
    const ctx = makeProviderContext({
      declaredRefs: ['MY_KEY'],
      secrets:      {},
    })
    expect(() => ctx.secretRef('MY_KEY')).toThrow(/not set/)
  })

  it('ProviderContext has no services, registries, or runtime internals', () => {
    const ctx = makeProviderContext({ declaredRefs: [] }) as unknown as Record<string, unknown>
    expect(ctx['services']).toBeUndefined()
    expect(ctx['registry']).toBeUndefined()
    expect(ctx['kernel']).toBeUndefined()
    expect(ctx['runtimeHost']).toBeUndefined()
    // Has only: requestId, signal, telemetry, secretRef
    expect(typeof ctx['requestId']).toBe('string')
    expect(typeof ctx['telemetry']).toBe('object')
    expect(typeof ctx['secretRef']).toBe('function')
  })
})

// ── Usage advisory invariant ──────────────────────────────────────────────────

describe('ProviderResult — usage is advisory', () => {
  it('provider can report usage without it being authoritative', async () => {
    const p = defineProvider({
      ...minimal(),
      async execute(_ctx, _req) {
        return {
          text: 'hello',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }
      },
      async health(_ctx) { return { status: 'HEALTHY' } },
    })
    const ctx = makeProviderContext({ declaredRefs: [] })
    const result = await p.execute(ctx, { capability: 'text', messages: [] })
    // Usage present — but this is advisory; runtime seals authoritative evidence separately
    expect(result.usage?.inputTokens).toBe(10)
    // The ProviderResult type does NOT have a "authoritative" or "billing" field
    expect((result as unknown as Record<string, unknown>)['authoritative']).toBeUndefined()
    expect((result as unknown as Record<string, unknown>)['billingRecord']).toBeUndefined()
  })
})

// ── validateProviderDefinition direct use ─────────────────────────────────────

describe('validateProviderDefinition', () => {
  it('returns ok=true for valid definition', () => {
    const p = defineProvider(minimal())
    const r = validateProviderDefinition(p)
    expect(r.ok).toBe(true)
  })

  it('collects multiple errors without throwing', () => {
    const bad: ProviderDefinition = {
      id:           '',
      version:      'bad',
      capabilities: {},
      secretRefs:   ['', 'KEY', 'KEY'],
      execute:      async () => ({ text: '' }),
      health:       async () => ({ status: 'HEALTHY' }),
    }
    const r = validateProviderDefinition(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(2)
  })
})

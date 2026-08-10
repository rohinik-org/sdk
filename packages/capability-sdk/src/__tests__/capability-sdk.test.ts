/**
 * T5 acceptance tests — constitutional boundary enforcement.
 *
 * Critical invariants tested:
 *   PASS: valid ID + schemas + permissions
 *   REJECT: unknown/invalid ID format
 *   REJECT: reserved prefix
 *   REJECT: undeclared permission use (empty domain/value)
 *   REJECT: invalid schema fields
 *   CONTEXT: CapabilityContext has no runtime internals
 *   BOUNDARY: validateCapabilityDefinition rejects malformed defs
 */

import { describe, it, expect } from 'vitest'
import {
  defineCapability,
  validateCapabilityDefinition,
  permission,
  permissions,
  inputField,
  outputField,
  result,
} from '../index.js'
import type { CapabilityContext, CapabilityDefinition } from '../index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minimalDef(id: string): Parameters<typeof defineCapability>[0] {
  return {
    id,
    input:       [inputField('text', 'string')],
    output:      [outputField('result', 'string')],
    permissions: [permission('filesystem', 'read')],
    execute:     async (_ctx, input) => String(input),
  }
}

// ── Golden path ───────────────────────────────────────────────────────────────

describe('defineCapability — golden path', () => {
  it('returns frozen CapabilityDefinition for valid ID', () => {
    const cap = defineCapability(minimalDef('document:extract'))
    expect(cap.id).toBe('document:extract')
    expect(Object.isFrozen(cap)).toBe(true)
  })

  it('execute() is callable and returns typed output', async () => {
    const cap = defineCapability({
      id:          'text:summarize',
      input:       [inputField('content', 'string', { required: true })],
      output:      [outputField('summary', 'string')],
      permissions: [permission('model', 'invoke')],
      execute:     async (_ctx, input: string) => input.slice(0, 10),
    })

    const ctx: CapabilityContext = {
      requestId:   'r1',
      executionId: 'e1',
      sessionId:   's1',
      workspaceId: 'w1',
      permissions: ['model:invoke'],
    }

    const output = await cap.execute(ctx, 'hello world!')
    expect(output).toBe('hello worl')
  })

  it('permission shorthand helpers produce correct shape', () => {
    const p = permissions.filesystem.read('/home/data')
    expect(p.domain).toBe('filesystem')
    expect(p.value).toBe('read')
    expect(p.resourceConstraint).toBe('/home/data')
  })

  it('result() helper attaches evidence and warnings', () => {
    const r = result('ok', { evidence: ['step-1'], warnings: ['slow'] })
    expect(r.value).toBe('ok')
    expect(r.evidence).toEqual(['step-1'])
    expect(r.warnings).toEqual(['slow'])
  })

  it('defaults version and tier when omitted', () => {
    const cap = defineCapability(minimalDef('image:resize'))
    expect(cap.version).toBe('0.1.0')
    expect(cap.tier).toBe('LOCAL')
  })
})

// ── ID validation — REJECT cases ─────────────────────────────────────────────

describe('defineCapability — ID boundary enforcement', () => {
  it('REJECT: no colon separator', () => {
    expect(() => defineCapability(minimalDef('documentextract')))
      .toThrow(/invalid/)
  })

  it('REJECT: uppercase letters', () => {
    expect(() => defineCapability(minimalDef('Document:Extract')))
      .toThrow(/invalid/)
  })

  it('REJECT: spaces', () => {
    expect(() => defineCapability(minimalDef('document :extract')))
      .toThrow(/invalid/)
  })

  it('REJECT: empty string', () => {
    expect(() => defineCapability(minimalDef('')))
      .toThrow(/invalid/)
  })

  it('REJECT: reserved prefix system:', () => {
    expect(() => defineCapability(minimalDef('system:control')))
      .toThrow(/reserved/)
  })

  it('REJECT: reserved prefix internal:', () => {
    expect(() => defineCapability(minimalDef('internal:ops')))
      .toThrow(/reserved/)
  })

  it('REJECT: reserved prefix runtime:', () => {
    expect(() => defineCapability(minimalDef('runtime:kernel')))
      .toThrow(/reserved/)
  })

  it('REJECT: ID with more than two segments (stricter manifest-parser rule)', () => {
    // manifest-parser enforces exactly domain:capability (two segments)
    expect(() => defineCapability(minimalDef('a:b:c')))
      .toThrow(/invalid/)
  })
})

// ── Permission boundary enforcement ──────────────────────────────────────────

describe('permission() — boundary enforcement', () => {
  it('REJECT: empty domain', () => {
    expect(() => permission('', 'read')).toThrow(/domain/)
  })

  it('REJECT: empty value', () => {
    expect(() => permission('filesystem', '')).toThrow(/value/)
  })

  it('REJECT: whitespace-only domain', () => {
    expect(() => permission('   ', 'read')).toThrow(/domain/)
  })
})

// ── Schema field enforcement ──────────────────────────────────────────────────

describe('inputField / outputField — boundary enforcement', () => {
  it('REJECT: empty field name', () => {
    expect(() => inputField('', 'string')).toThrow(/name/)
  })

  it('REJECT: empty field type', () => {
    expect(() => inputField('content', '')).toThrow(/type/)
  })

  it('REJECT: empty output field name', () => {
    expect(() => outputField('', 'string')).toThrow(/name/)
  })
})

// ── validateCapabilityDefinition — direct validation ─────────────────────────

describe('validateCapabilityDefinition', () => {
  it('returns ok=true for valid definition', () => {
    const cap = defineCapability(minimalDef('doc:parse'))
    const r = validateCapabilityDefinition(cap as CapabilityDefinition)
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('returns errors for invalid ID without throwing', () => {
    const def = {
      id:          'INVALID_ID',
      input:       [],
      output:      [],
      permissions: [],
      execute:     async () => null,
    } as CapabilityDefinition
    const r = validateCapabilityDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('invalid'))).toBe(true)
  })

  it('reports multiple errors in one pass', () => {
    const def = {
      id:          'INVALID',
      input:       [{ name: '', type: '' }],
      output:      [{ name: '', type: '' }],
      permissions: [{ domain: '', value: '' }],
      execute:     async () => null,
    } as CapabilityDefinition
    const r = validateCapabilityDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(1)
  })
})

// ── CapabilityContext shape — no runtime internals ────────────────────────────

describe('CapabilityContext — runtime internals absent', () => {
  it('context type has no services, kernel, or registry fields', () => {
    // TypeScript-level check: compile-time guarantee enforced by the type.
    // At runtime we verify the shape we pass through matches what execute receives.
    const ctx: CapabilityContext = {
      requestId:   'r1',
      executionId: 'e1',
      sessionId:   's1',
      workspaceId: 'w1',
      permissions: [],
    }

    // These would be TypeScript compile errors if they existed on CapabilityContext:
    // ctx.services   // TS error
    // ctx.kernel     // TS error
    // ctx.registry   // TS error

    expect(Object.keys(ctx)).not.toContain('services')
    expect(Object.keys(ctx)).not.toContain('kernel')
    expect(Object.keys(ctx)).not.toContain('registry')
    expect(ctx.requestId).toBe('r1')
  })

  it('context carries AbortSignal for cancellation', () => {
    const controller = new AbortController()
    const ctx: CapabilityContext = {
      requestId:   'r2',
      executionId: 'e2',
      sessionId:   's2',
      workspaceId: 'w2',
      permissions: [],
      signal:      controller.signal,
    }
    expect(ctx.signal).toBe(controller.signal)
  })
})

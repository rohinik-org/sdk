/**
 * T9 acceptance tests — @rohinik-org/testing.
 *
 * Invariants:
 *   CONTEXT: createTestCapabilityContext produces correct shape
 *   CONTEXT: createTestAgentContext produces correct shape
 *   CONTEXT: createTestProviderContext delegates to real makeProviderContext (secret gating)
 *   FIXTURES: createDeterministicIds produces sequential deterministic IDs
 *   FIXTURES: createFakeClock is deterministic and tickable
 *   MOCK_CLIENT: events() yields correct protocol events
 *   MOCK_CLIENT: status() reflects terminal state
 *   MOCK_PROVIDER: uses real defineProvider validation
 *   ASSERT: assertValidX passes valid defs; throws on invalid
 *   EVENT_BUILDER: all Stage 16 paths produce valid event sequences
 */

import { describe, it, expect } from 'vitest'
import {
  createTestCapabilityContext,
  createTestAgentContext,
  createTestProviderContext,
  createDeterministicIds,
  createFakeClock,
  createMockExecutionClient,
  createMockProvider,
  assertValidCapability,
  assertValidAgent,
  assertValidProvider,
  assertValidPackage,
  ExecutionEventBuilder,
  PublicEventKind,
  PublicExecutionState,
} from '../index.js'

// ── createTestCapabilityContext ───────────────────────────────────────────────

describe('createTestCapabilityContext', () => {
  it('defaults to test-workspace and deterministic IDs', () => {
    const ctx = createTestCapabilityContext()
    expect(ctx.workspaceId).toBe('test-workspace')
    expect(typeof ctx.requestId).toBe('string')
    expect(typeof ctx.executionId).toBe('string')
    expect(ctx.requestId).not.toBe(ctx.executionId)
  })

  it('accepts overrides', () => {
    const ctx = createTestCapabilityContext({ requestId: 'r1', workspaceId: 'ws-x', permissions: ['read'] })
    expect(ctx.requestId).toBe('r1')
    expect(ctx.workspaceId).toBe('ws-x')
    expect(ctx.permissions).toEqual(['read'])
  })

  it('is frozen', () => {
    const ctx = createTestCapabilityContext()
    expect(Object.isFrozen(ctx)).toBe(true)
    expect(Object.isFrozen(ctx.permissions)).toBe(true)
  })

  it('no runtime internals', () => {
    const ctx = createTestCapabilityContext() as unknown as Record<string, unknown>
    expect(ctx['services']).toBeUndefined()
    expect(ctx['registry']).toBeUndefined()
    expect(ctx['kernel']).toBeUndefined()
    expect(ctx['runtimeHost']).toBeUndefined()
  })
})

// ── createTestAgentContext ────────────────────────────────────────────────────

describe('createTestAgentContext', () => {
  it('defaults to test-workspace', () => {
    const ctx = createTestAgentContext()
    expect(ctx.workspaceId).toBe('test-workspace')
    expect(ctx.params).toEqual({})
  })

  it('accepts goalLabel and params', () => {
    const ctx = createTestAgentContext({ goalLabel: 'Write code', params: { lang: 'ts' } })
    expect(ctx.goalLabel).toBe('Write code')
    expect(ctx.params['lang']).toBe('ts')
  })

  it('is frozen', () => {
    const ctx = createTestAgentContext()
    expect(Object.isFrozen(ctx)).toBe(true)
    expect(Object.isFrozen(ctx.params)).toBe(true)
  })
})

// ── createTestProviderContext ─────────────────────────────────────────────────

describe('createTestProviderContext', () => {
  it('delegates to real secretRef gating', () => {
    const ctx = createTestProviderContext({ declaredRefs: ['MY_KEY'], secrets: { MY_KEY: 'val' } })
    expect(ctx.secretRef('MY_KEY')).toBe('val')
  })

  it('REJECT: secretRef for undeclared name', () => {
    const ctx = createTestProviderContext({ declaredRefs: ['MY_KEY'], secrets: { MY_KEY: 'val' } })
    expect(() => ctx.secretRef('OTHER')).toThrow(/not declared/)
  })

  it('REJECT: secretRef when secret not set', () => {
    const ctx = createTestProviderContext({ declaredRefs: ['MY_KEY'], secrets: {} })
    expect(() => ctx.secretRef('MY_KEY')).toThrow(/not set/)
  })

  it('no runtime internals', () => {
    const ctx = createTestProviderContext({ declaredRefs: [] }) as unknown as Record<string, unknown>
    expect(ctx['services']).toBeUndefined()
    expect(ctx['registry']).toBeUndefined()
    expect(typeof ctx['requestId']).toBe('string')
    expect(typeof ctx['secretRef']).toBe('function')
  })
})

// ── createDeterministicIds ────────────────────────────────────────────────────

describe('createDeterministicIds', () => {
  it('produces sequential IDs', () => {
    const ids = createDeterministicIds('req')
    expect(ids.next()).toBe('req-0001')
    expect(ids.next()).toBe('req-0002')
    expect(ids.next()).toBe('req-0003')
  })

  it('default prefix is test-id', () => {
    const ids = createDeterministicIds()
    expect(ids.next()).toMatch(/^test-id-\d{4}$/)
  })

  it('two generators are independent', () => {
    const a = createDeterministicIds('a')
    const b = createDeterministicIds('b')
    expect(a.next()).toBe('a-0001')
    expect(b.next()).toBe('b-0001')
    expect(a.next()).toBe('a-0002')
  })
})

// ── createFakeClock ───────────────────────────────────────────────────────────

describe('createFakeClock', () => {
  it('starts at fixed ISO timestamp', () => {
    const clock = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    expect(clock.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('tick() advances by tickMs', () => {
    const clock = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z', tickMs: 500 })
    clock.tick()
    expect(clock.now()).toBe(new Date('2026-01-01T00:00:00.500Z').getTime())
    clock.tick(2000)
    expect(clock.now()).toBe(new Date('2026-01-01T00:00:02.500Z').getTime())
  })

  it('two clocks at same start produce same sequence', () => {
    const c1 = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    const c2 = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    c1.tick(); c1.tick()
    c2.tick(); c2.tick()
    expect(c1.toISOString()).toBe(c2.toISOString())
  })
})

// ── createMockExecutionClient ─────────────────────────────────────────────────

describe('createMockExecutionClient', () => {
  it('events() yields protocol events with correct kinds', async () => {
    const client = createMockExecutionClient()
    const kinds: string[] = []
    for await (const ev of client.events()) kinds.push(ev.kind)
    expect(kinds).toEqual([
      PublicEventKind.EXECUTION_ACCEPTED,
      PublicEventKind.EXECUTION_ADMITTED,
      PublicEventKind.EXECUTION_STARTED,
      PublicEventKind.EXECUTION_COMPLETED,
    ])
  })

  it('events have monotonically increasing sequence', async () => {
    const client = createMockExecutionClient()
    const seqs: number[] = []
    for await (const ev of client.events()) seqs.push(ev.sequence)
    expect(seqs).toEqual([0, 1, 2, 3])
  })

  it('status() is COMPLETED after complete sequence', async () => {
    const client = createMockExecutionClient()
    const s = await client.status()
    expect(s.state).toBe(PublicExecutionState.COMPLETED)
  })

  it('status() is FAILED for failed sequence', async () => {
    const client = createMockExecutionClient({
      sequence: [
        { kind: PublicEventKind.EXECUTION_ACCEPTED },
        { kind: PublicEventKind.EXECUTION_FAILED, message: 'oops' },
      ],
    })
    const s = await client.status()
    expect(s.state).toBe(PublicExecutionState.FAILED)
  })

  it('custom result returned by result()', async () => {
    const client = createMockExecutionClient({ result: { text: 'hello world' } })
    const r = await client.result()
    expect((r.output as Record<string, string>)['text']).toBe('hello world')
  })

  it('deterministic: two clients with same opts produce same event timestamps', async () => {
    const clock1 = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    const clock2 = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    const c1 = createMockExecutionClient({ executionId: 'e1', clock: clock1 })
    const c2 = createMockExecutionClient({ executionId: 'e1', clock: clock2 })
    const evs1: string[] = [], evs2: string[] = []
    for await (const ev of c1.events()) evs1.push(ev.occurredAt)
    for await (const ev of c2.events()) evs2.push(ev.occurredAt)
    expect(evs1).toEqual(evs2)
  })
})

// ── createMockProvider ────────────────────────────────────────────────────────

describe('createMockProvider', () => {
  it('uses real defineProvider — frozen, valid', () => {
    const p = createMockProvider({ id: 'test-provider', capabilities: { text: true } })
    expect(Object.isFrozen(p)).toBe(true)
    expect(p.id).toBe('test-provider')
  })

  it('default execute returns mock response', async () => {
    const p = createMockProvider({ id: 'test-provider', capabilities: { text: true } })
    const ctx = createTestProviderContext({ declaredRefs: [] })
    const r = await p.execute(ctx, { capability: 'text', messages: [] })
    expect(r.text).toContain('mock response')
  })

  it('custom onExecute is called', async () => {
    const p = createMockProvider({
      id: 'test-provider',
      capabilities: { text: true },
      onExecute: async () => ({ text: 'custom' }),
    })
    const ctx = createTestProviderContext({ declaredRefs: [] })
    const r = await p.execute(ctx, { capability: 'text', messages: [] })
    expect(r.text).toBe('custom')
  })

  it('REJECT: invalid provider id passed to createMockProvider', () => {
    expect(() => createMockProvider({ id: 'Invalid Provider!', capabilities: { text: true } }))
      .toThrow(/invalid/)
  })

  it('REJECT: tools without output channel', () => {
    expect(() => createMockProvider({ id: 'p', capabilities: { tools: true } }))
      .toThrow(/tools/)
  })
})

// ── assertValidX ──────────────────────────────────────────────────────────────

describe('assertValidCapability', () => {
  it('PASS: valid definition', () => {
    expect(() => assertValidCapability({
      id: 'text:complete', name: 'Text', description: 'completes text',
      version: '1.0.0', tier: 'LOCAL', tags: [], permissions: [],
      input: [{ name: 'prompt', type: 'string' }],
      output: [{ name: 'completion', type: 'string' }],
      execute: async () => ({ value: 'ok' }),
    })).not.toThrow()
  })

  it('REJECT: missing output field', () => {
    expect(() => assertValidCapability({
      id: 'text:complete', name: 'Text', description: '',
      version: '1.0.0', tier: 'LOCAL', tags: [], permissions: [],
      input: [{ name: 'prompt', type: 'string' }],
      output: [{ name: '', type: 'string' }],
      execute: async () => ({ value: 'ok' }),
    })).toThrow(/validation failed/)
  })
})

describe('assertValidAgent', () => {
  it('PASS: valid definition', () => {
    expect(() => assertValidAgent({
      id: 'my-agent', version: '1.0.0', role: 'coder',
      goals: [], capabilities: [], authority: { allowedCapabilities: [], allowedActions: [], deniedActions: [], maxDelegationDepth: 0 },
      budget: {}, policy: [],
      instructions: () => 'write code',
    })).not.toThrow()
  })

  it('REJECT: whitespace ID', () => {
    expect(() => assertValidAgent({
      id: 'bad id', version: '1.0.0', role: 'coder',
      goals: [], capabilities: [], authority: { allowedCapabilities: [], allowedActions: [], deniedActions: [], maxDelegationDepth: 0 },
      budget: {}, policy: [], instructions: () => '',
    })).toThrow(/validation failed/)
  })
})

describe('assertValidProvider', () => {
  it('PASS: valid definition', () => {
    expect(() => assertValidProvider({
      id: 'my-provider', version: '1.0.0',
      capabilities: { text: true }, secretRefs: [],
      execute: async () => ({ text: 'ok' }), health: async () => ({ status: 'HEALTHY' }),
    })).not.toThrow()
  })

  it('REJECT: empty id', () => {
    expect(() => assertValidProvider({
      id: '', version: '1.0.0',
      capabilities: { text: true }, secretRefs: [],
      execute: async () => ({ text: '' }), health: async () => ({ status: 'HEALTHY' }),
    })).toThrow(/validation failed/)
  })
})

describe('assertValidPackage', () => {
  it('PASS: valid definition', () => {
    expect(() => assertValidPackage({
      package: { id: 'com.example.pkg', name: 'Pkg', version: '1.0.0', type: 'capability-provider' },
      provides: [{ capability: 'text:complete', version: '1.0.0' }],
      consumes: [],
    })).not.toThrow()
  })

  it('REJECT: invalid package id', () => {
    expect(() => assertValidPackage({
      package: { id: 'bad', name: 'Pkg', version: '1.0.0', type: 'capability-provider' },
      provides: [], consumes: [],
    })).toThrow(/validation failed/)
  })
})

// ── ExecutionEventBuilder ─────────────────────────────────────────────────────

describe('ExecutionEventBuilder', () => {
  it('goldenPath returns 4 events with correct kinds', () => {
    const b = new ExecutionEventBuilder({ executionId: 'e1' })
    const evs = b.goldenPath()
    expect(evs).toHaveLength(4)
    expect(evs[0]!.kind).toBe(PublicEventKind.EXECUTION_ACCEPTED)
    expect(evs[3]!.kind).toBe(PublicEventKind.EXECUTION_COMPLETED)
    expect(evs.every(e => e.executionId === 'e1')).toBe(true)
  })

  it('streamingPath includes PARTIAL_OUTPUT events', () => {
    const b = new ExecutionEventBuilder()
    const evs = b.streamingPath(['hello', ' ', 'world'])
    const partials = evs.filter(e => e.kind === PublicEventKind.PARTIAL_OUTPUT)
    expect(partials).toHaveLength(3)
    expect((partials[0]!.payload as Record<string, string>)['delta']).toBe('hello')
  })

  it('delegationPath includes PROGRESS with delegation payload', () => {
    const b = new ExecutionEventBuilder()
    const evs = b.delegationPath('del-001', 'child-agent')
    const progress = evs.find(e => e.kind === PublicEventKind.PROGRESS)
    expect(progress).toBeDefined()
    expect((progress!.payload as Record<string, unknown>)['delegation']).toBeDefined()
  })

  it('controlApprovalPath includes WAITING with approval reason', () => {
    const b = new ExecutionEventBuilder()
    const evs = b.controlApprovalPath('wf-1', 'cp-1')
    const waiting = evs.find(e => e.kind === PublicEventKind.WAITING)
    expect(waiting).toBeDefined()
    expect((waiting!.payload as Record<string, string>)['reason']).toBe('awaiting-control-approval')
  })

  it('deterministic: same clock produces same timestamps', () => {
    const clock = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    const b = new ExecutionEventBuilder({ clock })
    const evs = b.goldenPath()
    expect(evs[0]!.occurredAt).toBe('2026-01-01T00:00:00.000Z')
    expect(evs[1]!.occurredAt).toBe('2026-01-01T00:00:01.000Z')
  })

  it('sequence numbers are monotonic', () => {
    const b = new ExecutionEventBuilder()
    const evs = b.streamingPath(['a', 'b', 'c'])
    expect(evs.map(e => e.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('completedWithSchema embeds schema in payload', () => {
    const b = new ExecutionEventBuilder()
    const ev = b.completedWithSchema({ count: 42 }, 'com.example:my-schema')
    expect((ev.payload as Record<string, unknown>)['typedResult']).toMatchObject({ value: { count: 42 }, schema: 'com.example:my-schema' })
  })
})

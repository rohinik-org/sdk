/**
 * Stage 16D Task 7 — delegateMany() bounded fan-out helper
 *
 * Tests verify:
 *   - budget pre-check rejects when aggregate exceeds per-child * count
 *   - maxConcurrency limits concurrent delegate+accept+run calls
 *   - results returned in input order regardless of completion order
 *   - per-child deadline propagation (maxLatencyMs)
 *   - cancellation propagation cancels all remaining children when one fails
 *   - independent child evidence via DelegationHandle.evidence()
 *   - no automatic result acceptance
 *   - no implicit synthesis of results
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { delegateMany } from '../delegate-many.js'
import type { DelegateManySpec, DelegateManyResult } from '../delegate-many.js'
import type { AgentRunHandle, DelegationHandle } from '@rohinik-org/agent'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDelegationHandle(overrides: Partial<{
  accept: () => Promise<unknown>
  run: () => Promise<{ executionId: string; delegationId: string; delegatedTaskId: string }>
  cancel: (reason?: string) => Promise<{ ok: boolean }>
  evidence: () => Promise<unknown>
  delegatedTaskId: string
  delegationId: string
}> = {}): DelegationHandle {
  return {
    delegatedTaskId: overrides.delegatedTaskId ?? 'dtask-1',
    delegationId:    overrides.delegationId    ?? 'del-1',
    accept:      overrides.accept      ?? vi.fn().mockResolvedValue({ ok: true }),
    run:         overrides.run         ?? vi.fn().mockResolvedValue({ executionId: 'exec-1', delegationId: 'del-1', delegatedTaskId: 'dtask-1' }),
    cancel:      overrides.cancel      ?? vi.fn().mockResolvedValue({ ok: true, parentResumed: false }),
    evidence:    overrides.evidence    ?? vi.fn().mockResolvedValue({ delegationId: 'del-1', events: [] }),
    submitResult:  vi.fn(),
    acceptResult:  vi.fn(),
    rejectResult:  vi.fn(),
  } as unknown as DelegationHandle
}

function makeRunHandle(specs: DelegateManySpec[]): {
  runHandle: AgentRunHandle
  delegateSpy: ReturnType<typeof vi.fn>
  delegationHandles: DelegationHandle[]
} {
  const delegationHandles = specs.map((s, i) =>
    makeDelegationHandle({
      delegatedTaskId: `dtask-${i}`,
      delegationId:    `del-${i}`,
      run: vi.fn().mockResolvedValue({ executionId: `exec-${i}`, delegationId: `del-${i}`, delegatedTaskId: `dtask-${i}` }),
    }),
  )
  let callIndex = 0
  const delegateSpy = vi.fn().mockImplementation(async () => delegationHandles[callIndex++]!)
  const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle
  return { runHandle, delegateSpy, delegationHandles }
}

// ── Budget pre-check ──────────────────────────────────────────────────────────

describe('budget pre-check', () => {
  it('rejects when aggregate maxCostUsd exceeds budget', async () => {
    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r1', taskId: 't1', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 6, maxLatencyMs: 1000, maxTokens: 100 },
      { delegateeRunId: 'r2', taskId: 't2', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 6, maxLatencyMs: 1000, maxTokens: 100 },
    ]
    const { runHandle } = makeRunHandle(specs)

    await expect(
      delegateMany(runHandle, specs, { maxConcurrency: 2, aggregateBudget: { maxCostUsd: 10 } }),
    ).rejects.toThrow(/budget/i)
  })

  it('rejects when aggregate maxTokens exceeds budget', async () => {
    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r1', taskId: 't1', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 60_000 },
      { delegateeRunId: 'r2', taskId: 't2', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 60_000 },
    ]
    const { runHandle } = makeRunHandle(specs)

    await expect(
      delegateMany(runHandle, specs, { maxConcurrency: 2, aggregateBudget: { maxTokens: 100_000 } }),
    ).rejects.toThrow(/budget/i)
  })

  it('passes when aggregate fits within budget', async () => {
    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r1', taskId: 't1', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 3, maxLatencyMs: 1000, maxTokens: 40_000 },
      { delegateeRunId: 'r2', taskId: 't2', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 3, maxLatencyMs: 1000, maxTokens: 40_000 },
    ]
    const { runHandle } = makeRunHandle(specs)

    await expect(
      delegateMany(runHandle, specs, { maxConcurrency: 2, aggregateBudget: { maxCostUsd: 10, maxTokens: 100_000 } }),
    ).resolves.toHaveLength(2)
  })
})

// ── Deterministic ordering ────────────────────────────────────────────────────

describe('result ordering', () => {
  it('returns results in input order regardless of completion order', async () => {
    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r0', taskId: 't0', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000 },
      { delegateeRunId: 'r1', taskId: 't1', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000 },
      { delegateeRunId: 'r2', taskId: 't2', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000 },
    ]

    // r2 resolves first (delay=0), r0 resolves last (delay=10)
    let delegateCall = 0
    const delays = [10, 5, 0]
    const delegateSpy = vi.fn().mockImplementation(async (params: { taskId: string }) => {
      const idx = delegateCall++
      const delay = delays[idx]!
      return makeDelegationHandle({
        delegatedTaskId: `dtask-${idx}`,
        delegationId:    `del-${idx}`,
        run: vi.fn().mockImplementation(() =>
          new Promise(res => setTimeout(() => res({ executionId: `exec-${idx}`, delegationId: `del-${idx}`, delegatedTaskId: `dtask-${idx}` }), delay)),
        ),
      })
    })
    const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle

    const results = await delegateMany(runHandle, specs, { maxConcurrency: 3 })

    expect(results[0]!.index).toBe(0)
    expect(results[1]!.index).toBe(1)
    expect(results[2]!.index).toBe(2)
    expect(results[0]!.executionId).toBe('exec-0')
    expect(results[2]!.executionId).toBe('exec-2')
  })
})

// ── maxConcurrency ────────────────────────────────────────────────────────────

describe('maxConcurrency', () => {
  it('does not exceed maxConcurrency in-flight delegate calls', async () => {
    const specs: DelegateManySpec[] = Array.from({ length: 4 }, (_, i) => ({
      delegateeRunId: `r${i}`, taskId: `t${i}`, description: 'd',
      grantedCapabilities: [], grantedActions: [], grantedDepth: 0,
      maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000,
    }))

    let maxInFlight = 0
    let currentInFlight = 0
    let delegateCall = 0

    const delegateSpy = vi.fn().mockImplementation(async () => {
      currentInFlight++
      maxInFlight = Math.max(maxInFlight, currentInFlight)
      const idx = delegateCall++
      // slight async tick to allow concurrent tracking
      await new Promise(res => setTimeout(res, 5))
      currentInFlight--
      return makeDelegationHandle({ delegatedTaskId: `dtask-${idx}`, delegationId: `del-${idx}` })
    })
    const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle

    await delegateMany(runHandle, specs, { maxConcurrency: 2 })

    expect(maxInFlight).toBeLessThanOrEqual(2)
  })
})

// ── Cancellation propagation ──────────────────────────────────────────────────

describe('cancellation propagation', () => {
  it('cancels remaining children when one child delegate() throws', async () => {
    const specs: DelegateManySpec[] = Array.from({ length: 3 }, (_, i) => ({
      delegateeRunId: `r${i}`, taskId: `t${i}`, description: 'd',
      grantedCapabilities: [], grantedActions: [], grantedDepth: 0,
      maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000,
    }))

    const cancelSpy = vi.fn().mockResolvedValue({ ok: true, parentResumed: false })
    const succeededHandle = makeDelegationHandle({ delegatedTaskId: 'dtask-0', delegationId: 'del-0', cancel: cancelSpy })

    let callCount = 0
    const delegateSpy = vi.fn().mockImplementation(async () => {
      const idx = callCount++
      if (idx === 0) return succeededHandle
      // second delegate call fails
      throw new Error('delegation-rejected')
    })
    const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle

    await expect(delegateMany(runHandle, specs, { maxConcurrency: 3 })).rejects.toThrow()

    // The first child (already delegated) should have cancel() called
    expect(cancelSpy).toHaveBeenCalledWith(expect.stringContaining('sibling'))
  })
})

// ── No auto-accept ────────────────────────────────────────────────────────────

describe('no auto-accept', () => {
  it('does not call acceptResult() on any child', async () => {
    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r0', taskId: 't0', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000 },
    ]
    const acceptResultSpy = vi.fn()
    const handle = makeDelegationHandle({ delegatedTaskId: 'dtask-0', delegationId: 'del-0' })
    ;(handle as { acceptResult: unknown }).acceptResult = acceptResultSpy

    const delegateSpy = vi.fn().mockResolvedValue(handle)
    const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle

    await delegateMany(runHandle, specs, { maxConcurrency: 1 })

    expect(acceptResultSpy).not.toHaveBeenCalled()
  })
})

// ── Independent child evidence ────────────────────────────────────────────────

describe('independent child evidence', () => {
  it('result carries delegationHandle for caller to call evidence()', async () => {
    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r0', taskId: 't0', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000 },
    ]
    const evidenceSpy = vi.fn().mockResolvedValue({ delegationId: 'del-0', events: [{ eventId: 'e1' }] })
    const handle = makeDelegationHandle({ delegatedTaskId: 'dtask-0', delegationId: 'del-0', evidence: evidenceSpy })

    const delegateSpy = vi.fn().mockResolvedValue(handle)
    const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle

    const results = await delegateMany(runHandle, specs, { maxConcurrency: 1 })

    // caller gets the handle back and can call evidence() themselves
    const ev = await results[0]!.delegation.evidence()
    expect(evidenceSpy).toHaveBeenCalledOnce()
    expect(ev.events).toHaveLength(1)
  })
})

// ── Deadline propagation ──────────────────────────────────────────────────────

describe('deadline propagation', () => {
  it('applies deadline to per-child maxLatencyMs when deadline set', async () => {
    const now = Date.now()
    const deadline = now + 10_000

    const specs: DelegateManySpec[] = [
      { delegateeRunId: 'r0', taskId: 't0', description: 'd', grantedCapabilities: [], grantedActions: [], grantedDepth: 0, maxCostUsd: 1, maxLatencyMs: 30_000, maxTokens: 1000 },
    ]

    const delegateSpy = vi.fn().mockImplementation(async (params: { maxLatencyMs: number }) => {
      // maxLatencyMs should be capped to remaining deadline time
      expect(params.maxLatencyMs).toBeLessThanOrEqual(10_000 + 100) // +100ms tolerance
      expect(params.maxLatencyMs).toBeGreaterThan(0)
      return makeDelegationHandle()
    })
    const runHandle = { delegate: delegateSpy } as unknown as AgentRunHandle

    await delegateMany(runHandle, specs, { maxConcurrency: 1, deadlineMs: deadline })
  })
})

/**
 * delegateMany — bounded fan-out coordination helper (Stage 16D T7)
 *
 * Delegates multiple tasks from a single AgentRunHandle with:
 *   - aggregate budget pre-check
 *   - maxConcurrency window
 *   - deadline propagation per child
 *   - deterministic result ordering
 *   - cancellation propagation on failure
 *   - caller-accessible DelegationHandle for evidence
 *   - no auto-acceptResult, no implicit synthesis
 */

import type { AgentRunHandle, DelegationHandle } from '@rohinik-org/agent'
import type { DelegateTaskRequest } from '@rohinik-org/agent-protocol-v1'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DelegateManySpec = Omit<DelegateTaskRequest, 'delegationId'> & { delegationId?: string }

export interface AggregateBudget {
  readonly maxCostUsd?: number
  readonly maxTokens?: number
  readonly maxLatencyMs?: number
}

export interface DelegateManyOptions {
  readonly maxConcurrency: number
  readonly aggregateBudget?: AggregateBudget
  /** Absolute deadline (Date.now() + ms). Caps per-child maxLatencyMs to remaining time. */
  readonly deadlineMs?: number
}

export interface DelegateManyResult {
  readonly index: number
  readonly executionId: string
  readonly delegatedTaskId: string
  readonly delegationId: string
  /** Retain handle so caller can call .evidence(), .acceptResult(), etc. */
  readonly delegation: DelegationHandle
}

// ── Budget pre-check ──────────────────────────────────────────────────────────

function checkAggregateBudget(specs: DelegateManySpec[], budget: AggregateBudget): void {
  if (budget.maxCostUsd !== undefined) {
    const total = specs.reduce((sum, s) => sum + (s.maxCostUsd ?? 0), 0)
    if (total > budget.maxCostUsd) {
      throw new Error(
        `delegateMany budget exceeded: aggregate maxCostUsd ${total} > limit ${budget.maxCostUsd}`,
      )
    }
  }
  if (budget.maxTokens !== undefined) {
    const total = specs.reduce((sum, s) => sum + (s.maxTokens ?? 0), 0)
    if (total > budget.maxTokens) {
      throw new Error(
        `delegateMany budget exceeded: aggregate maxTokens ${total} > limit ${budget.maxTokens}`,
      )
    }
  }
  if (budget.maxLatencyMs !== undefined) {
    const max = specs.reduce((m, s) => Math.max(m, s.maxLatencyMs ?? 0), 0)
    if (max > budget.maxLatencyMs) {
      throw new Error(
        `delegateMany budget exceeded: max per-child maxLatencyMs ${max} > limit ${budget.maxLatencyMs}`,
      )
    }
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

export async function delegateMany(
  run: AgentRunHandle,
  specs: DelegateManySpec[],
  options: DelegateManyOptions,
): Promise<DelegateManyResult[]> {
  const { maxConcurrency, aggregateBudget, deadlineMs } = options

  if (aggregateBudget) {
    checkAggregateBudget(specs, aggregateBudget)
  }

  const results: DelegateManyResult[] = new Array(specs.length)
  const inflight = new Map<number, DelegationHandle>()
  let nextIndex = 0
  let failed = false
  let failError: unknown

  async function processOne(index: number): Promise<void> {
    const spec = specs[index]!

    // Cap maxLatencyMs to remaining deadline time
    let childSpec = spec
    if (deadlineMs !== undefined) {
      const remaining = deadlineMs - Date.now()
      if (remaining <= 0) {
        throw new Error(`delegateMany: deadline expired before dispatching child ${index}`)
      }
      const cappedLatency = Math.min(spec.maxLatencyMs ?? remaining, remaining)
      childSpec = { ...spec, maxLatencyMs: cappedLatency }
    }

    const handle = await run.delegate(childSpec)
    inflight.set(index, handle)
    await handle.accept()
    const exec = await handle.run()

    inflight.delete(index)
    results[index] = {
      index,
      executionId:     exec.executionId,
      delegatedTaskId: handle.delegatedTaskId,
      delegationId:    handle.delegationId,
      delegation:      handle,
    }
  }

  async function cancelInflight(reason: string): Promise<void> {
    await Promise.allSettled(
      Array.from(inflight.entries()).map(([, h]) => h.cancel(reason)),
    )
    inflight.clear()
  }

  // Bounded concurrency via a queue-and-slot approach
  const queue = Array.from({ length: specs.length }, (_, i) => i)
  let activeSlots = 0

  await new Promise<void>((resolve, reject) => {
    function tryDispatch() {
      while (activeSlots < maxConcurrency && nextIndex < specs.length && !failed) {
        const idx = queue[nextIndex++]!
        activeSlots++
        processOne(idx).then(
          () => {
            activeSlots--
            if (failed) {
              if (activeSlots === 0) reject(failError)
              return
            }
            if (nextIndex >= specs.length && activeSlots === 0) {
              resolve()
            } else {
              tryDispatch()
            }
          },
          async (err: unknown) => {
            if (!failed) {
              failed = true
              failError = err
              await cancelInflight('sibling failure — delegateMany cancelled')
            }
            activeSlots--
            if (activeSlots === 0) {
              reject(failError)
            }
          },
        )
      }
      // All dispatched and nothing in flight
      if (!failed && nextIndex >= specs.length && activeSlots === 0) {
        resolve()
      }
    }

    if (specs.length === 0) {
      resolve()
      return
    }

    tryDispatch()
  })

  return results
}

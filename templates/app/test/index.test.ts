import { describe, it, expect } from 'vitest'
import {
  createMockExecutionClient,
  ExecutionEventBuilder,
  PublicEventKind,
  createFakeClock,
} from '@rohinik-org/testing'

describe('execution fixtures — app template', () => {
  it('mock client produces golden path', async () => {
    const client = createMockExecutionClient({ executionId: 'e-001' })
    const kinds: string[] = []
    for await (const ev of client.events()) kinds.push(ev.kind)
    expect(kinds).toContain(PublicEventKind.EXECUTION_COMPLETED)
  })

  it('event builder produces deterministic events', () => {
    const clock = createFakeClock({ startIso: '2026-01-01T00:00:00.000Z' })
    const b = new ExecutionEventBuilder({ executionId: 'e-001', clock })
    const evs = b.goldenPath()
    expect(evs[0]!.occurredAt).toBe('2026-01-01T00:00:00.000Z')
    expect(evs).toHaveLength(4)
  })
})

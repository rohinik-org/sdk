import { describe, it, expect, vi } from 'vitest'
import { createMockExecutionClient, ExecutionEventBuilder, PublicEventKind } from '@rohinik-org/testing'

const CHUNKS = ['Hello', ', ', 'world', '!']

vi.mock('@rohinik-org/client', () => ({
  createRohinikClient: (_opts: unknown) => ({
    executions: {
      start: async (_req: unknown) => {
        const b = new ExecutionEventBuilder({ executionId: 'e-002' })
        const events = b.streamingPath(CHUNKS)
        return {
          events: async function* () { for (const ev of events) yield ev },
          waitForResult: async () => ({ executionId: 'e-002', state: 'COMPLETED', output: null }),
        }
      },
    },
  }),
}))

describe('02-streaming-execution', () => {
  it('collects partial output chunks into text', async () => {
    const { streamExecution } = await import('../src/index.js')
    const { text, eventCount } = await streamExecution('http://localhost:9000', 'Say hello')
    expect(text).toBe('Hello, world!')
    expect(eventCount).toBeGreaterThan(0)
  })

  it('mock client emits PARTIAL_OUTPUT events', async () => {
    const b = new ExecutionEventBuilder({ executionId: 'e-002' })
    const events = b.streamingPath(['a', 'b', 'c'])
    const partials = events.filter(e => e.kind === PublicEventKind.PARTIAL_OUTPUT)
    expect(partials).toHaveLength(3)
    expect((partials[0]!.payload as Record<string,string>)['delta']).toBe('a')
  })
})

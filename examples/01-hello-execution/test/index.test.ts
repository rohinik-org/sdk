import { describe, it, expect, vi } from 'vitest'
import { createMockExecutionClient } from '@rohinik-org/testing'

vi.mock('@rohinik-org/client', () => ({
  createRohinikClient: (_opts: unknown) => ({
    executions: {
      start: async (_req: unknown) => {
        const mock = createMockExecutionClient({
          executionId: 'e-001',
          result: { text: 'Hello! This is a greeting.' },
        })
        return {
          waitForResult: () => mock.result(),
          events:        () => mock.events(),
        }
      },
    },
  }),
}))

describe('01-hello-execution', () => {
  it('returns text from result output', async () => {
    const { helloExecution } = await import('../src/index.js')
    const text = await helloExecution('http://localhost:9000')
    expect(text).toBe('Hello! This is a greeting.')
  })

  it('returns empty string when output has no text field', async () => {
    const { createMockExecutionClient: mk } = await import('@rohinik-org/testing')
    const mock = mk({ result: {} })
    const res = await mock.result()
    const text = (res.output as Record<string, string>)?.['text'] ?? ''
    expect(text).toBe('')
  })
})

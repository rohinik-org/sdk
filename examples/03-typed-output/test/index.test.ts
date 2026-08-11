import { describe, it, expect, vi } from 'vitest'
import { createMockExecutionClient } from '@rohinik-org/testing'

interface WordCount { count: number }

vi.mock('@rohinik-org/client', () => ({
  createRohinikClient: (_opts: unknown) => ({
    executions: {
      start: async (_req: unknown) => {
        const mock = createMockExecutionClient({
          executionId: 'e-003',
          result: { value: { count: 7 }, schema: 'word-count-v1' },
        })
        return {
          waitForResult: () => mock.result(),
          events:        () => mock.events(),
        }
      },
    },
  }),
}))

describe('03-typed-output', () => {
  it('extracts typed value and schema from output', async () => {
    const { runTypedOutput } = await import('../src/index.js')
    const out = await runTypedOutput<WordCount>(
      'http://localhost:9000',
      'example:word-count',
      [{ role: 'user', content: 'Count words in: hello world foo bar baz qux quux' }],
    )
    expect(out).not.toBeNull()
    expect(out!.value.count).toBe(7)
    expect(out!.schema).toBe('word-count-v1')
  })

  it('returns null when output is missing value field', async () => {
    const mock = createMockExecutionClient({ result: { text: 'no schema here' } })
    const res = await mock.result()
    const output = res.output as Record<string, unknown> | null
    const typed = (!output || typeof output['value'] === 'undefined') ? null : output
    expect(typed).toBeNull()
  })
})

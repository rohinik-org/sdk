import { createRohinikClient } from '@rohinik-org/client'

/**
 * Submit a single execution and wait for the result.
 *
 * In production: replace baseUrl with your running Rohinik endpoint.
 * The mock in tests exercises the same logic without a real runtime.
 */
export async function helloExecution(baseUrl: string): Promise<string> {
  const client = createRohinikClient({ baseUrl })

  const handle = await client.executions.start({
    capability: 'text:complete',
    messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
  })

  const result = await handle.waitForResult()
  return (result.output as Record<string, string>)['text'] ?? ''
}

import { createRohinikClient } from '@rohinik-org/client'

export async function run(baseUrl: string, prompt: string): Promise<string> {
  const client = createRohinikClient({ baseUrl })
  const handle = await client.executions.start({
    capability: 'text:complete',
    messages:   [{ role: 'user', content: prompt }],
  })
  const result = await handle.waitForResult()
  return (result.output as Record<string, string>)['text'] ?? ''
}

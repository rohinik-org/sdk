import { createRohinikClient, type PublicExecutionEvent } from '@rohinik-org/client'

/**
 * Stream an execution event-by-event, collecting partial text chunks.
 *
 * In production: replace baseUrl with your running Rohinik endpoint.
 */
export async function streamExecution(
  baseUrl: string,
  prompt: string,
): Promise<{ text: string; eventCount: number }> {
  const client = createRohinikClient({ baseUrl })

  const handle = await client.executions.start({
    capability: 'text:complete',
    messages: [{ role: 'user', content: prompt }],
  })

  const chunks: string[] = []
  let eventCount = 0

  for await (const event of handle.events()) {
    eventCount++
    if (event.kind === 'PARTIAL_OUTPUT') {
      const payload = event.payload as Record<string, unknown>
      if (typeof payload['delta'] === 'string') {
        chunks.push(payload['delta'])
      }
    }
    if (event.kind === 'EXECUTION_COMPLETED' || event.kind === 'EXECUTION_FAILED') {
      break
    }
  }

  return { text: chunks.join(''), eventCount }
}

export type { PublicExecutionEvent }

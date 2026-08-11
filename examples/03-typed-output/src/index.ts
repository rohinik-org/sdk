import { createRohinikClient } from '@rohinik-org/client'

/**
 * Typed output shape for a structured JSON result.
 * The runtime returns this in result.output when the capability declares
 * an output schema.
 */
export interface TypedOutput<T = unknown> {
  readonly value:  T
  readonly schema: string
}

/**
 * Run a capability that returns structured JSON and extract the typed output.
 *
 * In production: replace baseUrl with your running Rohinik endpoint.
 */
export async function runTypedOutput<T>(
  baseUrl:   string,
  capability: string,
  messages:  Array<{ role: string; content: string }>,
): Promise<TypedOutput<T> | null> {
  const client = createRohinikClient({ baseUrl })

  const handle = await client.executions.start({ capability, messages })
  const result = await handle.waitForResult()

  const output = result.output as Record<string, unknown> | null
  if (!output || typeof output['value'] === 'undefined') return null

  return {
    value:  output['value']  as T,
    schema: output['schema'] as string ?? 'unknown',
  }
}

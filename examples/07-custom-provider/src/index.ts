import { defineProvider } from '@rohinik-org/provider-sdk'

/**
 * A custom provider that wraps an external model API.
 *
 * The secret is gated via secretRef — it is NEVER embedded in the
 * ProviderDefinition object. Accessing it at runtime requires the context
 * to have declared it (runtime enforcement, not just a convention).
 *
 * Authoring lifecycle:
 *   1. Edit this file
 *   2. npm test
 *   3. npm run validate   (rohinik dev validate)
 *   4. npm run pack       (rohinik dev pack)
 *   5. Inspect .rpk — status: "unpublished"
 *      packed ≠ published ≠ trusted ≠ installed
 */
export const echoProvider = defineProvider({
  id:           'example:echo-provider',
  version:      '0.1.0',
  capabilities: { text: true },
  secretRefs:   ['ECHO_PROVIDER_API_KEY'],

  async execute(ctx, req) {
    // Access is gated — throws if secret is not declared in the execution context
    const _apiKey = ctx.secretRef('ECHO_PROVIDER_API_KEY')

    const messages = req.messages as Array<{ role: string; content: string }>
    const last = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    return { text: `echo: ${last}` }
  },

  async health(ctx) {
    try {
      ctx.secretRef('ECHO_PROVIDER_API_KEY')
      return { status: 'HEALTHY' }
    } catch {
      return { status: 'DEGRADED' }
    }
  },
})

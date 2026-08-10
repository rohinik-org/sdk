import { defineProvider } from '@rohinik-org/provider-sdk'

export const myProvider = defineProvider({
  id:           'my-provider',
  version:      '0.1.0',
  capabilities: { text: true },
  secretRefs:   ['MY_PROVIDER_API_KEY'],

  async execute(ctx, req) {
    const apiKey = ctx.secretRef('MY_PROVIDER_API_KEY')
    // Replace with real API call using apiKey
    void apiKey
    const messages = req.messages as Array<{ role: string; content: string }>
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    return { text: `echo: ${lastUserMessage}` }
  },

  async health(ctx) {
    try {
      ctx.secretRef('MY_PROVIDER_API_KEY')
      return { status: 'HEALTHY' }
    } catch {
      return { status: 'DEGRADED' }
    }
  },
})

import { defineAgent } from '@rohinik-org/agent-sdk'

export const myAgent = defineAgent({
  id:      'my-agent',
  version: '0.1.0',
  role:    'A helpful assistant that echoes back what it receives.',
  goals: [
    { description: 'Respond to user input', priority: 'HIGH' },
  ],
  capabilities: ['example:text-echo'],
  authority: {
    allowedCapabilities: ['example:text-echo'],
    allowedActions:      [],
    deniedActions:       [],
    maxDelegationDepth:  0,
  },
  budget: {
    maxCostUsd:   0.10,
    maxLatencyMs: 30_000,
  },
  policy: [],
  instructions: async (_ctx) => `You are a helpful assistant. Echo back what the user says.`,
})

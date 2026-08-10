import { defineCapability, inputField, outputField, result } from '@rohinik-org/capability-sdk'

export const myCapability = defineCapability({
  id:          'example:text-echo',
  name:        'Text Echo',
  description: 'Returns the input text unchanged.',
  version:     '0.1.0',
  tier:        'LOCAL',
  tags:        ['example'],
  permissions: [],
  input:  [inputField('text', 'string', { description: 'Text to echo' })],
  output: [outputField('echoed', 'string', { description: 'The echoed text' })],

  async execute(_ctx, input) {
    const fields = input as Record<string, unknown>
    return result({ echoed: fields['text'] as string })
  },
})

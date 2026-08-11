import { defineCapability, inputField, outputField, result } from '@rohinik-org/capability-sdk'

/**
 * A word-count capability that accepts text and returns the word count.
 *
 * Authoring lifecycle:
 *   1. Edit this file
 *   2. npm test
 *   3. npm run validate   (rohinik dev validate)
 *   4. npm run pack       (rohinik dev pack)
 *   5. Inspect .rpk — status: "unpublished"
 *      packed ≠ published ≠ trusted ≠ installed
 */
export const wordCountCapability = defineCapability({
  id:          'example:word-count',
  name:        'Word Count',
  description: 'Counts the number of words in the provided text.',
  version:     '0.1.0',
  tier:        'LOCAL',
  tags:        ['example', 'text'],
  permissions: [],
  input:  [inputField('text', 'string', { description: 'Text to count words in' })],
  output: [outputField('count', 'number', { description: 'Number of words' })],

  async execute(_ctx, input) {
    const fields = input as Record<string, unknown>
    const text   = String(fields['text'] ?? '')
    const count  = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
    return result({ count })
  },
})

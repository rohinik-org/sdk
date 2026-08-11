import type { PackageDefinition } from '@rohinik-org/package-sdk'

/**
 * Package definition for the word-count capability.
 *
 * This is what rohinik dev validate and rohinik dev pack read.
 * The output .rpk has status: "unpublished" — it is not installed
 * or trusted until a runtime explicitly admits it.
 */
const definition: PackageDefinition = {
  package: {
    id:          'com.example.word-count',
    name:        'Word Count',
    version:     '0.1.0',
    type:        'capability-provider',
    description: 'Counts the number of words in the provided text.',
  },
  provides: [
    { capability: 'example:word-count', version: '0.1.0' },
  ],
  consumes: [],
}

export default definition

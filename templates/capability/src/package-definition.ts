import type { PackageDefinition } from '@rohinik-org/package-sdk'

const definition: PackageDefinition = {
  package: {
    id:          'com.example.text-echo',
    name:        'Text Echo',
    version:     '0.1.0',
    type:        'capability-provider',
    description: 'Returns the input text unchanged.',
  },
  provides: [
    { capability: 'example:text-echo', version: '0.1.0' },
  ],
  consumes: [],
}

export default definition

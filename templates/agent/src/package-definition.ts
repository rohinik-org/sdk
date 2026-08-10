import type { PackageDefinition } from '@rohinik-org/package-sdk'

const definition: PackageDefinition = {
  package: {
    id:          'com.example.my-agent',
    name:        'My Agent',
    version:     '0.1.0',
    type:        'capability-provider',
    description: 'A helpful assistant agent.',
  },
  provides: [],
  consumes: [],
}

export default definition

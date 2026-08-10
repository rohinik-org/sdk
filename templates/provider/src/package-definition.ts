import type { PackageDefinition } from '@rohinik-org/package-sdk'

const definition: PackageDefinition = {
  package: {
    id:          'com.example.my-provider',
    name:        'My Provider',
    version:     '0.1.0',
    type:        'model-provider',
    description: 'A Rohinik model provider.',
  },
  provides: [
    { capability: 'text:complete', version: '0.1.0' },
  ],
  consumes: [],
  configuration: {
    secrets: [
      { name: 'MY_PROVIDER_API_KEY', required: true, description: 'API key for the provider' },
    ],
  },
}

export default definition

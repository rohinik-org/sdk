import type { PackageDefinition } from '@rohinik-org/package-sdk'

/**
 * Package definition for the echo provider.
 *
 * packed ≠ published ≠ trusted ≠ installed.
 */
const definition: PackageDefinition = {
  package: {
    id:          'com.example.echo-provider',
    name:        'Echo Provider',
    version:     '0.1.0',
    type:        'model-provider',
    description: 'An example provider that echoes user messages back.',
  },
  provides: [
    { capability: 'text:complete', version: '0.1.0' },
  ],
  consumes: [],
  configuration: {
    secrets: [
      { name: 'ECHO_PROVIDER_API_KEY', required: true, description: 'API key for the echo provider' },
    ],
  },
}

export default definition

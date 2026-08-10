import { defineConfig } from 'tsup'

export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm'],
  dts:        false,
  splitting:  false,
  noExternal: [
    /@rohinik-org\/capability-sdk/,
    /@rohinik-org\/agent-sdk/,
    /@rohinik-org\/provider-sdk/,
    /@rohinik-org\/package-sdk/,
  ],
})

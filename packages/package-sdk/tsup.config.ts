import { defineConfig } from 'tsup'

export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm'],
  dts:        false,
  splitting:  false,
  noExternal: [
    /@rohinik-org\/package-manifest-ir/,
    /@rohinik-org\/package-sdk/,
  ],
})

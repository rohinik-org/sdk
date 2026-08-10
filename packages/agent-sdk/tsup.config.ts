import { defineConfig } from 'tsup'

export default defineConfig({
  entry:      ['src/index.ts'],
  format:     ['esm'],
  dts:        false,
  splitting:  false,
  // Bundle vendor dep so packed tarball needs no file: peer resolution
  noExternal: [/@rohinik-org\/agent-ir/],
})

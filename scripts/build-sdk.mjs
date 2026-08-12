/**
 * build-sdk.mjs — build only the packages listed in beta-version.json publishOrder.
 *
 * Uses explicit --filter per package so private/deferred packages (sdk,
 * sdk-contracts, adapter-sdk, asset-sdk) are never included.
 *
 * Skips @rohinik-org/install-manifest (RS1-owned, not in SDK workspace).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SDK_ROOT  = join(__dirname, '..')

const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
if (!existsSync(bvPath)) {
  console.error(`beta-version.json not found at ${bvPath}`)
  process.exit(1)
}

const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))

const sdkPackages = bv.publishOrder.filter(p => {
  const shortName = p.replace('@rohinik-org/', '')
  return existsSync(join(SDK_ROOT, 'packages', shortName, 'package.json'))
})

if (sdkPackages.length === 0) {
  console.error('No SDK packages found in publishOrder')
  process.exit(1)
}

const filters = sdkPackages.map(p => `--filter ${p}`).join(' ')
const cmd     = `pnpm ${filters} --sort run build`

console.log(`[build] Building ${sdkPackages.length} packages: ${sdkPackages.join(', ')}`)
console.log(`[build] ${cmd}`)

execSync(cmd, { cwd: SDK_ROOT, stdio: 'inherit' })
console.log('[build] Done')

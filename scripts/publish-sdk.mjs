/**
 * publish-sdk.mjs — publish SDK packages in the order defined by beta-version.json.
 *
 * Usage:
 *   node scripts/publish-sdk.mjs --tag <dist-tag> [--provenance]
 *
 * Reads publishOrder from release/beta-version.json and runs
 * `npm publish --tag <t> --access public [--provenance]` in each package dir.
 * Fail-closed: exits 1 immediately on any nonzero npm exit.
 *
 * Requires NODE_AUTH_TOKEN in env (set by actions/setup-node registry-url).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SDK_ROOT  = join(__dirname, '..')

const args       = process.argv.slice(2)
const tag        = args[args.indexOf('--tag') + 1]
const provenance = args.includes('--provenance')

if (!tag) {
  console.error('Usage: node publish-sdk.mjs --tag <dist-tag> [--provenance]')
  process.exit(1)
}

const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
if (!existsSync(bvPath)) {
  console.error(`beta-version.json not found at ${bvPath}`)
  process.exit(1)
}

const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))

for (const pkg of bv.publishOrder) {
  // Derive local dir: @rohinik-org/cli → packages/cli
  const shortName = pkg.replace('@rohinik-org/', '')
  const pkgDir    = join(SDK_ROOT, 'packages', shortName)

  if (!existsSync(join(pkgDir, 'package.json'))) {
    console.log(`[publish] ${pkg}: not in SDK workspace — skipping (RS1-owned)`)
    continue
  }

  const pkgMeta    = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
  const pkgVersion = pkgMeta.version

  // Skip if already published (idempotent re-run)
  try {
    execSync(`npm view ${pkg}@${pkgVersion} version`, { stdio: 'pipe' })
    console.log(`[publish] ${pkg}@${pkgVersion}: already on npm — skipping`)
    continue
  } catch {
    // not published yet — proceed
  }

  const cmd = [
    'npm publish',
    `--tag ${tag}`,
    '--access public',
    provenance ? '--provenance' : '',
  ].filter(Boolean).join(' ')

  console.log(`[publish] ${pkg}: ${cmd}`)
  try {
    execSync(cmd, { cwd: pkgDir, stdio: 'inherit' })
    console.log(`[publish] ${pkg}: OK`)
  } catch (e) {
    console.error(`[publish] ${pkg}: FAILED`)
    process.exit(1)
  }
}

console.log(`[publish] all ${bv.publishOrder.length} packages published under dist-tag ${tag}`)

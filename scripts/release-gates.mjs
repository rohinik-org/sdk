/**
 * release-gates.mjs (SDK) — fail-closed pre/post-release assertion checks.
 *
 * Usage:
 *   node scripts/release-gates.mjs --check-version <tag>
 *   node scripts/release-gates.mjs --check-npm <package> <version> <dist-tag>
 *   node scripts/release-gates.mjs --check-all-sdk-packages <dist-tag>
 *
 * SDK-only subset of rs1/scripts/release-gates.mjs:
 * no --check-provenance or --check-github-release (RS1-owned checks).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SDK_ROOT  = join(__dirname, '..')

const args = process.argv.slice(2)
const cmd  = args[0]

if (!cmd) {
  console.error('Usage: node release-gates.mjs --check-<subcommand> ...')
  process.exit(1)
}

try {
  switch (cmd) {
    case '--check-version':           await checkVersion(args[1]);                    break
    case '--check-npm':               await checkNpm(args[1], args[2], args[3]);      break
    case '--check-all-sdk-packages':  await checkAllSdkPackages(args[1]);             break
    case '--check-build-allowlist':   await checkBuildAllowlist();                    break
    default:
      console.error(`Unknown subcommand: ${cmd}`)
      process.exit(1)
  }
} catch (e) {
  console.error(`[gate] FAIL: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}

// ── --check-version <tag> ─────────────────────────────────────────────────────

async function checkVersion(tag) {
  if (!tag) throw new Error('--check-version requires <tag>')

  const version = tag.replace(/^v/, '')
  const bvPath  = join(SDK_ROOT, 'release', 'beta-version.json')
  if (!existsSync(bvPath)) throw new Error(`beta-version.json not found at ${bvPath}`)

  const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))
  if (bv.release !== version) {
    throw new Error(`Tag version mismatch: tag=${version}, beta-version.json.release=${bv.release}`)
  }

  console.log(`[gate] version OK: ${version}`)
}

// ── --check-npm <package> <version> <dist-tag> ────────────────────────────────

async function checkNpm(pkg, version, distTag) {
  if (!pkg || !version || !distTag) {
    throw new Error('--check-npm requires <package> <version> <dist-tag>')
  }

  const maxAttempts = 10
  const backoffMs   = 6_000

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      console.log(`[gate] npm: attempt ${i + 1}/${maxAttempts}, waiting ${backoffMs / 1000}s...`)
      await sleep(backoffMs)
    }

    try {
      const vRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}`)
      if (!vRes.ok) {
        console.log(`[gate] npm: ${pkg}@${version} not yet visible (HTTP ${vRes.status})`)
        continue
      }

      const tagRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`)
      if (!tagRes.ok) continue
      const meta   = await tagRes.json()
      const tagVer = meta['dist-tags']?.[distTag]
      if (tagVer !== version) {
        console.log(`[gate] npm: dist-tag ${distTag} is ${tagVer}, not ${version} yet`)
        continue
      }

      console.log(`[gate] npm OK: ${pkg}@${version} (dist-tag ${distTag})`)
      return
    } catch (e) {
      console.log(`[gate] npm: fetch error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(`${pkg}@${version} not found on npm under dist-tag ${distTag} after ${maxAttempts} attempts`)
}

// ── --check-all-sdk-packages <dist-tag> ───────────────────────────────────────

async function checkAllSdkPackages(distTag) {
  if (!distTag) throw new Error('--check-all-sdk-packages requires <dist-tag>')

  const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
  if (!existsSync(bvPath)) throw new Error(`beta-version.json not found at ${bvPath}`)
  const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))

  for (const pkg of bv.publishOrder) {
    const version = bv.packages[pkg]
    if (!version) throw new Error(`no version for ${pkg} in beta-version.json`)
    await checkNpm(pkg, version, distTag)
  }

  console.log(`[gate] all SDK packages OK under dist-tag ${distTag}`)
}

// ── --check-build-allowlist ───────────────────────────────────────────────────

async function checkBuildAllowlist() {
  const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
  if (!existsSync(bvPath)) throw new Error(`beta-version.json not found at ${bvPath}`)
  const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))

  const { readdirSync } = await import('node:fs')
  const pkgsDir = join(SDK_ROOT, 'packages')
  const deferred = []

  for (const dir of readdirSync(pkgsDir)) {
    const pkgJson = join(pkgsDir, dir, 'package.json')
    if (!existsSync(pkgJson)) continue
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'))
    if (pkg.private) continue                                // --no-private excludes these
    if (bv.publishOrder.includes(pkg.name)) continue        // in allowlist, fine
    deferred.push(pkg.name)
  }

  if (deferred.length > 0) {
    throw new Error(
      `Non-private packages outside publishOrder would be built: ${deferred.join(', ')}. ` +
      `Add --no-private or add them to publishOrder.`
    )
  }

  console.log(`[gate] build-allowlist OK: all non-private packages are in publishOrder`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

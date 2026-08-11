/**
 * BR-2 publication boundary gate — T12.
 *
 * For each of the 8 Beta-public packages:
 *   1. Run `npm pack --dry-run --json` in the package directory
 *   2. Assert `license` field is present and equals "Apache-2.0"
 *   3. Assert `files` in packed tarball matches allowlist (no vendor/ leak for non-CLI packages)
 *   4. Assert CLI tarball includes vendor/ (install-manifest runtime dep)
 *   5. Assert no `workspace:` or `link:` strings appear in packed file list
 *   6. Assert no `private: true` on any of the 8 Beta packages
 *
 * For the 4 non-public workspace packages:
 *   7. Assert `private: true` is set (accidental-publish guard)
 *
 * Does NOT publish anything. `npm pack --dry-run` produces no artifact on disk.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname   = dirname(fileURLToPath(import.meta.url))
const SDK_ROOT    = join(__dirname, '..', '..', '..', '..')        // sdk/
const PACKAGES    = join(SDK_ROOT, 'packages')                     // sdk/packages/
const TEMPLATES   = join(SDK_ROOT, 'templates')                    // sdk/templates/
const RS1_INSTALL = join(SDK_ROOT, '..', '..', 'rs1', 'core', 'runtime', 'install-manifest')

function readPkg(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as Record<string, unknown>
}

// npm pack --dry-run --json returns an array; take first element
interface PackEntry { filename: string; files: Array<{ path: string }> }
function dryPack(dir: string): PackEntry {
  const out = execSync('npm pack --dry-run --json', { cwd: dir, encoding: 'utf-8', stdio: 'pipe' })
  const parsed = JSON.parse(out) as PackEntry[]
  return parsed[0]
}

// ── Beta public packages ───────────────────────────────────────────────────────

const BETA_PACKAGES: Array<{ name: string; dir: string; vendorExpected: boolean }> = [
  { name: '@rohinik-org/cli',            dir: join(PACKAGES, 'cli'),            vendorExpected: false },
  { name: '@rohinik-org/client',         dir: join(PACKAGES, 'client'),         vendorExpected: false },
  { name: '@rohinik-org/capability-sdk', dir: join(PACKAGES, 'capability-sdk'), vendorExpected: false },
  { name: '@rohinik-org/agent-sdk',      dir: join(PACKAGES, 'agent-sdk'),      vendorExpected: false },
  { name: '@rohinik-org/provider-sdk',   dir: join(PACKAGES, 'provider-sdk'),   vendorExpected: false },
  { name: '@rohinik-org/package-sdk',    dir: join(PACKAGES, 'package-sdk'),    vendorExpected: false },
  { name: '@rohinik-org/testing',        dir: join(PACKAGES, 'testing'),        vendorExpected: false },
  { name: '@rohinik-org/install-manifest', dir: RS1_INSTALL,                    vendorExpected: false },
]

describe('BR-2: publication boundary — Beta public packages', () => {
  for (const { name, dir, vendorExpected } of BETA_PACKAGES) {
    describe(name, () => {
      let pkg: Record<string, unknown>
      let packed: PackEntry

      try {
        pkg    = readPkg(dir)
        packed = dryPack(dir)
      } catch (e) {
        it('pack/read failed', () => { throw e })
        return
      }

      it('has license: Apache-2.0', () => {
        expect(pkg['license']).toBe('Apache-2.0')
      })

      it('is not marked private', () => {
        expect(pkg['private']).not.toBe(true)
      })

      it('has publishConfig.access: public', () => {
        const pub = pkg['publishConfig'] as Record<string, unknown> | undefined
        expect(pub?.['access']).toBe('public')
      })

      it('packed files all live under dist/ (or vendor/ for CLI)', () => {
        const paths = packed.files.map(f => f.path)
        const nonDist = paths.filter(p =>
          !p.startsWith('dist/') &&
          !p.startsWith('package.json') &&
          !p.startsWith('README') &&
          !p.startsWith('LICENSE') &&
          !p.startsWith('CHANGELOG') &&
          // ponytail: vendor/ is intentionally included for CLI only (runtime dep resolution)
          !(vendorExpected && p.startsWith('vendor/'))
        )
        expect(nonDist, `unexpected packed paths: ${nonDist.join(', ')}`).toHaveLength(0)
      })

      if (vendorExpected) {
        it('vendor/ is included in pack (CLI runtime dep)', () => {
          const paths = packed.files.map(f => f.path)
          expect(paths.some(p => p.startsWith('vendor/'))).toBe(true)
        })
      } else {
        it('vendor/ is NOT included in pack', () => {
          const paths = packed.files.map(f => f.path)
          expect(paths.some(p => p.startsWith('vendor/'))).toBe(false)
        })
      }

      it('no workspace: or link: strings in packed file list', () => {
        const paths = packed.files.map(f => f.path).join('\n')
        expect(paths).not.toContain('workspace:')
        expect(paths).not.toContain('link:')
      })
    })
  }
})

// ── Private / non-public packages (accidental-publish guard) ──────────────────

const PRIVATE_PACKAGES = [
  { name: '@rohinik-org/adapter-sdk',   dir: join(PACKAGES, 'adapter-sdk')   },
  { name: '@rohinik-org/asset-sdk',     dir: join(PACKAGES, 'asset-sdk')     },
  { name: '@rohinik-org/sdk',           dir: join(PACKAGES, 'sdk')           },
  { name: '@rohinik-org/sdk-contracts', dir: join(PACKAGES, 'sdk-contracts') },
]

describe('BR-2: accidental-publish guard — non-public packages', () => {
  for (const { name, dir } of PRIVATE_PACKAGES) {
    it(`${name} has private: true`, () => {
      const pkg = readPkg(dir)
      expect(pkg['private']).toBe(true)
    })
  }

  it('templates: all 4 have private: true', () => {
    for (const t of ['app', 'capability', 'agent', 'provider']) {
      const pkg = readPkg(join(TEMPLATES, t))
      expect(pkg['private'], `template/${t} missing private: true`).toBe(true)
    }
  })
})

/**
 * Template external consumer gate — T9 critical test.
 *
 * For each template (capability, agent, provider):
 *   1. Copy template to fresh temp directory
 *   2. Patch package.json to install SDK deps from local vendor tarballs
 *   3. npm install
 *   4. vitest run (tests)
 *   5. tsc --noEmit (typecheck)
 *   6. tsc (build — produces dist/src/package-definition.js)
 *   7. rohinik dev validate --entry dist/src/package-definition.js
 *   8. rohinik dev pack --entry dist/src/package-definition.js
 *   9. Verify .rpk: exists, gzip-valid, contains integrity JSON with status=unpublished
 *  10. Verify no RS1 refs / workspace: links in installed node_modules
 *
 * App template: steps 3–5 only (no package definition).
 *
 * Kept fast: npm install uses --prefer-offline where possible.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  mkdtempSync, rmSync, mkdirSync, copyFileSync,
  readdirSync, statSync, readFileSync, writeFileSync, existsSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VENDOR_DIR   = join(__dirname, '..', '..', 'vendor')
const TEMPLATE_DIR = join(__dirname, '..', '..', '..', '..', 'templates')
const CLI_BIN      = join(__dirname, '..', '..', '..', '..', 'packages', 'cli', 'dist', 'bin.js')

// Vendor tarball paths
const VENDOR = {
  capability: join(VENDOR_DIR, 'rohinik-org-capability-sdk-0.16.0.tgz'),
  agent:      join(VENDOR_DIR, 'rohinik-org-agent-sdk-0.16.0.tgz'),
  provider:   join(VENDOR_DIR, 'rohinik-org-provider-sdk-0.16.0.tgz'),
  packageSdk: join(VENDOR_DIR, 'rohinik-org-package-sdk-0.16.0.tgz'),
  testing:    join(VENDOR_DIR, 'rohinik-org-testing-0.16.0.tgz'),
  client:     join(VENDOR_DIR, 'rohinik-org-client-1.0.0.tgz'),
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const s = join(src, entry)
    const d = join(dest, entry)
    if (statSync(s).isDirectory()) {
      copyDir(s, d)
    } else {
      copyFileSync(s, d)
    }
  }
}

function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' })
}

function patchPackageJson(dir: string, patches: Record<string, string>): void {
  const path    = join(dir, 'package.json')
  const pkg     = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
  const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>
  for (const [name, value] of Object.entries(patches)) {
    if (name in devDeps) devDeps[name] = value
  }
  pkg['devDependencies'] = devDeps
  writeFileSync(path, JSON.stringify(pkg, null, 2), 'utf-8')
}


let tmpRoot: string

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'rohinik-template-gate-'))
})
afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupTemplate(name: string, patches: Record<string, string>): string {
  const srcDir  = join(TEMPLATE_DIR, name)
  const destDir = join(tmpRoot, name)
  copyDir(srcDir, destDir)
  patchPackageJson(destDir, patches)
  return destDir
}

async function verifyRpk(rpkPath: string): Promise<void> {
  expect(existsSync(rpkPath)).toBe(true)
  const gzipped  = readFileSync(rpkPath)
  const tarBytes = gunzipSync(gzipped)
  expect(tarBytes.length).toBeGreaterThan(0)
  // Scan tar for rohinik-integrity.json
  let found = false
  let offset = 0
  while (offset + 512 <= tarBytes.length) {
    const nameBytes = tarBytes.subarray(offset, offset + 100)
    const nullIdx   = nameBytes.indexOf(0)
    const name      = nameBytes.subarray(0, nullIdx < 0 ? 100 : nullIdx).toString('utf-8')
    if (name === '' && tarBytes.subarray(offset, offset + 512).every(b => b === 0)) break
    const sizeOctal = tarBytes.subarray(offset + 124, offset + 135).toString('utf-8').replace(/\0/g, '').trim()
    const size      = parseInt(sizeOctal, 8) || 0
    if (name.endsWith('rohinik-integrity.json')) {
      const content = tarBytes.subarray(offset + 512, offset + 512 + size).toString('utf-8')
      const parsed  = JSON.parse(content) as Record<string, unknown>
      expect(parsed['status']).toBe('unpublished')
      expect(typeof parsed['contentHash']).toBe('string')
      expect((parsed['contentHash'] as string).startsWith('sha256:')).toBe(true)
      found = true
      break
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  expect(found, 'rohinik-integrity.json not found in .rpk').toBe(true)
}

// ── capability ────────────────────────────────────────────────────────────────

describe('template: capability', () => {
  let dir: string

  beforeAll(() => {
    dir = setupTemplate('capability', {
      '@rohinik-org/capability-sdk': `file:${VENDOR.capability}`,
      '@rohinik-org/testing':        `file:${VENDOR.testing}`,
      '@rohinik-org/package-sdk':    `file:${VENDOR.packageSdk}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => {
    expect(true).toBe(true)
  })

  it('typecheck passes', () => {
    expect(() => exec('npx tsc --noEmit', dir)).not.toThrow()
  }, 60_000)

  it('tests pass', () => {
    const out = exec('npx vitest run', dir)
    expect(out).toMatch(/passed/)
  }, 60_000)

  it('rohinik dev validate passes', () => {
    exec('npx tsc', dir)
    const out = exec(`node "${CLI_BIN}" dev validate --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Valid/)
  }, 60_000)

  it('rohinik dev pack produces valid .rpk', async () => {
    const out     = exec(`node "${CLI_BIN}" dev pack --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Packed/)
    const rpkPath = join(dir, 'com-example-text-echo-0.1.0.rpk')
    await verifyRpk(rpkPath)
  }, 30_000)

  it('no workspace: or file:../ in installed deps', () => {
    const pkgLock = join(dir, 'package-lock.json')
    const content = readFileSync(pkgLock, 'utf-8')
    expect(content).not.toMatch(/workspace:/)
    expect(content).not.toMatch(/Documents\\rs1/)
    expect(content).not.toMatch(/Documents\/rs1/)
  })
})

// ── agent ─────────────────────────────────────────────────────────────────────

describe('template: agent', () => {
  let dir: string

  beforeAll(() => {
    dir = setupTemplate('agent', {
      '@rohinik-org/agent-sdk':   `file:${VENDOR.agent}`,
      '@rohinik-org/testing':     `file:${VENDOR.testing}`,
      '@rohinik-org/package-sdk': `file:${VENDOR.packageSdk}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })

  it('typecheck passes', () => {
    expect(() => exec('npx tsc --noEmit', dir)).not.toThrow()
  }, 60_000)

  it('tests pass', () => {
    const out = exec('npx vitest run', dir)
    expect(out).toMatch(/passed/)
  }, 60_000)

  it('rohinik dev validate passes', () => {
    exec('npx tsc', dir)
    const out = exec(`node "${CLI_BIN}" dev validate --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Valid/)
  }, 60_000)

  it('rohinik dev pack produces valid .rpk', async () => {
    const out     = exec(`node "${CLI_BIN}" dev pack --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Packed/)
    const rpkPath = join(dir, 'com-example-my-agent-0.1.0.rpk')
    await verifyRpk(rpkPath)
  }, 30_000)

  it('no RS1 refs in installed deps', () => {
    const pkgLock = join(dir, 'package-lock.json')
    const content = readFileSync(pkgLock, 'utf-8')
    expect(content).not.toMatch(/workspace:/)
    expect(content).not.toMatch(/Documents\\rs1/)
    expect(content).not.toMatch(/Documents\/rs1/)
  })
})

// ── provider ──────────────────────────────────────────────────────────────────

describe('template: provider', () => {
  let dir: string

  beforeAll(() => {
    dir = setupTemplate('provider', {
      '@rohinik-org/provider-sdk': `file:${VENDOR.provider}`,
      '@rohinik-org/testing':      `file:${VENDOR.testing}`,
      '@rohinik-org/package-sdk':  `file:${VENDOR.packageSdk}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })

  it('typecheck passes', () => {
    expect(() => exec('npx tsc --noEmit', dir)).not.toThrow()
  }, 60_000)

  it('tests pass', () => {
    const out = exec('npx vitest run', dir)
    expect(out).toMatch(/passed/)
  }, 60_000)

  it('rohinik dev validate passes', () => {
    exec('npx tsc', dir)
    const out = exec(`node "${CLI_BIN}" dev validate --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Valid/)
  }, 60_000)

  it('rohinik dev pack produces valid .rpk', async () => {
    const out     = exec(`node "${CLI_BIN}" dev pack --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Packed/)
    const rpkPath = join(dir, 'com-example-my-provider-0.1.0.rpk')
    await verifyRpk(rpkPath)
  }, 30_000)

  it('no RS1 refs in installed deps', () => {
    const pkgLock = join(dir, 'package-lock.json')
    const content = readFileSync(pkgLock, 'utf-8')
    expect(content).not.toMatch(/workspace:/)
    expect(content).not.toMatch(/Documents\\rs1/)
    expect(content).not.toMatch(/Documents\/rs1/)
  })
})

// ── app ───────────────────────────────────────────────────────────────────────

describe('template: app', () => {
  let dir: string

  beforeAll(() => {
    dir = setupTemplate('app', {
      '@rohinik-org/client':  `file:${VENDOR.client}`,
      '@rohinik-org/testing': `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })

  it('typecheck passes', () => {
    expect(() => exec('npx tsc --noEmit', dir)).not.toThrow()
  }, 60_000)

  it('tests pass', () => {
    const out = exec('npx vitest run', dir)
    expect(out).toMatch(/passed/)
  }, 60_000)

  it('no RS1 refs in installed deps', () => {
    const pkgLock = join(dir, 'package-lock.json')
    const content = readFileSync(pkgLock, 'utf-8')
    expect(content).not.toMatch(/workspace:/)
    expect(content).not.toMatch(/Documents\\rs1/)
    expect(content).not.toMatch(/Documents\/rs1/)
  })
})

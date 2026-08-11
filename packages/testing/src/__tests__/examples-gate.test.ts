/**
 * Examples external consumer gate — T10 critical test.
 *
 * For each example:
 *   1. Copy example to fresh temp directory
 *   2. Patch package.json devDependencies to use local vendor tarballs
 *   3. npm install --prefer-offline
 *   4. tsc --noEmit (typecheck)
 *   5. vitest run (tests)
 *   6. [06, 07 only] tsc (build)
 *   7. [06, 07 only] rohinik dev validate --entry dist/package-definition.js
 *   8. [06, 07 only] rohinik dev pack --entry dist/package-definition.js
 *   9. [06, 07 only] verify .rpk has status: "unpublished"
 *  10. Verify no RS1 refs / workspace: links in package-lock.json
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

const __dirname  = dirname(fileURLToPath(import.meta.url))
const VENDOR_DIR  = join(__dirname, '..', '..', 'vendor')
const EXAMPLE_DIR = join(__dirname, '..', '..', '..', '..', 'examples')
const CLI_BIN     = join(__dirname, '..', '..', '..', '..', 'packages', 'cli', 'dist', 'bin.js')

const VENDOR = {
  capability: join(VENDOR_DIR, 'rohinik-org-capability-sdk-0.16.0.tgz'),
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
    statSync(s).isDirectory() ? copyDir(s, d) : copyFileSync(s, d)
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

function setupExample(name: string, patches: Record<string, string>): string {
  const srcDir  = join(EXAMPLE_DIR, name)
  const destDir = join(tmpRoot, name)
  copyDir(srcDir, destDir)
  patchPackageJson(destDir, patches)
  return destDir
}

async function verifyRpk(rpkPath: string): Promise<void> {
  expect(existsSync(rpkPath)).toBe(true)
  const tarBytes = gunzipSync(readFileSync(rpkPath))
  expect(tarBytes.length).toBeGreaterThan(0)

  // Walk tar entries looking for rohinik-integrity.json
  let offset = 0
  let found  = false
  while (offset + 512 <= tarBytes.length) {
    const nameBytes = tarBytes.slice(offset, offset + 100)
    const name      = Buffer.from(nameBytes).toString('utf-8').replace(/\0/g, '')
    if (!name) break

    const sizeOctal = Buffer.from(tarBytes.slice(offset + 124, offset + 136)).toString('utf-8').replace(/\0/g, '').trim()
    const size      = parseInt(sizeOctal, 8) || 0

    if (name.includes('rohinik-integrity.json')) {
      const content = Buffer.from(tarBytes.slice(offset + 512, offset + 512 + size)).toString('utf-8')
      const json    = JSON.parse(content) as Record<string, unknown>
      expect(json['status']).toBe('unpublished')
      found = true
      break
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  expect(found, 'rohinik-integrity.json not found in .rpk').toBe(true)
}

function assertNoRs1Refs(dir: string): void {
  const pkgLock = join(dir, 'package-lock.json')
  const content = readFileSync(pkgLock, 'utf-8')
  expect(content).not.toMatch(/workspace:/)
  expect(content).not.toMatch(/Documents\\rs1/)
  expect(content).not.toMatch(/Documents\/rs1/)
}

let tmpRoot: string

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'rohinik-examples-gate-'))
})
afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ── 01-hello-execution ────────────────────────────────────────────────────────

describe('example: 01-hello-execution', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('01-hello-execution', {
      '@rohinik-org/client':  `file:${VENDOR.client}`,
      '@rohinik-org/testing': `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)
  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

// ── 02-streaming-execution ────────────────────────────────────────────────────

describe('example: 02-streaming-execution', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('02-streaming-execution', {
      '@rohinik-org/client':  `file:${VENDOR.client}`,
      '@rohinik-org/testing': `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)
  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

// ── 03-typed-output ───────────────────────────────────────────────────────────

describe('example: 03-typed-output', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('03-typed-output', {
      '@rohinik-org/client':  `file:${VENDOR.client}`,
      '@rohinik-org/testing': `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)
  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

// ── 04-agent-delegation ───────────────────────────────────────────────────────

describe('example: 04-agent-delegation', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('04-agent-delegation', {
      '@rohinik-org/client':  `file:${VENDOR.client}`,
      '@rohinik-org/testing': `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)
  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

// ── 05-governed-mutation ──────────────────────────────────────────────────────

describe('example: 05-governed-mutation', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('05-governed-mutation', {
      '@rohinik-org/client':  `file:${VENDOR.client}`,
      '@rohinik-org/testing': `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)
  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

// ── 06-custom-capability ──────────────────────────────────────────────────────

describe('example: 06-custom-capability', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('06-custom-capability', {
      '@rohinik-org/capability-sdk': `file:${VENDOR.capability}`,
      '@rohinik-org/package-sdk':    `file:${VENDOR.packageSdk}`,
      '@rohinik-org/testing':        `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)

  it('rohinik dev validate passes', () => {
    exec('npx tsc', dir)
    const out = exec(`node "${CLI_BIN}" dev validate --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Valid/)
  }, 60_000)

  it('rohinik dev pack produces valid .rpk', async () => {
    const out     = exec(`node "${CLI_BIN}" dev pack --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Packed/)
    await verifyRpk(join(dir, 'com-example-word-count-0.1.0.rpk'))
  }, 30_000)

  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

// ── 07-custom-provider ────────────────────────────────────────────────────────

describe('example: 07-custom-provider', () => {
  let dir: string
  beforeAll(() => {
    dir = setupExample('07-custom-provider', {
      '@rohinik-org/provider-sdk': `file:${VENDOR.provider}`,
      '@rohinik-org/package-sdk':  `file:${VENDOR.packageSdk}`,
      '@rohinik-org/testing':      `file:${VENDOR.testing}`,
    })
    exec('npm install --prefer-offline --loglevel=error', dir)
  }, 120_000)

  it('npm install succeeds', () => { expect(true).toBe(true) })
  it('typecheck passes', () => { expect(() => exec('npx tsc --noEmit', dir)).not.toThrow() }, 60_000)
  it('tests pass', () => { expect(exec('npx vitest run', dir)).toMatch(/passed/) }, 60_000)

  it('rohinik dev validate passes', () => {
    exec('npx tsc', dir)
    const out = exec(`node "${CLI_BIN}" dev validate --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Valid/)
  }, 60_000)

  it('rohinik dev pack produces valid .rpk', async () => {
    const out     = exec(`node "${CLI_BIN}" dev pack --entry dist/package-definition.js`, dir)
    expect(out).toMatch(/Packed/)
    await verifyRpk(join(dir, 'com-example-echo-provider-0.1.0.rpk'))
  }, 30_000)

  it('no RS1 refs', () => { assertNoRs1Refs(dir) })
})

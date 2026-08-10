/**
 * T3 acceptance tests — install, state, health, version, status, stop.
 *
 * start() and the full process lifecycle are tested separately in start.test.ts
 * using a mock runtime stub.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, platform } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  install,
  readActiveVersion,
  readActiveManifest,
  listInstalledVersions,
  version,
  formatVersionInfo,
  readProcessRecord,
  writeProcessRecord,
  removeProcessRecord,
  isPidAlive,
  status,
  stop,
  CLI_VERSION,
} from '../index.js'
import { resolveHome, MANIFEST_SCHEMA_VERSION } from '@rohinik-org/install-manifest'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), 'rhk-t3-'))
}

function makeBundle(dir: string): { bundleDir: string; artifactHash: string } {
  const bundleDir = join(dir, 'bundle')
  mkdirSync(join(bundleDir, 'bin'), { recursive: true })
  // Minimal stub entrypoint
  writeFileSync(join(bundleDir, 'bin', 'rhks.js'), '#!/usr/bin/env node\nconsole.log("stub")\n')
  writeFileSync(join(bundleDir, 'package.json'), JSON.stringify({ name: 'rhks-stub', version: '0.16.0-beta.1' }))
  // Hash the bundle dir as a single byte string (test simplification)
  const content = 'stub-bundle-content'
  const artifactHash = createHash('sha256').update(content).digest('hex')
  writeFileSync(join(dir, 'artifact.bin'), content)
  return { bundleDir, artifactHash }
}

function makeManifest(dir: string, artifactHash: string, overrides: Record<string, unknown> = {}): string {
  const manifest = {
    schemaVersion:      MANIFEST_SCHEMA_VERSION,
    runtimeVersion:     '0.16.0-beta.1',
    releaseChannel:     'beta',
    platform:           { os: platform() === 'win32' ? 'win32' : platform() === 'darwin' ? 'darwin' : 'linux', arch: 'x64' },
    entrypoint:         'bin/rhks.js',
    protocols:          { execution: '1.0.0', agent: '1.0.0', control: '1.0.0' },
    integrity:          { algorithm: 'sha256', artifactHash },
    config:             { schemaVersion: '1', defaultFile: 'rohinik.yaml' },
    minimumRequirements: { node: '>=22.0.0' },
    cliCompatibility:   { minCliVersion: '0.1.0' },
    installedAt:        new Date().toISOString(),
    includedPackages:   [],
    ...overrides,
  }
  const mPath = join(dir, 'manifest.json')
  writeFileSync(mPath, JSON.stringify(manifest))
  return mPath
}

// ── install() ─────────────────────────────────────────────────────────────────

describe('install', () => {
  let home: string
  let workDir: string

  beforeEach(() => {
    home    = tmpHome()
    workDir = mkdtempSync(join(tmpdir(), 'rhk-work-'))
  })
  afterEach(() => {
    rmSync(home,    { recursive: true, force: true })
    rmSync(workDir, { recursive: true, force: true })
  })

  it('installs a valid bundle and sets active version', async () => {
    const { bundleDir, artifactHash } = makeBundle(workDir)
    const mPath = makeManifest(workDir, artifactHash)
    const result = await install({
      home:         home,
      artifactPath: join(workDir, 'artifact.bin'),
      bundlePath:   bundleDir,
      manifestPath: mPath,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimeVersion).toBe('0.16.0-beta.1')
    const h = resolveHome(home)
    expect(readActiveVersion(h.state)).toBe('0.16.0-beta.1')
    expect(existsSync(join(h.runtimes, '0.16.0-beta.1', 'manifest.json' as string))).toBe(false) // manifest is in runtimes/<ver>/rohinik-manifest.json
  })

  it('manifest is readable after install', async () => {
    const { artifactHash } = makeBundle(workDir)
    const mPath = makeManifest(workDir, artifactHash)
    await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })
    const h = resolveHome(home)
    const m = readActiveManifest(h)
    expect(m).not.toBeNull()
    expect(m?.runtimeVersion).toBe('0.16.0-beta.1')
    expect(m?.protocols.execution).toBe('1.0.0')
  })

  it('rejects corrupted artifact (wrong hash)', async () => {
    makeBundle(workDir)
    const mPath = makeManifest(workDir, 'a'.repeat(64))  // wrong hash
    writeFileSync(join(workDir, 'artifact.bin'), 'corrupted-content')
    const result = await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Integrity check failed/)
  })

  it('rejects malformed manifest JSON', async () => {
    writeFileSync(join(workDir, 'artifact.bin'), 'x')
    writeFileSync(join(workDir, 'bad-manifest.json'), 'not json {{{')
    const result = await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: join(workDir, 'bad-manifest.json') })
    expect(result.ok).toBe(false)
  })

  it('rejects manifest with wrong schemaVersion', async () => {
    const { artifactHash } = makeBundle(workDir)
    writeFileSync(join(workDir, 'artifact.bin'), 'stub-bundle-content')
    const mPath = makeManifest(workDir, artifactHash, { schemaVersion: '99' })
    const result = await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Invalid manifest/)
  })

  it('rejects incompatible CLI version', async () => {
    const { artifactHash } = makeBundle(workDir)
    writeFileSync(join(workDir, 'artifact.bin'), 'stub-bundle-content')
    const mPath = makeManifest(workDir, artifactHash, { cliCompatibility: { minCliVersion: '999.0.0' } })
    const result = await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/too old/)
  })

  it('does not touch existing active version on failed install', async () => {
    // Install a good version first
    const { artifactHash } = makeBundle(workDir)
    const mPath = makeManifest(workDir, artifactHash)
    await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })

    // Now try a corrupt install
    const work2 = mkdtempSync(join(tmpdir(), 'rhk-bad-'))
    try {
      writeFileSync(join(work2, 'artifact.bin'), 'bad')
      const badManifest = makeManifest(work2, 'a'.repeat(64), { runtimeVersion: '0.99.0-bad' })
      await install({ home, artifactPath: join(work2, 'artifact.bin'), bundlePath: work2, manifestPath: badManifest })
    } finally {
      rmSync(work2, { recursive: true, force: true })
    }

    const h = resolveHome(home)
    expect(readActiveVersion(h.state)).toBe('0.16.0-beta.1')
  })
})

// ── listInstalledVersions() ───────────────────────────────────────────────────

describe('listInstalledVersions', () => {
  it('returns empty list when no runtimes dir', () => {
    expect(listInstalledVersions('/nonexistent/runtimes')).toEqual([])
  })

  it('returns installed version directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rhk-list-'))
    try {
      mkdirSync(join(dir, '0.16.0-beta.1'))
      mkdirSync(join(dir, '0.15.0'))
      const result = listInstalledVersions(dir)
      expect(result).toContain('0.16.0-beta.1')
      expect(result).toContain('0.15.0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── Process record ────────────────────────────────────────────────────────────

describe('process record', () => {
  let stateDir: string
  beforeEach(() => { stateDir = mkdtempSync(join(tmpdir(), 'rhk-state-')) })
  afterEach(() => { rmSync(stateDir, { recursive: true, force: true }) })

  it('write/read/remove round-trips', () => {
    const rec = { runtimeVersion: '0.16.0', pid: 9999, startedAt: new Date().toISOString(), configPath: '/cfg', endpoint: 'http://127.0.0.1:8080' }
    writeProcessRecord(stateDir, rec)
    const read = readProcessRecord(stateDir)
    expect(read).toMatchObject(rec)
    removeProcessRecord(stateDir)
    expect(readProcessRecord(stateDir)).toBeNull()
  })

  it('returns null when no record', () => {
    expect(readProcessRecord(stateDir)).toBeNull()
  })
})

// ── isPidAlive ────────────────────────────────────────────────────────────────

describe('isPidAlive', () => {
  it('returns true for current process', () => {
    expect(isPidAlive(process.pid)).toBe(true)
  })

  it('returns false for dead PID', () => {
    expect(isPidAlive(99999999)).toBe(false)
  })
})

// ── status() — no process record ──────────────────────────────────────────────

describe('status with no process record', () => {
  it('returns STOPPED when no record', async () => {
    const home = tmpHome()
    try {
      const result = await status({ home })
      expect(result.status).toBe('STOPPED')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('returns STALE_PROCESS_RECORD for dead PID', async () => {
    const home = tmpHome()
    try {
      const h = resolveHome(home)
      mkdirSync(h.state, { recursive: true })
      writeProcessRecord(h.state, {
        runtimeVersion: '0.16.0', pid: 99999999, startedAt: new Date().toISOString(),
        configPath: '/cfg', endpoint: 'http://127.0.0.1:8080',
      })
      const result = await status({ home })
      expect(result.status).toBe('STALE_PROCESS_RECORD')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

// ── stop() ────────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('returns error when no process record', async () => {
    const home = tmpHome()
    try {
      const result = await stop({ home })
      expect(result.ok).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('removes stale record and returns error for dead PID', async () => {
    const home = tmpHome()
    try {
      const h = resolveHome(home)
      mkdirSync(h.state, { recursive: true })
      writeProcessRecord(h.state, {
        runtimeVersion: '0.16.0', pid: 99999999, startedAt: new Date().toISOString(),
        configPath: '/cfg', endpoint: 'http://127.0.0.1:8080',
      })
      const result = await stop({ home })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/stale/)
      // Record should be gone
      expect(readProcessRecord(h.state)).toBeNull()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

// ── version() ─────────────────────────────────────────────────────────────────

describe('version', () => {
  it('returns CLI_VERSION and null runtime when nothing installed', () => {
    const home = tmpHome()
    try {
      const info = version({ home })
      expect(info.cli).toBe(CLI_VERSION)
      expect(info.runtime).toBeNull()
      expect(info.protocols.execution).toBeNull()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('returns runtime version after install', async () => {
    const home    = tmpHome()
    const workDir = mkdtempSync(join(tmpdir(), 'rhk-ver-work-'))
    try {
      const { artifactHash } = makeBundle(workDir)
      const mPath = makeManifest(workDir, artifactHash)
      await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })
      const info = version({ home })
      expect(info.runtime).toBe('0.16.0-beta.1')
      expect(info.protocols.execution).toBe('1.0.0')
      expect(info.protocols.agent).toBe('1.0.0')
      expect(info.protocols.control).toBe('1.0.0')
    } finally {
      rmSync(home,    { recursive: true, force: true })
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  it('formatVersionInfo includes all layers', async () => {
    const home    = tmpHome()
    const workDir = mkdtempSync(join(tmpdir(), 'rhk-fmt-work-'))
    try {
      const { artifactHash } = makeBundle(workDir)
      const mPath = makeManifest(workDir, artifactHash)
      await install({ home, artifactPath: join(workDir, 'artifact.bin'), bundlePath: workDir, manifestPath: mPath })
      const info = version({ home })
      const text = formatVersionInfo(info)
      expect(text).toContain('Rohinik CLI:')
      expect(text).toContain('Rohinik Runtime:')
      expect(text).toContain('execution: 1.0.0')
      expect(text).toContain('agent:     1.0.0')
      expect(text).toContain('control:   1.0.0')
    } finally {
      rmSync(home,    { recursive: true, force: true })
      rmSync(workDir, { recursive: true, force: true })
    }
  })
})

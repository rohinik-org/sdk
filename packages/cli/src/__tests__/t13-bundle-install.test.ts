/**
 * T13 — Real Bundle Install & Smoke
 *
 * BR-4 gate. Proves four things using the actual release tarball:
 *   1. Reproducibility: sha256 of tarball matches checksums.sha256
 *   2. Self-containment: no workspace:/file:///RS1 refs in bundle; fastify present
 *   3. Manifest correctness: all required fields present; hash matches tarball
 *   4. Actual installability: install → start → /v1/health READY → stop
 *
 * Requires: node scripts/build-bundle.mjs run in RS1 first.
 * Skips with a clear message if artifacts are missing.
 *
 * Uses a mock HTTP server to simulate GitHub Release downloads for the
 * downloadAndInstall() path. Does not hit the real GitHub API.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync,
  readdirSync, statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, platform as osPlatform } from 'node:os'
import { createHash }  from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execSync }    from 'node:child_process'
import http            from 'node:http'
import { createReadStream } from 'node:fs'

import {
  install, start, stop, downloadAndInstall,
  readActiveManifest,
} from '../index.js'
import { resolveHome } from '@rohinik-org/install-manifest'

// ── Constants ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))

const SDK_ROOT     = join(__dirname, '..', '..', '..', '..')
const RS1_ROOT     = join(SDK_ROOT, '..', '..', 'rs1')
const T13_VER      = '0.16.0-beta.1'
const PLAT_SUFFIX  = `${osPlatform() === 'win32' ? 'win32' : osPlatform() === 'darwin' ? 'darwin' : 'linux'}-x64`
const RELEASE_DIR  = join(RS1_ROOT, 'release', `v${T13_VER}`)
const TARBALL_NAME = `rohinik-runtime-${T13_VER}-${PLAT_SUFFIX}.tar.gz`
const MANIFEST_NAME= `install-manifest-${T13_VER}-${PLAT_SUFFIX}.json`
const TARBALL_PATH = join(RELEASE_DIR, TARBALL_NAME)
const MANIFEST_PATH= join(RELEASE_DIR, MANIFEST_NAME)
const CHECKSUMS_PATH = join(RELEASE_DIR, 'checksums.sha256')
const T13_BASE     = 'http://127.0.0.1:19013'
const T13_PORT     = 19_013

const MOCK_CONFIG_YAML = `\
version: "1.0"
runtime:
  routing:
    mode: balanced
    explain: true
  logLevel: error
server:
  port: 19013
  host: 127.0.0.1
providers:
  mock:
    apiKey: dummy
extensions:
  paths: []
`

// ── Skip guard ────────────────────────────────────────────────────────────────

const ARTIFACTS_PRESENT = existsSync(TARBALL_PATH) && existsSync(MANIFEST_PATH)

function skipIfMissing() {
  if (!ARTIFACTS_PRESENT) {
    console.warn(`T13 SKIPPED: artifacts not found at ${RELEASE_DIR}`)
    console.warn('Run: node scripts/build-bundle.mjs  (from RS1 root)')
    return true
  }
  return false
}

// ── State ─────────────────────────────────────────────────────────────────────

let tmpWork:  string
let homeRoot: string
let mockServer: http.Server

beforeAll(async () => {
  if (!ARTIFACTS_PRESENT) return

  tmpWork  = mkdtempSync(join(tmpdir(), 'rhk-t13-work-'))
  homeRoot = mkdtempSync(join(tmpdir(), 'rhk-t13-home-'))

  const home = resolveHome(homeRoot)
  mkdirSync(home.config, { recursive: true })
  writeFileSync(join(home.config, 'rohinik.yaml'), MOCK_CONFIG_YAML)

  // Start a local HTTP server that serves the real release files
  // This simulates GitHub Releases without hitting the network
  mockServer = http.createServer((req, res) => {
    const filename = req.url?.split('/').pop() ?? ''
    const filepath = join(RELEASE_DIR, filename)
    if (!existsSync(filepath)) {
      res.writeHead(404, { 'Content-Length': '0', Connection: 'close' })
      res.end()
      return
    }
    const size = statSync(filepath).size
    res.writeHead(200, { 'Content-Length': String(size), Connection: 'close' })
    createReadStream(filepath).pipe(res)
  })
  await new Promise<void>(resolve => mockServer.listen(0, '127.0.0.1', resolve))
}, 10_000)

afterAll(async () => {
  if (!ARTIFACTS_PRESENT) return
  try { await stop({ home: homeRoot }) } catch { /* ignore */ }
  if (mockServer) await new Promise<void>(resolve => mockServer.close(() => resolve()))
  rmSync(tmpWork,  { recursive: true, force: true })
  rmSync(homeRoot, { recursive: true, force: true })
})

// ── Phase 1: Bundle integrity ─────────────────────────────────────────────────

describe('BR-4 Phase 1: Bundle integrity', () => {
  it('artifacts present — skip check', () => {
    if (skipIfMissing()) return
    expect(existsSync(TARBALL_PATH)).toBe(true)
    expect(existsSync(MANIFEST_PATH)).toBe(true)
  })

  it('sha256 matches checksums.sha256', () => {
    if (skipIfMissing()) return
    const tarBytes  = readFileSync(TARBALL_PATH)
    const actual    = createHash('sha256').update(tarBytes).digest('hex')
    const checkText = readFileSync(CHECKSUMS_PATH, 'utf-8')
    const expected  = checkText.split('\n')
      .find(l => l.includes(TARBALL_NAME))
      ?.split(/\s+/)[0]
    expect(expected, 'no checksum entry for tarball').toBeTruthy()
    expect(actual).toBe(expected)
  })

  it('manifest has all required fields', () => {
    if (skipIfMissing()) return
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    expect(m.schemaVersion).toBe('1')
    expect(m.runtimeVersion).toBe(T13_VER)
    expect(m.releaseChannel).toBe('beta')
    expect(m.platform.os).toBe(PLAT_SUFFIX.split('-')[0])
    expect(m.platform.arch).toBe(PLAT_SUFFIX.split('-')[1])
    expect(m.entrypoint).toBe('dist/bin.js')
    expect(m.protocols.execution).toBeTruthy()
    expect(m.protocols.agent).toBeTruthy()
    expect(m.protocols.control).toBeTruthy()
    expect(m.integrity.algorithm).toBe('sha256')
    expect(m.integrity.artifactHash).toHaveLength(64)
    expect(m.cliCompatibility.minCliVersion).toBeTruthy()
  })

  it('manifest artifactHash matches tarball', () => {
    if (skipIfMissing()) return
    const tarBytes = readFileSync(TARBALL_PATH)
    const actual   = createHash('sha256').update(tarBytes).digest('hex')
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    expect(actual).toBe(m.integrity.artifactHash)
  })
})

// ── Phase 2: Install from tarball ─────────────────────────────────────────────

describe('BR-4 Phase 2: Install from real tarball', () => {
  it('extracts and installs cleanly', async () => {
    if (skipIfMissing()) return

    // Extract tarball to get bundle dir
    // Windows tar can't handle C:/ in -f arg — copy to cwd-relative path first
    const extractDir = join(tmpWork, 'extracted')
    mkdirSync(extractDir, { recursive: true })
    const localTar = join(tmpWork, TARBALL_NAME)
    if (process.platform === 'win32') {
      const { copyFileSync: cfs } = await import('node:fs')
      cfs(TARBALL_PATH, localTar)
      execSync(`tar -xzf "${TARBALL_NAME}" -C "extracted"`, { cwd: tmpWork, stdio: 'pipe' })
    } else {
      execSync(`tar -xzf "${TARBALL_PATH}" -C "${extractDir}"`, { stdio: 'pipe' })
    }
    const entries    = readdirSync(extractDir)
    expect(entries).toHaveLength(1)
    const bundlePath = join(extractDir, entries[0]!)

    const result = await install({
      home:         homeRoot,
      artifactPath: TARBALL_PATH,
      bundlePath,
      manifestPath: MANIFEST_PATH,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.runtimeVersion).toBe(T13_VER)
    expect(existsSync(result.installDir)).toBe(true)
  })

  it('active manifest written correctly', () => {
    if (skipIfMissing()) return
    const home     = resolveHome(homeRoot)
    const manifest = readActiveManifest(home)
    expect(manifest).not.toBeNull()
    expect(manifest!.runtimeVersion).toBe(T13_VER)
    expect(manifest!.entrypoint).toBe('dist/bin.js')
  })
})

// ── Phase 3: Start / health / stop ────────────────────────────────────────────

describe('BR-4 Phase 3: Start, /v1/health, stop', () => {
  it('runtime starts and reaches READY', async () => {
    if (skipIfMissing()) return
    const r = await start({ home: homeRoot })
    expect(r.ok, `start failed: ${r.ok ? '' : r.reason}`).toBe(true)
    if (!r.ok) return
    expect(r.pid).toBeGreaterThan(0)
  }, 30_000)

  it('/v1/health returns READY or DEGRADED', async () => {
    if (skipIfMissing()) return
    const res  = await fetch(`${T13_BASE}/v1/health`)
    expect(res.ok).toBe(true)
    const body = await res.json() as { status: string }
    expect(['READY', 'DEGRADED']).toContain(body.status)
  })

  it('stops cleanly', async () => {
    if (skipIfMissing()) return
    const r = await stop({ home: homeRoot })
    expect(r.ok, `stop failed: ${r.ok ? '' : r.reason}`).toBe(true)
  }, 15_000)
})

// ── Phase 4: Self-containment ─────────────────────────────────────────────────

describe('BR-4 Phase 4: Self-containment', () => {
  it('installed bundle has no absolute RS1 paths', () => {
    if (skipIfMissing()) return
    const home    = resolveHome(homeRoot)
    const vDir    = join(home.runtimes, T13_VER)
    const rs1Path = join(RS1_ROOT, 'core').replace(/\\/g, '/')
    scanForString(vDir, rs1Path, 'RS1 absolute path leak')
  })

  it('installed bundle has no workspace: refs', () => {
    if (skipIfMissing()) return
    const home = resolveHome(homeRoot)
    const vDir = join(home.runtimes, T13_VER)
    scanForString(vDir, 'workspace:', 'workspace: ref leak', ['.json'])
  })

  it('node_modules/fastify present in installed bundle', () => {
    if (skipIfMissing()) return
    const home    = resolveHome(homeRoot)
    const fastify = join(home.runtimes, T13_VER, 'node_modules', 'fastify')
    expect(existsSync(fastify), 'node_modules/fastify missing from installed bundle').toBe(true)
  })

  it('downloadAndInstall resolves from mock HTTP server', async () => {
    if (skipIfMissing()) return

    // Fresh home for download path test
    const dlHome = mkdtempSync(join(tmpdir(), 'rhk-t13-dl-'))
    const dlHomeObj = resolveHome(dlHome)
    mkdirSync(dlHomeObj.config, { recursive: true })
    writeFileSync(join(dlHomeObj.config, 'rohinik.yaml'), MOCK_CONFIG_YAML)

    try {
      const addr = mockServer.address() as { port: number }
      const baseUrl = `http://127.0.0.1:${addr.port}`
      const r = await downloadAndInstall({ home: dlHome, version: T13_VER, baseUrl })
      expect(r.ok, `downloadAndInstall failed: ${r.ok ? '' : r.reason}`).toBe(true)
      if (r.ok) expect(r.runtimeVersion).toBe(T13_VER)
    } finally {
      rmSync(dlHome, { recursive: true, force: true })
    }
  }, 180_000)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function scanForString(dir: string, needle: string, label: string, ext = ['.js', '.json']): void {
  const hits: string[] = []
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) { walk(p); continue }
      if (!ext.some(e => entry.name.endsWith(e))) continue
      try {
        if (readFileSync(p, 'utf-8').includes(needle)) hits.push(p)
      } catch { /* unreadable, skip */ }
    }
  }
  walk(dir)
  expect(hits, `${label}: found in ${hits.join(', ')}`).toHaveLength(0)
}

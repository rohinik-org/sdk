/**
 * T14 — Release Signing & Provenance Verification (BR-5 gate)
 *
 * Phase 1: provenance document structure
 * Phase 2: Ed25519 signature verification (pass + tamper + unknown key)
 * Phase 3: CLI policy enforcement unit tests (no process spawn)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, platform as osPlatform } from 'node:os'
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'

import { install } from '../commands/install.js'
import { TRUSTED_KEYS } from '../trusted-keys.js'

// ── Constants ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const SDK_ROOT    = join(__dirname, '..', '..', '..', '..')
const RS1_ROOT    = join(SDK_ROOT, '..', '..', 'rs1')
const T14_VER     = '0.16.0-beta.1'
const PLAT_SUFFIX = `${osPlatform() === 'win32' ? 'win32' : osPlatform() === 'darwin' ? 'darwin' : 'linux'}-x64`
const RELEASE_DIR = join(RS1_ROOT, 'release', `v${T14_VER}`)

const TARBALL_PATH    = join(RELEASE_DIR, `rohinik-runtime-${T14_VER}-${PLAT_SUFFIX}.tar.gz`)
const MANIFEST_PATH   = join(RELEASE_DIR, `install-manifest-${T14_VER}-${PLAT_SUFFIX}.json`)
const PROVENANCE_PATH = join(RELEASE_DIR, `release-provenance-${T14_VER}.json`)

const ARTIFACTS_PRESENT = existsSync(TARBALL_PATH) && existsSync(MANIFEST_PATH) && existsSync(PROVENANCE_PATH)

function skipIfMissing() {
  if (!ARTIFACTS_PRESENT) {
    console.warn(`T14 SKIPPED: artifacts not found at ${RELEASE_DIR}`)
    return true
  }
  return false
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function canonicalJson(obj: unknown): string {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']'
  if (obj !== null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}'
  }
  return JSON.stringify(obj)
}

// ── Phase 1: Provenance document structure ────────────────────────────────────

describe('BR-5 Phase 1: Provenance document structure', () => {
  it('provenance file present', () => {
    if (skipIfMissing()) return
    expect(existsSync(PROVENANCE_PATH)).toBe(true)
  })

  it('all required top-level fields present', () => {
    if (skipIfMissing()) return
    const doc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    expect(doc.schemaVersion).toBe('1')
    expect(typeof doc.buildTimestamp).toBe('string')
    expect(doc.release).toBeTruthy()
    expect(doc.toolchain).toBeTruthy()
    expect(Array.isArray(doc.artifacts)).toBe(true)
    expect(Array.isArray(doc.npmPackages)).toBe(true)
    expect(doc.signingPolicy).toBeTruthy()
    expect(doc.signature).toBeTruthy()
  })

  it('release fields populated', () => {
    if (skipIfMissing()) return
    const doc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    expect(doc.release.version).toBe(T14_VER)
    expect(doc.release.gitTag).toBe(`v${T14_VER}`)
    expect(/^[0-9a-f]{40}$/.test(doc.release.sourceCommit)).toBe(true)
    expect(typeof doc.release.sourceRepo).toBe('string')
  })

  it('artifacts array contains tarball and manifest entries', () => {
    if (skipIfMissing()) return
    const doc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    const tarEntry = doc.artifacts.find((a: { name: string }) =>
      a.name.startsWith('rohinik-runtime-') && a.name.endsWith('.tar.gz'))
    const mfEntry  = doc.artifacts.find((a: { name: string }) =>
      a.name.startsWith('install-manifest-') && a.name.endsWith('.json'))
    expect(tarEntry, 'tarball artifact entry missing').toBeTruthy()
    expect(mfEntry,  'manifest artifact entry missing').toBeTruthy()
    expect(tarEntry.algorithm).toBe('sha256')
    expect(/^[0-9a-f]{64}$/.test(tarEntry.hash)).toBe(true)
  })

  it('tarball hash in provenance matches actual tarball', () => {
    if (skipIfMissing()) return
    const doc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    const tarEntry = doc.artifacts.find((a: { name: string }) => a.name.endsWith('.tar.gz'))
    const actual   = createHash('sha256').update(readFileSync(TARBALL_PATH)).digest('hex')
    expect(actual).toBe(tarEntry.hash)
  })

  it('npmPackages covers all 8 expected packages', () => {
    if (skipIfMissing()) return
    const doc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    const names: string[] = doc.npmPackages.map((p: { name: string }) => p.name)
    const expected = [
      '@rohinik-org/cli', '@rohinik-org/client', '@rohinik-org/capability-sdk',
      '@rohinik-org/agent-sdk', '@rohinik-org/provider-sdk', '@rohinik-org/package-sdk',
      '@rohinik-org/testing', '@rohinik-org/install-manifest',
    ]
    for (const pkg of expected) {
      expect(names, `missing npm package: ${pkg}`).toContain(pkg)
    }
  })

  it('signature.keyId matches a key in TRUSTED_KEYS', () => {
    if (skipIfMissing()) return
    const doc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    expect(TRUSTED_KEYS[doc.signature.keyId], `unknown keyId: ${doc.signature.keyId}`).toBeTruthy()
  })
})

// ── Phase 2: Signature verification ──────────────────────────────────────────

describe('BR-5 Phase 2: Ed25519 signature verification', () => {
  it('valid signature verifies against committed public key', () => {
    if (skipIfMissing()) return
    const provBytes = readFileSync(PROVENANCE_PATH)
    const doc = JSON.parse(provBytes.toString('utf-8'))
    const sig = doc.signature
    const pubPem = TRUSTED_KEYS[sig.keyId]
    expect(pubPem, `no trusted key for keyId ${sig.keyId}`).toBeTruthy()

    const signable = { ...doc, signature: { ...sig, value: null } }
    const payload  = Buffer.from(canonicalJson(signable))
    const sigBuf   = Buffer.from(sig.value, 'base64')
    const pubKey   = createPublicKey(pubPem)
    expect(cryptoVerify(null, payload, pubKey, sigBuf)).toBe(true)
  })

  it('tampered provenance bytes fail verification', () => {
    if (skipIfMissing()) return
    const provBytes = readFileSync(PROVENANCE_PATH)
    const doc = JSON.parse(provBytes.toString('utf-8'))
    const sig = doc.signature
    const pubPem = TRUSTED_KEYS[sig.keyId]

    // Flip one character in sourceCommit
    const tampered = {
      ...doc,
      release: { ...doc.release, sourceCommit: doc.release.sourceCommit.replace('a', 'b') },
    }
    const signable = { ...tampered, signature: { ...sig, value: null } }
    const payload  = Buffer.from(canonicalJson(signable))
    const sigBuf   = Buffer.from(sig.value, 'base64')
    const pubKey   = createPublicKey(pubPem)
    expect(cryptoVerify(null, payload, pubKey, sigBuf)).toBe(false)
  })

  it('unknown keyId causes TRUSTED_KEYS lookup to return undefined', () => {
    if (skipIfMissing()) return
    expect(TRUSTED_KEYS['0000000000000000']).toBeUndefined()
  })
})

// ── Phase 3: CLI policy enforcement (unit tests) ──────────────────────────────

describe('BR-5 Phase 3: CLI policy enforcement', () => {
  let tmpDir: string
  let bundleDir: string

  beforeAll(() => {
    if (!ARTIFACTS_PRESENT) return
    tmpDir    = mkdtempSync(join(tmpdir(), 'rhk-t14-'))
    bundleDir = join(tmpDir, 'bundle')
    mkdirSync(bundleDir)
    // minimal bundle: just entrypoint stub
    writeFileSync(join(bundleDir, 'dist'), '')
  })

  it('required policy + provenance doc missing → InstallError', async () => {
    if (skipIfMissing()) return

    // Manifest with required policy but provenance pointing to non-existent file
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    const missingMfPath = join(tmpDir, 'manifest-missing-prov.json')
    writeFileSync(missingMfPath, JSON.stringify({
      ...manifest,
      signingPolicy: 'required',
      provenance: { ...manifest.provenance, provenanceHash: manifest.provenance.provenanceHash },
    }))

    // Use a temp dir that has no provenance file
    const emptyDir = join(tmpDir, 'empty')
    mkdirSync(emptyDir, { recursive: true })
    const noProvManifestPath = join(emptyDir, 'install-manifest.json')
    writeFileSync(noProvManifestPath, readFileSync(missingMfPath))

    const homeDir = join(tmpDir, 'home-missing-prov')
    const r = await install({
      home:         homeDir,
      artifactPath: TARBALL_PATH,
      bundlePath:   bundleDir,
      manifestPath: noProvManifestPath,
      // no provenanceBaseUrl → will look locally in emptyDir for provenance file
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Provenance verification failed')
  })

  it('required policy + invalid signature → InstallError', async () => {
    if (skipIfMissing()) return

    // Write a provenance file with a bad signature
    const provDoc = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf-8'))
    const badProvDoc = { ...provDoc, signature: { ...provDoc.signature, value: 'AAAA' } }
    const badProvPath = join(tmpDir, `release-provenance-${T14_VER}.json`)
    writeFileSync(badProvPath, JSON.stringify(badProvDoc))

    // Write a manifest that references the bad provenance hash
    const badProvHash = createHash('sha256').update(readFileSync(badProvPath)).digest('hex')
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    const badMfPath = join(tmpDir, 'manifest-bad-sig.json')
    writeFileSync(badMfPath, JSON.stringify({
      ...manifest,
      signingPolicy: 'required',
      provenance: { ...manifest.provenance, provenanceHash: badProvHash },
    }))

    const homeDir = join(tmpDir, 'home-bad-sig')
    const r = await install({
      home:         homeDir,
      artifactPath: TARBALL_PATH,
      bundlePath:   bundleDir,
      manifestPath: badMfPath,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Provenance verification failed')
  })

  it('warn policy + provenance missing → InstallResult (ok: true)', async () => {
    if (skipIfMissing()) return

    // Manifest with warn policy, provenance pointing to non-existent file
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    const warnDir = join(tmpDir, 'warn-empty')
    mkdirSync(warnDir, { recursive: true })
    const warnMfPath = join(warnDir, 'install-manifest.json')
    writeFileSync(warnMfPath, JSON.stringify({
      ...manifest,
      signingPolicy: 'warn',
    }))

    const homeDir = join(tmpDir, 'home-warn')
    const r = await install({
      home:         homeDir,
      artifactPath: TARBALL_PATH,
      bundlePath:   bundleDir,
      manifestPath: warnMfPath,
    })
    // warn policy: install succeeds despite missing provenance
    expect(r.ok).toBe(true)
  })

  it('absent signingPolicy → InstallResult (ok: true, backwards compat)', async () => {
    if (skipIfMissing()) return

    // Manifest without signingPolicy field (pre-BR-5 artifact)
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
    const noSignDir = join(tmpDir, 'no-sign')
    mkdirSync(noSignDir, { recursive: true })
    const noSignMfPath = join(noSignDir, 'install-manifest.json')
    const { signingPolicy: _sp, provenance: _prov, ...noSignManifest } = manifest
    writeFileSync(noSignMfPath, JSON.stringify(noSignManifest))

    const homeDir = join(tmpDir, 'home-nosign')
    const r = await install({
      home:         homeDir,
      artifactPath: TARBALL_PATH,
      bundlePath:   bundleDir,
      manifestPath: noSignMfPath,
    })
    expect(r.ok).toBe(true)
  })
})

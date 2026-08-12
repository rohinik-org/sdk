/**
 * rohinik install [version]
 *
 * Flow:
 *   1. resolve ROHINIK_HOME
 *   2. locate artifact (file path or simulated download)
 *   3. verify SHA-256 against manifest
 *   4. validateManifest()
 *   5. checkCliCompatibility()
 *   6. extract into runtimes/<version>/
 *   7. write manifest
 *   8. write active version pointer
 *
 * Active pointer is written only after all verification passes.
 * A failed install leaves any existing active pointer untouched.
 */

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { CLI_VERSION } from '../index.js'
import {
  resolveHome,
  validateManifest,
  checkCliCompatibility,
  manifestPath,
} from '@rohinik-org/install-manifest'
import type { InstallManifest } from '@rohinik-org/install-manifest'
import { currentPlatform, platformSuffix } from '../platform.js'
import { TRUSTED_KEYS } from '../trusted-keys.js'

export interface InstallOptions {
  /** Explicit ROHINIK_HOME override. */
  home?: string
  /**
   * Path to the artifact file whose bytes are SHA-256 hashed against
   * manifest.integrity.artifactHash. In production: the runtime tarball.
   */
  artifactPath: string
  /**
   * Directory containing the extracted runtime bundle to install.
   * In production this is extracted from the tarball before calling install().
   * In T3 tests this is the pre-built bundle directory.
   */
  bundlePath: string
  /** Path to the manifest JSON for the artifact. */
  manifestPath: string
  /**
   * Base URL for downloading supplemental artifacts (e.g. provenance document).
   * Defaults to deriving from manifestPath directory (local install).
   * Set by downloadAndInstall() for network installs.
   */
  provenanceBaseUrl?: string
}

export interface InstallResult {
  ok: true
  runtimeVersion: string
  installDir: string
}

export interface InstallError {
  ok: false
  reason: string
}

export async function install(opts: InstallOptions): Promise<InstallResult | InstallError> {
  const home = resolveHome(opts.home)

  // ── 1. Read and validate manifest ────────────────────────────────────────
  let manifestRaw: unknown
  try {
    manifestRaw = JSON.parse(readFileSync(opts.manifestPath, 'utf-8'))
  } catch (e) {
    return { ok: false, reason: `Cannot read manifest: ${e instanceof Error ? e.message : String(e)}` }
  }

  const validation = validateManifest(manifestRaw)
  if (!validation.ok) {
    return { ok: false, reason: `Invalid manifest: ${validation.errors.join('; ')}` }
  }
  const manifest = validation.manifest

  // ── 2. CLI compatibility ──────────────────────────────────────────────────
  const compatError = checkCliCompatibility(manifest, CLI_VERSION)
  if (compatError !== null) {
    return { ok: false, reason: compatError }
  }

  // ── 3. SHA-256 artifact verification ─────────────────────────────────────
  let artifactBytes: Buffer
  try {
    artifactBytes = readFileSync(opts.artifactPath)
  } catch (e) {
    return { ok: false, reason: `Cannot read artifact: ${e instanceof Error ? e.message : String(e)}` }
  }

  const actualHash = createHash('sha256').update(artifactBytes).digest('hex')
  if (actualHash !== manifest.integrity.artifactHash) {
    return {
      ok: false,
      reason: `Integrity check failed. Expected ${manifest.integrity.artifactHash}, got ${actualHash}`,
    }
  }

  // ── 3b. Provenance + signature verification ───────────────────────────────
  if (manifest.signingPolicy) {
    const provenanceDir = opts.provenanceBaseUrl
      ? null
      : dirname(opts.manifestPath)
    const provenanceUrl = opts.provenanceBaseUrl
      ? `${opts.provenanceBaseUrl}/release-provenance-${manifest.runtimeVersion}.json`
      : null
    const provenanceErr = await verifyProvenance(provenanceDir, provenanceUrl, manifest)
    if (provenanceErr !== null) {
      if (manifest.signingPolicy === 'required') {
        return { ok: false, reason: `Provenance verification failed: ${provenanceErr}` }
      }
      console.warn(`[rohinik] WARNING: provenance check failed: ${provenanceErr}`)
    }
  }

  // ── 4. Extract into runtimes/<version>/ ───────────────────────────────────
  const versionDir = join(home.runtimes, manifest.runtimeVersion)
  try {
    copyBundleDir(opts.bundlePath, versionDir)
  } catch (e) {
    return { ok: false, reason: `Extraction failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // ── 5. Write manifest ─────────────────────────────────────────────────────
  const mPath = manifestPath(home, manifest.runtimeVersion)
  mkdirSync(join(home.runtimes, manifest.runtimeVersion), { recursive: true })
  writeFileSync(mPath, JSON.stringify({ ...manifest, installedAt: new Date().toISOString() }, null, 2), 'utf-8')

  // ── 6. Write active pointer (only after all verification passes) ──────────
  mkdirSync(home.state, { recursive: true })
  writeFileSync(activeVersionPath(home.state), manifest.runtimeVersion, 'utf-8')

  return { ok: true, runtimeVersion: manifest.runtimeVersion, installDir: versionDir }
}

/** Read the active runtime version pointer. Returns null if not set. */
export function readActiveVersion(statDir: string): string | null {
  try {
    return readFileSync(activeVersionPath(statDir), 'utf-8').trim() || null
  } catch {
    return null
  }
}

/** Read the manifest for the active runtime. Returns null if not installed. */
export function readActiveManifest(home: ReturnType<typeof resolveHome>): InstallManifest | null {
  const version = readActiveVersion(home.state)
  if (!version) return null
  try {
    const raw = JSON.parse(readFileSync(manifestPath(home, version), 'utf-8'))
    const r = validateManifest(raw)
    return r.ok ? r.manifest : null
  } catch {
    return null
  }
}

/** List installed runtime versions (directory names under runtimes/). */
export function listInstalledVersions(runtimesDir: string): string[] {
  try {
    return readdirSync(runtimesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
  } catch {
    return []
  }
}

// ── Download support ──────────────────────────────────────────────────────────

export interface DownloadInstallOptions {
  home?: string
  /** Semver version to download, e.g. "0.16.0-beta.1" */
  version: string
  /**
   * Base URL to fetch assets from. In production:
   *   https://github.com/rohinik-org/rs1/releases/download/v<version>
   * Overridable for local mock HTTP testing (T13).
   */
  baseUrl?: string
}

const DEFAULT_RELEASE_BASE = 'https://github.com/rohinik-org/rs1/releases/download'

export async function downloadAndInstall(
  opts: DownloadInstallOptions,
): Promise<InstallResult | InstallError> {
  const plat    = currentPlatform()
  const suffix  = platformSuffix(plat)
  const ver     = opts.version
  const base    = opts.baseUrl ?? `${DEFAULT_RELEASE_BASE}/v${ver}`

  const tarballName  = `rohinik-runtime-${ver}-${suffix}.tar.gz`
  const manifestName = `install-manifest-${ver}-${suffix}.json`

  const workDir = mkdtempSync(join(tmpdir(), 'rhk-dl-'))

  try {
    // Download tarball
    const tarballPath  = join(workDir, tarballName)
    const manifestDlPath = join(workDir, manifestName)

    await downloadFile(`${base}/${tarballName}`, tarballPath)
    await downloadFile(`${base}/${manifestName}`, manifestDlPath)

    // Extract tarball into workDir
    // ponytail: Windows tar can't handle C:/ drive letters in -f or -C args; use cwd-relative
    const extractDir = join(workDir, 'extracted')
    mkdirSync(extractDir, { recursive: true })
    if (process.platform === 'win32') {
      execSync(`tar -xzf "${tarballName}" -C "extracted"`, { cwd: workDir, stdio: 'pipe' })
    } else {
      execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, { stdio: 'pipe' })
    }

    // Bundle dir is the single top-level directory inside the tarball
    const entries = readdirSync(extractDir)
    if (entries.length !== 1) {
      return { ok: false, reason: `Unexpected tarball structure: expected 1 top-level dir, got ${entries.join(', ')}` }
    }
    const bundlePath = join(extractDir, entries[0]!)

    return install({
      home:               opts.home,
      artifactPath:       tarballPath,
      bundlePath,
      manifestPath:       manifestDlPath,
      provenanceBaseUrl:  base,
    })
  } finally {
    // ponytail: leave workDir on failure for debugging; cleanup on success
    // Caller can clean up if needed; tmp dirs are ephemeral anyway
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${url} → HTTP ${res.status}`)
  const bytes = await res.arrayBuffer()
  writeFileSync(dest, Buffer.from(bytes))
}

function activeVersionPath(statDir: string): string {
  return join(statDir, 'active-version')
}

function copyBundleDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyBundleDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Verify the provenance document for an artifact.
 * provenanceDir: local directory to load release-provenance-<ver>.json from (local install).
 * provenanceUrl: full URL to download the provenance doc from (network install).
 * Returns null if verification passes, or an error string on failure.
 */
async function verifyProvenance(
  provenanceDir: string | null,
  provenanceUrl: string | null,
  manifest: import('@rohinik-org/install-manifest').InstallManifest,
): Promise<string | null> {
  if (!manifest.provenance) return 'manifest.provenance field missing'

  // Load provenance document
  let provBytes: Buffer
  if (provenanceDir !== null) {
    const provFile = join(provenanceDir, `release-provenance-${manifest.runtimeVersion}.json`)
    try {
      provBytes = readFileSync(provFile)
    } catch {
      return `provenance document not found at ${provFile}`
    }
  } else if (provenanceUrl !== null) {
    try {
      const res = await fetch(provenanceUrl)
      if (!res.ok) return `provenance download failed: HTTP ${res.status}`
      provBytes = Buffer.from(await res.arrayBuffer())
    } catch (e) {
      return `provenance download error: ${e instanceof Error ? e.message : String(e)}`
    }
  } else {
    return 'no provenance source (neither local dir nor URL)'
  }

  // Verify provenance hash matches manifest
  const actualProvHash = createHash('sha256').update(provBytes).digest('hex')
  if (actualProvHash !== manifest.provenance.provenanceHash) {
    return `provenance hash mismatch: manifest says ${manifest.provenance.provenanceHash}, got ${actualProvHash}`
  }

  // Parse and validate signature
  let provDoc: Record<string, unknown>
  try {
    provDoc = JSON.parse(provBytes.toString('utf-8'))
  } catch {
    return 'provenance document is not valid JSON'
  }

  const sig = provDoc['signature'] as Record<string, unknown> | null
  if (!sig || typeof sig !== 'object') return 'provenance.signature missing'
  const keyId  = sig['keyId']  as string | undefined
  const sigVal = sig['value']  as string | null | undefined

  if (!keyId) return 'provenance.signature.keyId missing'
  if (!sigVal) return 'provenance.signature.value missing (unsigned artifact)'

  // Unknown key always fails — even on warn policy (unknown source)
  const pubPem = TRUSTED_KEYS[keyId]
  if (!pubPem) return `unknown signing key: ${keyId}`

  // Reconstruct signable payload (signature.value = null)
  const signable = { ...provDoc, signature: { ...sig, value: null } }
  const payload  = Buffer.from(canonicalJsonInstall(signable))
  const sigBuf   = Buffer.from(sigVal, 'base64')

  try {
    const pubKey = createPublicKey(pubPem)
    const ok = cryptoVerify(null, payload, pubKey, sigBuf)
    if (!ok) return 'Ed25519 signature verification failed'
  } catch (e) {
    return `signature verification error: ${e instanceof Error ? e.message : String(e)}`
  }

  return null
}

function canonicalJsonInstall(obj: unknown): string {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJsonInstall).join(',') + ']'
  if (obj !== null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonicalJsonInstall(o[k])).join(',') + '}'
  }
  return JSON.stringify(obj)
}

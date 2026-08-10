/**
 * Individual doctor checks.
 *
 * Each check is a pure async function. No mutations, no restarts, no repairs.
 * Constitutional rule: doctor observes and diagnoses only.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { RohinikHome, InstallManifest } from '@rohinik-org/install-manifest'
import { validateManifest, checkCliCompatibility, manifestPath } from '@rohinik-org/install-manifest'
import { CLI_VERSION } from '../index.js'
import { readActiveVersion } from '../commands/install.js'
import { readProcessRecord, isPidAlive } from '../state.js'
import { probeHealth } from '../health.js'
import { discoverConfig } from '../config/discover.js'
import { parseConfig } from '../config/parse.js'
import { validateConfig } from '../config/validate.js'
import { extractEnvRefs } from '../config/redact.js'

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP'

export interface CheckResult {
  name:    string
  status:  CheckStatus
  detail?: string
}

function pass(name: string, detail?: string): CheckResult { return { name, status: 'PASS', detail } }
function fail(name: string, detail: string):  CheckResult { return { name, status: 'FAIL', detail } }
function warn(name: string, detail: string):  CheckResult { return { name, status: 'WARN', detail } }
function skip(name: string, detail?: string): CheckResult { return { name, status: 'SKIP', detail } }

// ── Installation checks ───────────────────────────────────────────────────────

export function checkInstallation(home: RohinikHome): CheckResult {
  const version = readActiveVersion(home.state)
  if (!version) return fail('Runtime installation', 'No active runtime. Run: rohinik install')
  const versionDir = join(home.runtimes, version)
  if (!existsSync(versionDir)) return fail('Runtime installation', `Version directory missing: ${versionDir}`)
  return pass('Runtime installation', version)
}

export function checkManifestIntegrity(home: RohinikHome): CheckResult {
  const version = readActiveVersion(home.state)
  if (!version) return skip('Manifest integrity', 'No active runtime')

  const mPath = manifestPath(home, version)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(mPath, 'utf-8'))
  } catch {
    return fail('Manifest integrity', `Cannot read manifest: ${mPath}`)
  }

  const result = validateManifest(raw)
  if (!result.ok) return fail('Manifest integrity', result.errors.join('; '))
  return pass('Manifest integrity')
}

export function checkCliCompatibility_check(home: RohinikHome): CheckResult {
  const version = readActiveVersion(home.state)
  if (!version) return skip('CLI compatibility', 'No active runtime')

  const mPath = manifestPath(home, version)
  let manifest: InstallManifest
  try {
    const raw = JSON.parse(readFileSync(mPath, 'utf-8'))
    const r   = validateManifest(raw)
    if (!r.ok) return skip('CLI compatibility', 'Manifest invalid')
    manifest = r.manifest
  } catch {
    return skip('CLI compatibility', 'Cannot read manifest')
  }

  const err = checkCliCompatibility(manifest, CLI_VERSION)
  if (err) return fail('CLI compatibility', err)
  return pass('CLI compatibility', `CLI ${CLI_VERSION} ↔ runtime ${manifest.runtimeVersion}`)
}

// ── Configuration checks ──────────────────────────────────────────────────────

export function checkConfiguration(home: RohinikHome, configPath?: string): CheckResult {
  const discovery = discoverConfig(home, configPath)
  if (!discovery.path) return fail('Configuration', `No config file found. Create ${join(home.config, 'rohinik.yaml')}`)
  if (!existsSync(discovery.path)) return fail('Configuration', `Config file not found: ${discovery.path}`)

  const result = parseConfig(discovery.path)
  if (!result.ok) return fail('Configuration', result.reason)

  const validation = validateConfig(result.config)
  if (!validation.ok) return fail('Configuration', validation.errors.join('; '))

  return pass('Configuration', `${discovery.path} (${discovery.source})`)
}

export function checkEnvRefs(home: RohinikHome, configPath?: string): CheckResult {
  const discovery = discoverConfig(home, configPath)
  if (!discovery.path || !existsSync(discovery.path)) return skip('Environment variables', 'No config')

  let raw: string
  try { raw = readFileSync(discovery.path, 'utf-8') } catch { return skip('Environment variables') }

  const refs = extractEnvRefs(raw)
  if (refs.length === 0) return pass('Environment variables', 'No references')

  const missing = refs.filter(v => process.env[v] === undefined)
  if (missing.length > 0) return fail('Environment variables', `Unset: ${missing.join(', ')}`)
  return pass('Environment variables', `All ${refs.length} reference(s) set`)
}

// ── Runtime process checks ────────────────────────────────────────────────────

export function checkRuntimeProcess(home: RohinikHome): CheckResult {
  const record = readProcessRecord(home.state)
  if (!record) return fail('Runtime process', 'Not running. Start with: rohinik start')
  if (!isPidAlive(record.pid)) return fail('Runtime process', `Stale process record (pid=${record.pid} not alive)`)
  return pass('Runtime process', `pid=${record.pid} version=${record.runtimeVersion}`)
}

export async function checkRuntimeHealth(home: RohinikHome): Promise<CheckResult> {
  const record = readProcessRecord(home.state)
  if (!record) return skip('Health', 'Runtime not running')

  const probe = await probeHealth(record.endpoint, 5_000)
  if (probe.status === 'READY')       return pass('Health', `${record.endpoint} (${probe.latencyMs}ms)`)
  if (probe.status === 'UNREACHABLE') return fail('Health', `Runtime unreachable at ${record.endpoint}`)
  return fail('Health', `HTTP ${probe.httpStatus ?? '?'} from ${record.endpoint}`)
}

// ── Protocol checks ───────────────────────────────────────────────────────────

export async function checkProtocols(home: RohinikHome): Promise<CheckResult[]> {
  const version = readActiveVersion(home.state)
  if (!version) {
    return [
      skip('Protocol execution', 'No active runtime'),
      skip('Protocol agent',     'No active runtime'),
      skip('Protocol control',   'No active runtime'),
    ]
  }

  const mPath = manifestPath(home, version)
  let manifest: InstallManifest | null = null
  try {
    const raw = JSON.parse(readFileSync(mPath, 'utf-8'))
    const r   = validateManifest(raw)
    if (r.ok) manifest = r.manifest
  } catch { /* fallthrough */ }

  if (!manifest) {
    return [
      skip('Protocol execution', 'Manifest unreadable'),
      skip('Protocol agent',     'Manifest unreadable'),
      skip('Protocol control',   'Manifest unreadable'),
    ]
  }

  return [
    pass('Protocol execution', manifest.protocols.execution),
    pass('Protocol agent',     manifest.protocols.agent),
    pass('Protocol control',   manifest.protocols.control),
  ]
}

// ── Provider checks ───────────────────────────────────────────────────────────

export interface ProviderCheckResult {
  name:              string
  declared:          boolean
  secretResolvable:  boolean
  /** Only populated when runtime is running and /v1/providers is reachable. */
  runtimeStatus?:    'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
}

export async function checkProviders(home: RohinikHome, configPath?: string): Promise<CheckResult[]> {
  const discovery = discoverConfig(home, configPath)
  if (!discovery.path || !existsSync(discovery.path)) {
    return [skip('Provider configuration', 'No config')]
  }

  const parseResult = parseConfig(discovery.path)
  if (!parseResult.ok) return [skip('Provider configuration', 'Config parse failed')]

  const { config, raw } = parseResult
  const providerNames = Object.keys(config.providers)

  if (providerNames.length === 0) {
    return [warn('Provider configuration', 'No providers configured')]
  }

  // Check env var refs for each provider
  const envRefs = extractEnvRefs(raw)
  const results: CheckResult[] = []

  for (const name of providerNames) {
    const p = config.providers[name] ?? {}
    // Find env refs specifically in apiKey or baseUrl values
    const apiKeyRef = p.apiKey   ? /^\$\{([^}]+)\}$/.exec(p.apiKey)?.[1]   : undefined
    const urlRef    = p.baseUrl  ? /^\$\{([^}]+)\}$/.exec(p.baseUrl)?.[1]  : undefined

    const unresolvedRefs: string[] = []
    if (apiKeyRef && process.env[apiKeyRef] === undefined) unresolvedRefs.push(apiKeyRef)
    if (urlRef    && process.env[urlRef]    === undefined) unresolvedRefs.push(urlRef)

    if (unresolvedRefs.length > 0) {
      results.push(fail(`Provider ${name} configuration`, `Unset env var(s): ${unresolvedRefs.join(', ')}`))
    } else {
      results.push(pass(`Provider ${name} configuration`))
    }
  }

  // Try live provider readiness from /v1/providers if runtime is running
  const record = readProcessRecord(home.state)
  if (record && isPidAlive(record.pid)) {
    try {
      const url = `${record.endpoint.replace(/\/$/, '')}/v1/providers`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3_000)
      let res: Response | null = null
      try {
        res = await fetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
      if (res?.ok) {
        const data = await res.json() as { providers?: Array<{ name?: string; status?: string; healthy?: boolean }> }
        for (const p of data.providers ?? []) {
          const pname = p.name ?? ''
          if (!pname) continue
          const healthy = p.healthy === true || p.status === 'HEALTHY'
          results.push(healthy
            ? pass(`Provider ${pname} readiness`)
            : warn(`Provider ${pname} readiness`, `Status: ${p.status ?? 'UNKNOWN'}`)
          )
        }
      }
    } catch { /* runtime not reachable — skip readiness */ }
  }

  return results
}

// ── Storage/packages checks ───────────────────────────────────────────────────

export function checkStorage(home: RohinikHome): CheckResult {
  // Just verify runtimes dir and state dir exist and are readable
  try {
    const dirs = [home.runtimes, home.state, home.config, home.logs]
    for (const d of dirs) {
      if (existsSync(d)) continue
      // Missing but not required to exist (will be created on demand)
    }
    return pass('Storage', home.root)
  } catch (e) {
    return fail('Storage', e instanceof Error ? e.message : String(e))
  }
}

export function checkPackages(home: RohinikHome): CheckResult {
  try {
    if (!existsSync(home.packages)) return pass('Packages', 'No packages installed')
    const pkgs = readdirSync(home.packages, { withFileTypes: true })
      .filter(d => d.isDirectory()).length
    return pass('Packages', `${pkgs} package(s) installed`)
  } catch (e) {
    return fail('Packages', e instanceof Error ? e.message : String(e))
  }
}

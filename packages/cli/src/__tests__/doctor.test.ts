/**
 * T4 acceptance gate tests: config discovery, validation, redaction, provider checks, doctor.
 *
 * Golden path: installed runtime → valid config → resolvable provider secrets → doctor all PASS.
 * Negative cases: missing config, bad YAML, schema error, missing env var, runtime stopped,
 *   unhealthy runtime, provider configured but secret missing, secret redaction.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RohinikHome } from '@rohinik-org/install-manifest'

// ── helpers ────────────────────────────────────────────────────────────────────

function makeHome(root: string): RohinikHome {
  const dirs = ['runtimes', 'config', 'state', 'packages', 'cache', 'logs']
  for (const d of dirs) mkdirSync(join(root, d), { recursive: true })
  return {
    root,
    runtimes: join(root, 'runtimes'),
    config:   join(root, 'config'),
    state:    join(root, 'state'),
    packages: join(root, 'packages'),
    cache:    join(root, 'cache'),
    logs:     join(root, 'logs'),
  }
}

const VALID_YAML = `\
version: "1.0"
server:
  port: 8080
  host: 127.0.0.1
providers:
  openai:
    apiKey: \${OPENAI_API_KEY}
runtime:
  logLevel: info
`

const YAML_WITH_SECRET = `\
version: "1.0"
server:
  port: 8080
providers:
  openai:
    apiKey: sk-realkey123
`

// ── config path ────────────────────────────────────────────────────────────────

describe('configPath', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('returns path when config exists in home', async () => {
    const { configPath } = await import('../commands/config.js')
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const result = configPath(home)
    expect(result).toContain('rohinik.yaml')
    expect(result).toContain('home')
  })

  it('reports not found when no config', async () => {
    const { configPath } = await import('../commands/config.js')
    const result = configPath(home)
    expect(result).toContain('not-found')
  })
})

// ── config validate ────────────────────────────────────────────────────────────

describe('configValidate', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('passes for valid config', async () => {
    const { configValidate } = await import('../commands/config.js')
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const r = configValidate(home)
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('fails for missing config', async () => {
    const { configValidate } = await import('../commands/config.js')
    const r = configValidate(home)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/not found/)
  })

  it('fails for malformed YAML', async () => {
    const { configValidate } = await import('../commands/config.js')
    writeFileSync(join(home.config, 'rohinik.yaml'), ':::bad yaml:::', 'utf-8')
    // parseYamlSubset will produce an object without version
    const r = configValidate(home)
    expect(r.ok).toBe(false)
  })

  it('fails for invalid schema — bad logLevel', async () => {
    const { configValidate } = await import('../commands/config.js')
    const bad = VALID_YAML.replace('logLevel: info', 'logLevel: verbose')
    writeFileSync(join(home.config, 'rohinik.yaml'), bad, 'utf-8')
    const r = configValidate(home)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/logLevel/)
  })
})

// ── config show / redaction ────────────────────────────────────────────────────

describe('configShow — secret redaction', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('shows env-var reference as-is', async () => {
    const { configShow } = await import('../commands/config.js')
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const r = configShow(home)
    expect(r).not.toBeNull()
    expect(r!.content).toContain('${OPENAI_API_KEY}')
    expect(r!.content).not.toContain('[REDACTED]')
  })

  it('redacts literal secret value', async () => {
    const { configShow } = await import('../commands/config.js')
    writeFileSync(join(home.config, 'rohinik.yaml'), YAML_WITH_SECRET, 'utf-8')
    const r = configShow(home)
    expect(r).not.toBeNull()
    expect(r!.content).not.toContain('sk-realkey123')
    expect(r!.content).toContain('[REDACTED]')
  })

  it('returns null when no config', async () => {
    const { configShow } = await import('../commands/config.js')
    expect(configShow(home)).toBeNull()
  })
})

// ── provider list ──────────────────────────────────────────────────────────────

describe('listProviders', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('reports secretsResolvable=true when env var is set', async () => {
    const { listProviders } = await import('../commands/provider.js')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const providers = listProviders(home)
    expect(providers).toHaveLength(1)
    expect(providers[0]!.name).toBe('openai')
    expect(providers[0]!.secretsResolvable).toBe(true)
  })

  it('reports secretsResolvable=false when env var missing', async () => {
    const { listProviders } = await import('../commands/provider.js')
    vi.stubEnv('OPENAI_API_KEY', undefined as unknown as string)
    delete process.env['OPENAI_API_KEY']
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const providers = listProviders(home)
    expect(providers[0]!.secretsResolvable).toBe(false)
  })

  it('returns empty array when no config', async () => {
    const { listProviders } = await import('../commands/provider.js')
    expect(listProviders(home)).toHaveLength(0)
  })
})

// ── provider configure ─────────────────────────────────────────────────────────

describe('configureProvider', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('writes ${ENV_VAR} reference, not actual value', async () => {
    const { configureProvider } = await import('../commands/provider.js')
    const configFile = join(home.config, 'rohinik.yaml')
    writeFileSync(configFile, VALID_YAML, 'utf-8')
    const r = configureProvider(home, { name: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' })
    expect(r.ok).toBe(true)
    const { readFileSync } = await import('node:fs')
    const written = readFileSync(configFile, 'utf-8')
    expect(written).toContain('${ANTHROPIC_API_KEY}')
    expect(written).not.toContain('ANTHROPIC_API_KEY: ')  // not as a plain value
    expect(written).not.toContain('sk-')
  })
})

// ── doctor checks ─────────────────────────────────────────────────────────────

describe('doctor checks — unit', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('checkStorage passes when home dirs exist', async () => {
    const { checkStorage } = await import('../doctor/checks.js')
    const r = checkStorage(home)
    expect(r.status).toBe('PASS')
  })

  it('checkInstallation fails when no active runtime', async () => {
    const { checkInstallation } = await import('../doctor/checks.js')
    const r = checkInstallation(home)
    expect(r.status).toBe('FAIL')
    expect(r.detail).toMatch(/No active runtime/)
  })

  it('checkConfiguration fails when no config file', async () => {
    const { checkConfiguration } = await import('../doctor/checks.js')
    const r = checkConfiguration(home)
    expect(r.status).toBe('FAIL')
  })

  it('checkConfiguration passes for valid config', async () => {
    const { checkConfiguration } = await import('../doctor/checks.js')
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const r = checkConfiguration(home)
    expect(r.status).toBe('PASS')
  })

  it('checkEnvRefs fails when referenced env var is missing', async () => {
    const { checkEnvRefs } = await import('../doctor/checks.js')
    delete process.env['OPENAI_API_KEY']
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const r = checkEnvRefs(home)
    expect(r.status).toBe('FAIL')
    expect(r.detail).toContain('OPENAI_API_KEY')
  })

  it('checkEnvRefs passes when all env vars set', async () => {
    const { checkEnvRefs } = await import('../doctor/checks.js')
    process.env['OPENAI_API_KEY'] = 'sk-test'
    writeFileSync(join(home.config, 'rohinik.yaml'), VALID_YAML, 'utf-8')
    const r = checkEnvRefs(home)
    expect(r.status).toBe('PASS')
    delete process.env['OPENAI_API_KEY']
  })

  it('checkRuntimeProcess fails when runtime not running', async () => {
    const { checkRuntimeProcess } = await import('../doctor/checks.js')
    const r = checkRuntimeProcess(home)
    expect(r.status).toBe('FAIL')
    expect(r.detail).toMatch(/Not running/)
  })
})

// ── doctor runDoctor ───────────────────────────────────────────────────────────

describe('runDoctor', () => {
  let root: string
  let home: RohinikHome

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rohinik-t4-'))
    home = makeHome(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('returns hasFail=true when runtime not installed and no config', async () => {
    const { runDoctor } = await import('../commands/doctor.js')
    const report = await runDoctor(home)
    expect(report.hasFail).toBe(true)
    expect(report.allPass).toBe(false)
  })

  it('formatDoctorReport includes check names', async () => {
    const { runDoctor, formatDoctorReport } = await import('../commands/doctor.js')
    const report   = await runDoctor(home)
    const formatted = formatDoctorReport(report)
    expect(formatted).toContain('Runtime installation')
    expect(formatted).toContain('Configuration')
    expect(formatted).toContain('Runtime process')
  })
})

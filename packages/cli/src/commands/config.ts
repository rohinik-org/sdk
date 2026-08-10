import { existsSync } from 'node:fs'
import type { RohinikHome } from '@rohinik-org/install-manifest'
import { discoverConfig } from '../config/discover.js'
import { parseConfig } from '../config/parse.js'
import { validateConfig } from '../config/validate.js'
import { redactConfig } from '../config/redact.js'

export function configPath(home: RohinikHome, configArg?: string): string {
  const d = discoverConfig(home, configArg)
  if (!d.path) return `No config file found (source: ${d.source})`
  return `${d.path} (${d.source})`
}

export interface ConfigValidateResult {
  ok:     boolean
  path:   string
  source: string
  errors: string[]
}

export function configValidate(home: RohinikHome, configArg?: string): ConfigValidateResult {
  const d = discoverConfig(home, configArg)
  if (!d.path || !existsSync(d.path)) {
    return { ok: false, path: d.path ?? '', source: d.source, errors: ['Config file not found'] }
  }

  const parsed = parseConfig(d.path)
  if (!parsed.ok) {
    return { ok: false, path: d.path, source: d.source, errors: [parsed.reason] }
  }

  const v = validateConfig(parsed.config)
  return { ok: v.ok, path: d.path, source: d.source, errors: v.errors }
}

export interface ConfigShowResult {
  path:    string
  source:  string
  content: string
}

export function configShow(home: RohinikHome, configArg?: string): ConfigShowResult | null {
  const d = discoverConfig(home, configArg)
  if (!d.path || !existsSync(d.path)) return null

  const parsed = parseConfig(d.path)
  if (!parsed.ok) return null

  return { path: d.path, source: d.source, content: redactConfig(parsed.raw) }
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { RohinikHome } from '@rohinik-org/install-manifest'
import { discoverConfig } from '../config/discover.js'
import { parseConfig } from '../config/parse.js'

export interface ProviderInfo {
  name:       string
  hasApiKey:  boolean
  hasBaseUrl: boolean
  /** true if all env refs for this provider are set */
  secretsResolvable: boolean
}

export function listProviders(home: RohinikHome, configArg?: string): ProviderInfo[] {
  const d = discoverConfig(home, configArg)
  if (!d.path || !existsSync(d.path)) return []

  const parsed = parseConfig(d.path)
  if (!parsed.ok) return []

  return Object.entries(parsed.config.providers).map(([name, p]) => {
    const apiKeyRef = p.apiKey  ? /^\$\{([^}]+)\}$/.exec(p.apiKey)?.[1]  : undefined
    const urlRef    = p.baseUrl ? /^\$\{([^}]+)\}$/.exec(p.baseUrl)?.[1] : undefined

    const secretsResolvable =
      (!apiKeyRef || process.env[apiKeyRef] !== undefined) &&
      (!urlRef    || process.env[urlRef]    !== undefined)

    return {
      name,
      hasApiKey:  !!p.apiKey,
      hasBaseUrl: !!p.baseUrl,
      secretsResolvable,
    }
  })
}

export interface ProviderConfigureOptions {
  name:      string
  apiKeyEnv: string
  baseUrl?:  string
}

export interface ProviderConfigureResult {
  ok:     boolean
  reason?: string
}

/**
 * Writes ${ENV_VAR} references into the config file — never writes actual secrets.
 * Upserts the provider block in the YAML. Writes config to ROHINIK_HOME/config/rohinik.yaml
 * if no config exists yet.
 */
export function configureProvider(
  home: RohinikHome,
  opts: ProviderConfigureOptions,
  configArg?: string,
): ProviderConfigureResult {
  const d = discoverConfig(home, configArg)

  let raw: string
  let targetPath: string

  if (!d.path || !existsSync(d.path)) {
    // Bootstrap a minimal config
    targetPath = `${home.config}/rohinik.yaml`
    raw = `version: "1.0"\nserver:\n  port: 8080\nproviders:\n`
  } else {
    targetPath = d.path
    try { raw = readFileSync(targetPath, 'utf-8') } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  const envRef    = `\${${opts.apiKeyEnv}}`
  const baseEntry = opts.baseUrl ? `\n  baseUrl: "${opts.baseUrl}"` : ''
  const block     = `  ${opts.name}:\n    apiKey: "${envRef}"${baseEntry}\n`

  // Remove existing provider block if present, then append updated block
  const providerBlockRe = new RegExp(
    `^(  ${opts.name}:\\n(?:    [^\\n]+\\n)*)`,
    'm',
  )

  let updated: string
  if (providerBlockRe.test(raw)) {
    updated = raw.replace(providerBlockRe, block)
  } else if (/^providers:/m.test(raw)) {
    updated = raw.replace(/^(providers:[^\n]*\n)/m, `$1${block}`)
  } else {
    updated = raw + `\nproviders:\n${block}`
  }

  try {
    writeFileSync(targetPath, updated, 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Config YAML parser.
 *
 * Parses rohinik.yaml WITHOUT substituting env vars — the raw ${VAR} tokens
 * are preserved. This lets config commands work without requiring all secrets
 * to be set, and lets redact() and provider list inspect the reference form.
 *
 * Only the runtime uses substituteEnvVars (in loadConfig). The CLI reads
 * the raw YAML for display and validation purposes.
 */

import { readFileSync } from 'node:fs'

/** What the CLI cares about from rohinik.yaml — subset of the full schema. */
export interface ParsedConfig {
  version:    string
  server:     { port: number; host: string }
  providers:  Record<string, { apiKey?: string; baseUrl?: string }>
  runtime:    { logLevel?: string; routing?: { mode?: string } }
  extensions: { paths: string[] }
}

export interface ParseConfigResult {
  ok:     true
  config: ParsedConfig
  raw:    string
}

export interface ParseConfigError {
  ok:     false
  reason: string
}

export function parseConfig(configPath: string): ParseConfigResult | ParseConfigError {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (e) {
    return { ok: false, reason: `Cannot read config file: ${e instanceof Error ? e.message : String(e)}` }
  }

  // ponytail: avoid a YAML dep — parse enough structure with a JSON parse
  // after converting YAML. This is too fragile for complex YAML; use a real
  // parser when the config schema grows. For now the schema is flat enough.
  // Actually: import yaml from js-yaml is available in the runtime but not
  // the SDK. Parse manually for the subset we need.
  let parsed: unknown
  try {
    parsed = parseYamlSubset(raw)
  } catch (e) {
    return { ok: false, reason: `Config YAML parse error: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'Config must be a YAML object' }
  }

  const obj = parsed as Record<string, unknown>

  const version = typeof obj['version'] === 'string' ? obj['version'] : ''
  if (!version) return { ok: false, reason: 'Config missing required field: version' }

  const server = obj['server'] as Record<string, unknown> | undefined
  const providers = (obj['providers'] as Record<string, unknown> | undefined) ?? {}
  const runtime   = (obj['runtime']   as Record<string, unknown> | undefined) ?? {}
  const extensions = (obj['extensions'] as Record<string, unknown> | undefined) ?? { paths: [] }

  const parsedProviders: Record<string, { apiKey?: string; baseUrl?: string }> = {}
  for (const [name, pval] of Object.entries(providers)) {
    if (typeof pval === 'object' && pval !== null) {
      const p = pval as Record<string, unknown>
      parsedProviders[name] = {
        ...(typeof p['apiKey']  === 'string' && { apiKey:  p['apiKey']  }),
        ...(typeof p['baseUrl'] === 'string' && { baseUrl: p['baseUrl'] }),
      }
    } else {
      parsedProviders[name] = {}
    }
  }

  return {
    ok: true,
    raw,
    config: {
      version,
      server: {
        port: typeof server?.['port'] === 'number' ? server['port'] : 8080,
        host: typeof server?.['host'] === 'string' ? server['host'] : '127.0.0.1',
      },
      providers: parsedProviders,
      runtime: {
        logLevel: typeof (runtime as Record<string,unknown>)['logLevel'] === 'string'
          ? (runtime as Record<string,unknown>)['logLevel'] as string : undefined,
        routing: typeof (runtime as Record<string,unknown>)['routing'] === 'object'
          ? { mode: ((runtime as Record<string,unknown>)['routing'] as Record<string,unknown>)?.['mode'] as string | undefined }
          : undefined,
      },
      extensions: {
        paths: Array.isArray((extensions as Record<string,unknown>)['paths'])
          ? ((extensions as Record<string,unknown>)['paths'] as unknown[]).filter(p => typeof p === 'string') as string[]
          : [],
      },
    },
  }
}

/**
 * Minimal YAML-to-JS parser for the rohinik.yaml subset.
 * Handles: string scalars, numbers, booleans, lists of strings, nested objects.
 * Does NOT handle: multi-line strings, anchors, tags, complex nesting beyond 2 levels.
 * ponytail: replace with js-yaml when we add it as a dep.
 */
function parseYamlSubset(yaml: string): unknown {
  // Convert YAML to JSON-parseable by Node's JSON.parse via a simple line parser
  const lines = yaml.split('\n')
  return parseLines(lines, 0, 0).value
}

interface ParseResult { value: unknown; linesConsumed: number }

function parseLines(lines: string[], startIdx: number, baseIndent: number): ParseResult {
  const obj: Record<string, unknown> = {}
  let i = startIdx

  while (i < lines.length) {
    const line = lines[i] ?? ''
    const stripped = line.trimStart()

    // Skip blank lines and comments
    if (!stripped || stripped.startsWith('#')) { i++; continue }

    const indent = line.length - stripped.length
    if (indent < baseIndent) break  // back to parent

    // List item
    if (stripped.startsWith('- ')) {
      // Return to parent to handle as array
      break
    }

    const colonIdx = stripped.indexOf(':')
    if (colonIdx < 0) { i++; continue }

    const key   = stripped.slice(0, colonIdx).trim()
    const after = stripped.slice(colonIdx + 1).trim()

    if (after === '' || after.startsWith('#')) {
      // Nested object or list
      i++
      const nextLine  = lines[i] ?? ''
      const nextStrip = nextLine.trimStart()
      const nextIndent = nextLine.length - nextStrip.length

      if (nextStrip.startsWith('- ')) {
        // List
        const arr: unknown[] = []
        while (i < lines.length) {
          const ll = lines[i] ?? ''
          const ls = ll.trimStart()
          const li = ll.length - ls.length
          if (li < nextIndent && ls !== '') break
          if (ls.startsWith('- ')) {
            arr.push(ls.slice(2).trim())
            i++
          } else if (!ls || ls.startsWith('#')) {
            i++
          } else {
            break
          }
        }
        obj[key] = arr
      } else if (nextIndent > indent) {
        const sub = parseLines(lines, i, nextIndent)
        obj[key] = sub.value
        i += sub.linesConsumed
      } else {
        obj[key] = {}
      }
    } else {
      obj[key] = parseScalar(after)
      i++
    }
  }

  return { value: obj, linesConsumed: i - startIdx }
}

function parseScalar(s: string): unknown {
  const v = s.split('#')[0]!.trim()  // strip inline comments
  if (v === 'true')  return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  const n = Number(v)
  if (!Number.isNaN(n) && v !== '') return n
  // Quoted string
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

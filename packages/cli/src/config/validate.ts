/**
 * Config validation against the known schema constraints.
 * Mirrors the Zod schema in @rohinik-org/runtime without importing it.
 */

import type { ParsedConfig } from './parse.js'

export interface ConfigValidationResult {
  ok: boolean
  errors: string[]
}

const VALID_LOG_LEVELS  = new Set(['debug', 'info', 'warn', 'error'])
const VALID_ROUTE_MODES = new Set(['strict', 'fast', 'balanced', 'quality'])
const CONFIG_VERSIONS   = new Set(['1.0', '1'])

export function validateConfig(config: ParsedConfig): ConfigValidationResult {
  const errors: string[] = []

  if (!CONFIG_VERSIONS.has(config.version)) {
    errors.push(`version "${config.version}" is not a known config schema version`)
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`server.port ${config.server.port} is out of range [1, 65535]`)
  }

  if (config.runtime.logLevel && !VALID_LOG_LEVELS.has(config.runtime.logLevel)) {
    errors.push(`runtime.logLevel "${config.runtime.logLevel}" must be one of: debug, info, warn, error`)
  }

  if (config.runtime.routing?.mode && !VALID_ROUTE_MODES.has(config.runtime.routing.mode)) {
    errors.push(`runtime.routing.mode "${config.runtime.routing.mode}" must be one of: strict, fast, balanced, quality`)
  }

  return { ok: errors.length === 0, errors }
}

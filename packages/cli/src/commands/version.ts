/**
 * rohinik version
 *
 * Reports CLI version, installed runtime version, and protocol versions.
 */

import { readActiveManifest } from './install.js'
import { resolveHome } from '@rohinik-org/install-manifest'
import { CLI_VERSION } from '../index.js'

export interface VersionInfo {
  cli: string
  runtime: string | null
  protocols: {
    execution: string | null
    agent:     string | null
    control:   string | null
  }
}

export function version(opts: { home?: string } = {}): VersionInfo {
  const home = resolveHome(opts.home)
  const manifest = readActiveManifest(home)
  return {
    cli:     CLI_VERSION,
    runtime: manifest?.runtimeVersion ?? null,
    protocols: {
      execution: manifest?.protocols.execution ?? null,
      agent:     manifest?.protocols.agent     ?? null,
      control:   manifest?.protocols.control   ?? null,
    },
  }
}

export function formatVersionInfo(info: VersionInfo): string {
  const r = info.runtime ?? '(not installed)'
  const lines = [
    `Rohinik CLI:     ${info.cli}`,
    `Rohinik Runtime: ${r}`,
    'Protocol:',
    `  execution: ${info.protocols.execution ?? '(not installed)'}`,
    `  agent:     ${info.protocols.agent     ?? '(not installed)'}`,
    `  control:   ${info.protocols.control   ?? '(not installed)'}`,
  ]
  return lines.join('\n')
}

/**
 * Config file discovery.
 *
 * Resolution order (first found wins):
 *   1. ROHINIK_CONFIG env var
 *   2. Explicit path passed by caller (e.g. --config flag)
 *   3. ROHINIK_HOME/config/rohinik.yaml
 *   4. ./rohinik.yaml (CWD)
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { RohinikHome } from '@rohinik-org/install-manifest'

export interface ConfigDiscovery {
  /** Absolute path to the config file, or null if not found. */
  path:   string | null
  /** How the path was resolved. */
  source: 'env' | 'explicit' | 'home' | 'cwd' | 'not-found'
}

export function discoverConfig(home: RohinikHome, explicit?: string): ConfigDiscovery {
  const env = process.env['ROHINIK_CONFIG']
  if (env) {
    const abs = resolve(env)
    return { path: abs, source: 'env' }
  }

  if (explicit) {
    const abs = resolve(explicit)
    return { path: abs, source: 'explicit' }
  }

  const homeConfig = join(home.config, 'rohinik.yaml')
  if (existsSync(homeConfig)) return { path: homeConfig, source: 'home' }

  const cwd = join(process.cwd(), 'rohinik.yaml')
  if (existsSync(cwd)) return { path: cwd, source: 'cwd' }

  return { path: null, source: 'not-found' }
}

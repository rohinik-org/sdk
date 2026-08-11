/**
 * rohinik start
 *
 * Resolves active runtime manifest, spawns rhks as a detached child process,
 * waits for /v1/health to return READY, writes process record.
 *
 * The CLI does NOT import @rohinik-org/server. It executes the packaged
 * runtime binary as an external process.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveHome, runtimeEntrypoint } from '@rohinik-org/install-manifest'
import { readActiveManifest } from './install.js'
import { writeProcessRecord, readProcessRecord, isPidAlive } from '../state.js'
import { probeHealth } from '../health.js'

export interface StartOptions {
  home?: string
  /** Path to rohinik.yaml. Defaults to ROHINIK_HOME/config/rohinik.yaml. */
  configPath?: string
  /** ms to wait for /v1/health before failing. Default 30_000. */
  startupTimeoutMs?: number
  /** ms between health polls. Default 500. */
  pollIntervalMs?: number
}

export type StartResult =
  | { ok: true;  pid: number; endpoint: string; runtimeVersion: string }
  | { ok: false; reason: string }

export async function start(opts: StartOptions = {}): Promise<StartResult> {
  const home = resolveHome(opts.home)

  // ── Guard: already running ────────────────────────────────────────────────
  const existing = readProcessRecord(home.state)
  if (existing !== null && isPidAlive(existing.pid)) {
    return { ok: false, reason: `Runtime already running (pid=${existing.pid}, version=${existing.runtimeVersion})` }
  }

  // ── Resolve active manifest ───────────────────────────────────────────────
  const manifest = readActiveManifest(home)
  if (manifest === null) {
    return { ok: false, reason: 'No runtime installed. Run: rohinik install' }
  }

  // ── Resolve config ────────────────────────────────────────────────────────
  const configPath = opts.configPath ?? join(home.config, 'rohinik.yaml')
  if (!existsSync(configPath)) {
    return { ok: false, reason: `Config not found: ${configPath}. Create it or pass --config.` }
  }

  // ── Resolve entrypoint ────────────────────────────────────────────────────
  const entrypoint = runtimeEntrypoint(home, manifest.runtimeVersion, manifest.entrypoint)
  if (!existsSync(entrypoint)) {
    return { ok: false, reason: `Runtime entrypoint not found: ${entrypoint}. Re-run: rohinik install` }
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────
  mkdirSync(home.logs, { recursive: true })
  const ipcSocket = deriveIpcSocket(home.root)
  const child = spawn(process.execPath, [entrypoint], {
    detached: true,
    stdio:    'ignore',
    env: {
      ...process.env,
      ROHINIK_HOME:       home.root,
      ROHINIK_CONFIG:     configPath,
      ROHINIK_IPC_SOCKET: ipcSocket,
    },
  })
  child.unref()

  if (child.pid === undefined) {
    return { ok: false, reason: 'Failed to spawn runtime process (no PID assigned)' }
  }

  const pid = child.pid

  // ── Derive endpoint from config (read port from YAML or default 8080) ─────
  const port = readPortFromConfig(configPath)
  const endpoint = `http://127.0.0.1:${port}`

  // ── Wait for health ───────────────────────────────────────────────────────
  const timeoutMs  = opts.startupTimeoutMs ?? 30_000
  const pollMs     = opts.pollIntervalMs   ?? 500
  const deadline   = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return { ok: false, reason: 'Runtime process exited before becoming ready' }
    }
    const probe = await probeHealth(endpoint, pollMs)
    if (probe.status === 'READY') {
      writeProcessRecord(home.state, {
        runtimeVersion: manifest.runtimeVersion,
        pid,
        startedAt: new Date().toISOString(),
        configPath,
        endpoint,
      })
      return { ok: true, pid, endpoint, runtimeVersion: manifest.runtimeVersion }
    }
    await sleep(pollMs)
  }

  // Timed out — kill the process we started, leave previous record untouched
  try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
  return { ok: false, reason: `Runtime did not become ready within ${timeoutMs}ms` }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Extract server.port from a minimal YAML config without a full YAML parser. */
// ponytail: avoid a YAML dep for a single integer. Regex on a known schema.
function readPortFromConfig(configPath: string): number {
  try {
    const text = readFileSync(configPath, 'utf-8')
    const match = /port:\s*(\d+)/.exec(text)
    if (match?.[1]) return parseInt(match[1], 10)
  } catch { /* fallthrough */ }
  return 8080
}

/** Derive a per-home IPC socket path so concurrent instances don't collide. */
function deriveIpcSocket(homeRoot: string): string {
  const hash = createHash('sha1').update(homeRoot).digest('hex').slice(0, 8)
  // Windows named pipe; on Unix this is a socket file path — runtime handles both.
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\rohinik-${hash}`
    : `/tmp/rohinik-${hash}.sock`
}

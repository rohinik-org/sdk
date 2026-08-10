/**
 * rohinik stop
 *
 * Sends SIGTERM to the runtime process and waits for it to exit.
 * Removes the process record on clean exit.
 * Does NOT force-kill — use --force for that (future T4).
 */

import { readProcessRecord, removeProcessRecord, isPidAlive } from '../state.js'
import { resolveHome } from '@rohinik-org/install-manifest'

export interface StopOptions {
  home?: string
  /** ms to wait for graceful shutdown. Default 15_000. */
  gracefulTimeoutMs?: number
}

export type StopResult =
  | { ok: true;  stoppedPid: number }
  | { ok: false; reason: string }

export async function stop(opts: StopOptions = {}): Promise<StopResult> {
  const home = resolveHome(opts.home)
  const record = readProcessRecord(home.state)

  if (record === null) {
    return { ok: false, reason: 'No process record found. Runtime may not be running.' }
  }

  if (!isPidAlive(record.pid)) {
    removeProcessRecord(home.state)
    return { ok: false, reason: `Process record exists but pid=${record.pid} is not alive (stale record removed).` }
  }

  try {
    process.kill(record.pid, 'SIGTERM')
  } catch (e) {
    return { ok: false, reason: `Failed to send SIGTERM to pid=${record.pid}: ${e instanceof Error ? e.message : String(e)}` }
  }

  const timeoutMs = opts.gracefulTimeoutMs ?? 15_000
  const deadline  = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(200)
    if (!isPidAlive(record.pid)) {
      removeProcessRecord(home.state)
      return { ok: true, stoppedPid: record.pid }
    }
  }

  return {
    ok: false,
    reason: `Runtime pid=${record.pid} did not exit within ${timeoutMs}ms after SIGTERM. Use --force to terminate.`,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * rohinik status
 *
 * Returns one of five states:
 *   STOPPED              — no process record
 *   STALE_PROCESS_RECORD — record exists but PID is dead
 *   STARTING             — PID alive, /v1/health not yet READY
 *   READY                — PID alive, /v1/health returns 200
 *   UNHEALTHY            — PID alive, /v1/health returns non-200
 */

import { readProcessRecord, isPidAlive } from '../state.js'
import { probeHealth } from '../health.js'
import { resolveHome } from '@rohinik-org/install-manifest'

export type RuntimeStatus = 'STOPPED' | 'STALE_PROCESS_RECORD' | 'STARTING' | 'READY' | 'UNHEALTHY'

export interface StatusResult {
  status: RuntimeStatus
  pid?: number
  runtimeVersion?: string
  endpoint?: string
  startedAt?: string
  healthLatencyMs?: number
}

export async function status(opts: { home?: string } = {}): Promise<StatusResult> {
  const home = resolveHome(opts.home)
  const record = readProcessRecord(home.state)

  if (record === null) {
    return { status: 'STOPPED' }
  }

  if (!isPidAlive(record.pid)) {
    return {
      status: 'STALE_PROCESS_RECORD',
      pid:            record.pid,
      runtimeVersion: record.runtimeVersion,
      endpoint:       record.endpoint,
      startedAt:      record.startedAt,
    }
  }

  const probe = await probeHealth(record.endpoint, 3_000)

  if (probe.status === 'READY') {
    return {
      status:           'READY',
      pid:              record.pid,
      runtimeVersion:   record.runtimeVersion,
      endpoint:         record.endpoint,
      startedAt:        record.startedAt,
      healthLatencyMs:  probe.latencyMs,
    }
  }

  if (probe.status === 'UNREACHABLE') {
    return {
      status:         'STARTING',
      pid:            record.pid,
      runtimeVersion: record.runtimeVersion,
      endpoint:       record.endpoint,
      startedAt:      record.startedAt,
    }
  }

  return {
    status:           'UNHEALTHY',
    pid:              record.pid,
    runtimeVersion:   record.runtimeVersion,
    endpoint:         record.endpoint,
    startedAt:        record.startedAt,
    healthLatencyMs:  probe.latencyMs,
  }
}

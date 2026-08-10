/**
 * Durable process record written to ROHINIK_HOME/state/runtime-process.json.
 *
 * Written on `rohinik start`, removed on clean `rohinik stop`.
 * A record that exists but whose PID is dead = STALE_PROCESS_RECORD.
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface ProcessRecord {
  runtimeVersion: string
  pid: number
  startedAt: string
  configPath: string
  endpoint: string
}

export function processRecordPath(statDir: string): string {
  return join(statDir, 'runtime-process.json')
}

export function readProcessRecord(statDir: string): ProcessRecord | null {
  try {
    const raw = readFileSync(processRecordPath(statDir), 'utf-8')
    return JSON.parse(raw) as ProcessRecord
  } catch {
    return null
  }
}

export function writeProcessRecord(statDir: string, record: ProcessRecord): void {
  mkdirSync(statDir, { recursive: true })
  writeFileSync(processRecordPath(statDir), JSON.stringify(record, null, 2), 'utf-8')
}

export function removeProcessRecord(statDir: string): void {
  try { rmSync(processRecordPath(statDir)) } catch { /* already gone */ }
}

/** Returns true if the process with the given PID is currently running. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

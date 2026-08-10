import type { RohinikHome } from '@rohinik-org/install-manifest'
import type { CheckResult } from '../doctor/checks.js'
import {
  checkInstallation,
  checkManifestIntegrity,
  checkCliCompatibility_check,
  checkConfiguration,
  checkEnvRefs,
  checkRuntimeProcess,
  checkRuntimeHealth,
  checkProtocols,
  checkProviders,
  checkStorage,
  checkPackages,
} from '../doctor/checks.js'

export interface DoctorReport {
  results:  CheckResult[]
  allPass:  boolean
  hasWarn:  boolean
  hasFail:  boolean
}

export async function runDoctor(home: RohinikHome, configPath?: string): Promise<DoctorReport> {
  const results: CheckResult[] = [
    checkStorage(home),
    checkPackages(home),
    checkInstallation(home),
    checkManifestIntegrity(home),
    checkCliCompatibility_check(home),
    checkConfiguration(home, configPath),
    checkEnvRefs(home, configPath),
    checkRuntimeProcess(home),
    await checkRuntimeHealth(home),
    ...await checkProtocols(home),
    ...await checkProviders(home, configPath),
  ]

  return {
    results,
    allPass: results.every(r => r.status === 'PASS' || r.status === 'SKIP'),
    hasWarn: results.some(r => r.status === 'WARN'),
    hasFail: results.some(r => r.status === 'FAIL'),
  }
}

const STATUS_ICON: Record<string, string> = {
  PASS: '✓',
  FAIL: '✗',
  WARN: '!',
  SKIP: '-',
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = report.results.map(r => {
    const icon   = STATUS_ICON[r.status] ?? '?'
    const detail = r.detail ? `  ${r.detail}` : ''
    return `  [${icon}] ${r.name}${detail}`
  })

  const summary = report.hasFail
    ? 'Some checks failed.'
    : report.hasWarn
      ? 'All required checks passed (warnings present).'
      : 'All checks passed.'

  return lines.join('\n') + '\n\n' + summary
}

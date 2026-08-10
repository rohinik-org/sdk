export const CLI_VERSION = '0.16.0'

export type { InstallOptions, InstallResult, InstallError } from './commands/install.js'
export { install, readActiveVersion, readActiveManifest, listInstalledVersions } from './commands/install.js'

export type { StartOptions, StartResult } from './commands/start.js'
export { start } from './commands/start.js'

export type { StopOptions, StopResult } from './commands/stop.js'
export { stop } from './commands/stop.js'

export type { RuntimeStatus, StatusResult } from './commands/status.js'
export { status } from './commands/status.js'

export type { VersionInfo } from './commands/version.js'
export { version, formatVersionInfo } from './commands/version.js'

export type { ProcessRecord } from './state.js'
export { readProcessRecord, writeProcessRecord, removeProcessRecord, isPidAlive } from './state.js'

export type { HealthProbeResult, HealthStatus } from './health.js'
export { probeHealth } from './health.js'

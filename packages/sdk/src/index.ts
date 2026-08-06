// packages/sdk/src/index.ts
export { RohinikSdk } from './rohinik-sdk.js'
export type { RohinikSdkOptions } from './rohinik-sdk.js'
export { RohinikHttpClient, RohinikClientError } from '@rohinik-org/runtime-client'
export type {
  HealthInfo, ExecuteRequest, ExecuteResponse,
  AcquisitionInstallResult, AcquisitionSearchResult, InstalledCapabilityList,
} from '@rohinik-org/runtime-client'

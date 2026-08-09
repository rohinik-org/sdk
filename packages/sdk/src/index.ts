// packages/sdk/src/index.ts
export { RohinikSdk } from './rohinik-sdk.js'
export type { RohinikSdkOptions } from './rohinik-sdk.js'
export { delegateMany } from './delegate-many.js'
export type { DelegateManySpec, DelegateManyOptions, AggregateBudget, DelegateManyResult } from './delegate-many.js'
export { RohinikHttpClient, RohinikClientError } from '@rohinik-org/runtime-client'
export type {
  HealthInfo, ExecuteRequest, ExecuteResponse,
  AcquisitionInstallResult, AcquisitionSearchResult, InstalledCapabilityList,
} from '@rohinik-org/runtime-client'

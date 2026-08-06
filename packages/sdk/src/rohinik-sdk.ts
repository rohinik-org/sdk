// packages/sdk/src/rohinik-sdk.ts
import { RohinikHttpClient } from '@rohinik-org/runtime-client'
import type {
  AcquisitionInstallResult,
  AcquisitionSearchResult,
  InstalledCapabilityList,
  ExecuteRequest,
  ExecuteResponse,
  HealthInfo,
} from '@rohinik-org/runtime-client'

export interface RohinikSdkOptions {
  readonly baseUrl?: string
  readonly client?: RohinikHttpClient
}

export class RohinikSdk {
  readonly client: RohinikHttpClient

  constructor(options: RohinikSdkOptions = {}) {
    this.client = options.client ?? new RohinikHttpClient(options.baseUrl ?? 'http://localhost:8080')
  }

  getHealth(): Promise<HealthInfo> {
    return this.client.getHealth()
  }

  listInstalledCapabilities(): Promise<InstalledCapabilityList> {
    return this.client.listInstalledCapabilities()
  }

  searchCapabilities(term: string): Promise<AcquisitionSearchResult> {
    return this.client.acquisitionSearch(term)
  }

  installCapability(term: string, policy?: unknown): Promise<AcquisitionInstallResult> {
    return this.client.acquisitionInstall(term, policy)
  }

  execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    return this.client.execute(request)
  }
}

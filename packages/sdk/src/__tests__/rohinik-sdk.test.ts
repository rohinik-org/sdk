// packages/sdk/src/__tests__/rohinik-sdk.test.ts
import { describe, it, expect, vi } from 'vitest'
import { RohinikSdk } from '../rohinik-sdk.js'
import type { RohinikHttpClient } from '@rohinik-org/runtime-client'

describe('RohinikSdk', () => {
  it('delegates installCapability to the injected canonical client', async () => {
    const client = {
      acquisitionInstall: vi.fn().mockResolvedValue({ requestId: 'req-1', success: true }),
      acquisitionSearch: vi.fn(),
      listInstalledCapabilities: vi.fn(),
      getHealth: vi.fn(),
      execute: vi.fn(),
    } as unknown as RohinikHttpClient

    const sdk = new RohinikSdk({ client })
    const result = await sdk.installCapability('filesystem:read')

    expect(client.acquisitionInstall).toHaveBeenCalledWith('filesystem:read', undefined)
    expect(result).toEqual({ requestId: 'req-1', success: true })
  })

  it('delegates execute to the injected canonical client', async () => {
    const client = {
      acquisitionInstall: vi.fn(),
      acquisitionSearch: vi.fn(),
      listInstalledCapabilities: vi.fn(),
      getHealth: vi.fn(),
      execute: vi.fn().mockResolvedValue({ requestId: 'req-2' }),
    } as unknown as RohinikHttpClient

    const sdk = new RohinikSdk({ client })
    const request = { content: 'read file.txt', contentType: 'text/plain' }
    await sdk.execute(request as never)

    expect(client.execute).toHaveBeenCalledWith(request)
  })

  it('uses default baseUrl when no options provided', () => {
    const sdk = new RohinikSdk()
    expect(sdk.client).toBeTruthy()
  })

  it('delegates getHealth to the injected client', async () => {
    const client = {
      acquisitionInstall: vi.fn(),
      acquisitionSearch: vi.fn(),
      listInstalledCapabilities: vi.fn(),
      getHealth: vi.fn().mockResolvedValue({ requestId: 'health-1', status: 'HEALTHY' }),
      execute: vi.fn(),
    } as unknown as RohinikHttpClient

    const sdk = new RohinikSdk({ client })
    const result = await sdk.getHealth()
    expect(client.getHealth).toHaveBeenCalled()
    expect(result.status).toBe('HEALTHY')
  })
})

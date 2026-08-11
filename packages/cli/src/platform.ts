import { platform, arch } from 'node:os'

export interface PlatformId {
  os:   'linux' | 'darwin' | 'win32'
  arch: 'x64' | 'arm64'
}

export function currentPlatform(): PlatformId {
  const p = platform() as string
  const a = arch()
  return {
    os:   (p === 'win32' || p === 'darwin' ? p : 'linux') as PlatformId['os'],
    arch: a === 'arm64' ? 'arm64' : 'x64',
  }
}

export function platformSuffix(id: PlatformId): string {
  return `${id.os}-${id.arch}`
}

import type { PackageDefinition } from './types.js'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'
import { PACKAGE_MANIFEST_SCHEMA_VERSION } from '@rohinik-org/package-manifest-ir'

/**
 * Convert a PackageDefinition into a canonical RohinikPackageManifestV1.
 *
 * Canonical ordering:
 *   - provides sorted by capability id (lexicographic)
 *   - consumes sorted by capability id
 *   - npm deps sorted by name
 *   - secrets/environment sorted by name
 */
export function resolveManifest(def: PackageDefinition): RohinikPackageManifestV1 {
  const provides = [...(def.provides ?? [])]
    .sort((a, b) => a.capability.localeCompare(b.capability))
    .map(p => Object.freeze({ ...p }))

  const consumes = [...(def.consumes ?? [])]
    .sort((a, b) => a.capability.localeCompare(b.capability))
    .map(c => Object.freeze({ ...c }))

  const manifest: Record<string, unknown> = {
    schemaVersion: PACKAGE_MANIFEST_SCHEMA_VERSION,
    package:       Object.freeze({ ...def.package }),
  }

  if (def.publisher)            manifest['publisher']     = Object.freeze({ ...def.publisher })
  if (def.runtime)              manifest['runtime']       = Object.freeze({ ...def.runtime })
  if (provides.length > 0)      manifest['provides']      = Object.freeze(provides)
  if (consumes.length > 0)      manifest['consumes']      = Object.freeze(consumes)

  if (def.dependencies) {
    const npm = [...(def.dependencies.npm ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(d => Object.freeze({ ...d }))
    const rohinik = [...(def.dependencies.rohinik ?? [])].sort()
    manifest['dependencies'] = Object.freeze({
      ...(rohinik.length > 0 ? { rohinik: Object.freeze(rohinik) } : {}),
      ...(npm.length > 0     ? { npm:     Object.freeze(npm) }     : {}),
    })
  }

  if (def.configuration) {
    const secrets = [...(def.configuration.secrets ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => Object.freeze({ ...s }))
    const environment = [...(def.configuration.environment ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => Object.freeze({ ...e }))
    manifest['configuration'] = Object.freeze({
      ...(secrets.length > 0     ? { secrets:     Object.freeze(secrets)     } : {}),
      ...(environment.length > 0 ? { environment: Object.freeze(environment) } : {}),
    })
  }

  if (def.permissions) manifest['permissions'] = Object.freeze({ ...def.permissions })
  if (def.health)      manifest['health']       = Object.freeze({ ...def.health })
  if (def.lifecycle)   manifest['lifecycle']    = Object.freeze({ ...def.lifecycle })
  if (def.metadata)    manifest['metadata']     = Object.freeze({ ...def.metadata })

  return Object.freeze(manifest) as unknown as RohinikPackageManifestV1
}

import type { PackageDefinition } from './types.js'
import { PACKAGE_ID_PATTERN, CAPABILITY_ID_PATTERN } from '@rohinik-org/package-manifest-ir'

export interface PackageValidationResult {
  readonly ok:     boolean
  readonly errors: readonly string[]
}

const SEMVER_RE = /^\d+\.\d+\.\d+/

export function validatePackageDefinition(def: PackageDefinition): PackageValidationResult {
  const errors: string[] = []

  if (!def.package.id || !PACKAGE_ID_PATTERN.test(def.package.id)) {
    errors.push(`invalid package id "${def.package.id}" — must be reverse-domain style (e.g. com.example.my-package)`)
  }
  if (!def.package.name?.trim()) {
    errors.push('package name is required')
  }
  if (!def.package.version || !SEMVER_RE.test(def.package.version)) {
    errors.push(`invalid package version "${def.package.version}" — must be semver (e.g. 1.0.0)`)
  }
  if (!def.package.type) {
    errors.push('package type is required')
  }

  // Provides: all capability ids must be valid + unique + have semver version
  const seenProvides = new Set<string>()
  for (const p of def.provides ?? []) {
    if (!CAPABILITY_ID_PATTERN.test(p.capability)) {
      errors.push(`provides: invalid capability id "${p.capability}"`)
    } else if (seenProvides.has(p.capability)) {
      errors.push(`provides: duplicate capability id "${p.capability}"`)
    }
    seenProvides.add(p.capability)
    if (!p.version || !SEMVER_RE.test(p.version)) {
      errors.push(`provides[${p.capability}]: invalid version "${p.version}"`)
    }
  }

  // Consumes: all capability ids must be valid + unique
  const seenConsumes = new Set<string>()
  for (const c of def.consumes ?? []) {
    if (!CAPABILITY_ID_PATTERN.test(c.capability)) {
      errors.push(`consumes: invalid capability id "${c.capability}"`)
    } else if (seenConsumes.has(c.capability)) {
      errors.push(`consumes: duplicate capability id "${c.capability}"`)
    }
    seenConsumes.add(c.capability)
  }

  // Configuration secrets: names must be non-empty + unique
  const secretNames = def.configuration?.secrets ?? []
  const seenSecrets = new Set<string>()
  for (const s of secretNames) {
    if (!s.name?.trim()) {
      errors.push('configuration.secrets: empty secret name')
    } else if (seenSecrets.has(s.name)) {
      errors.push(`configuration.secrets: duplicate secret name "${s.name}"`)
    }
    seenSecrets.add(s.name)
  }

  return { ok: errors.length === 0, errors: Object.freeze(errors) }
}

/**
 * Permission declaration helpers.
 *
 * CanonicalPermission shape mirrors package-trust-ir's contract
 * (domain + value + optional resourceConstraint). Defined locally to avoid
 * vendoring package-trust-ir — the shape is trivial and stable.
 */

/** Mirrors CanonicalPermission from @rohinik-org/package-trust-ir */
export interface PermissionDeclaration {
  readonly domain: string
  readonly value: string
  readonly resourceConstraint?: string
}

/**
 * Declare a permission requirement for a capability.
 *
 * @param domain     Permission domain (e.g. "filesystem", "network", "model")
 * @param value      Permission value within domain (e.g. "read", "write", "invoke")
 * @param resource   Optional resource constraint scoping the permission
 */
export function permission(
  domain: string,
  value: string,
  resource?: string,
): PermissionDeclaration {
  if (!domain.trim()) throw new Error('permission domain must be a non-empty string')
  if (!value.trim())  throw new Error('permission value must be a non-empty string')
  return resource !== undefined
    ? { domain, value, resourceConstraint: resource }
    : { domain, value }
}

/** Shorthand helpers for common permission domains */
export const permissions = {
  filesystem: {
    read:  (resource?: string) => permission('filesystem', 'read', resource),
    write: (resource?: string) => permission('filesystem', 'write', resource),
  },
  network: {
    outbound: (resource?: string) => permission('network', 'outbound', resource),
  },
  model: {
    invoke: (resource?: string) => permission('model', 'invoke', resource),
  },
} as const

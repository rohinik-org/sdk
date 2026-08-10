/**
 * Result helpers for capability execute() implementations.
 *
 * These are thin wrappers — a capability can return any TOutput directly.
 * Helpers add structural consistency for capabilities that want to include
 * evidence or warnings alongside the primary result.
 */

export interface CapabilityResult<T> {
  readonly value:    T
  readonly evidence?: readonly string[]
  readonly warnings?: readonly string[]
}

export function result<T>(
  value: T,
  opts?: { evidence?: readonly string[]; warnings?: readonly string[] },
): CapabilityResult<T> {
  return { value, ...opts }
}

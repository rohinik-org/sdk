/**
 * Deterministic ID generator for testing.
 * Produces sequential, prefix-namespaced IDs: test-id-0001, test-id-0002, ...
 * Useful for making snapshots stable across runs.
 */
export function createDeterministicIds(prefix = 'test-id', start = 1): { next(): string } {
  let n = start
  return {
    next() {
      return `${prefix}-${String(n++).padStart(4, '0')}`
    },
  }
}

/**
 * Deterministic fake clock.
 * Starts at a fixed ISO timestamp and advances by tickMs on each tick().
 * toISOString() always returns a reproducible value.
 */
export function createFakeClock(options?: {
  readonly startIso?: string
  readonly tickMs?:   number
}) {
  const tickMs = options?.tickMs ?? 1000
  let ts = new Date(options?.startIso ?? '2026-01-01T00:00:00.000Z').getTime()

  return {
    now():        number  { return ts },
    toISOString(): string { return new Date(ts).toISOString() },
    tick(ms?: number): void { ts += ms ?? tickMs },
    reset(iso?: string): void { ts = new Date(iso ?? (options?.startIso ?? '2026-01-01T00:00:00.000Z')).getTime() },
  }
}

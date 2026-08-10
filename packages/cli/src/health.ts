/**
 * Health probe for a running Rohinik runtime.
 * Calls GET /v1/health and returns a typed result — no throws.
 */

export type HealthStatus = 'READY' | 'UNHEALTHY' | 'UNREACHABLE'

export interface HealthProbeResult {
  status: HealthStatus
  /** Raw HTTP status code if the request completed. */
  httpStatus?: number
  /** Latency in ms. */
  latencyMs: number
}

export async function probeHealth(endpoint: string, timeoutMs = 5_000): Promise<HealthProbeResult> {
  const start = Date.now()
  const url = `${endpoint.replace(/\/$/, '')}/v1/health`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    const latencyMs = Date.now() - start
    if (res.ok) return { status: 'READY', httpStatus: res.status, latencyMs }
    return { status: 'UNHEALTHY', httpStatus: res.status, latencyMs }
  } catch {
    return { status: 'UNREACHABLE', latencyMs: Date.now() - start }
  }
}

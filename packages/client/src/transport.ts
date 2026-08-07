import type { PublicErrorEnvelope } from '@rohinik-org/execution-protocol-v1'
import { EXECUTION_PROTOCOL_VERSION } from '@rohinik-org/execution-protocol-v1'

export class RohinikClientError extends Error {
  readonly status: number | undefined
  readonly envelope: PublicErrorEnvelope | undefined

  constructor(
    message: string,
    options?: { status?: number; envelope?: PublicErrorEnvelope },
  ) {
    super(message)
    this.name = 'RohinikClientError'
    this.status = options?.status
    this.envelope = options?.envelope
  }
}

export class ProtocolVersionError extends RohinikClientError {
  constructor(serverVersion: string) {
    super(`Server returned unsupported protocol version: ${serverVersion}. Expected: ${EXECUTION_PROTOCOL_VERSION}`)
    this.name = 'ProtocolVersionError'
  }
}

export type HttpMethod = 'GET' | 'POST'

export interface TransportOptions {
  readonly baseUrl: string
  readonly headers?: Readonly<Record<string, string>>
  /** Timeout in milliseconds. Defaults to 30 000. */
  readonly timeoutMs?: number
}

export class HttpTransport {
  readonly baseUrl: string
  readonly extraHeaders: Readonly<Record<string, string>>
  private readonly timeoutMs: number

  constructor(options: TransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.extraHeaders = options.headers ?? {}
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...this.extraHeaders,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new RohinikClientError(
        `Cannot reach Rohinik runtime at ${this.baseUrl}: ${msg}`,
      )
    } finally {
      clearTimeout(timer)
    }

    const json = await res.json().catch(() => undefined) as unknown

    if (!res.ok) {
      const envelope = isErrorEnvelope(json) ? json : undefined
      throw new RohinikClientError(
        envelope?.message ?? `HTTP ${res.status} ${res.statusText}`,
        { status: res.status, envelope },
      )
    }

    // Protocol-version guard on all success responses that carry the field
    if (isVersioned(json) && json.protocolVersion !== EXECUTION_PROTOCOL_VERSION) {
      throw new ProtocolVersionError(json.protocolVersion)
    }

    return json as T
  }
}

/**
 * Opens an SSE stream and returns the raw Response.
 * Caller owns the body reader. Never throws on HTTP errors — check res.ok.
 */
export async function fetchStream(
  baseUrl: string,
  path: string,
  extraHeaders: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { Accept: 'text/event-stream', ...extraHeaders },
    signal: signal ?? null,
  })
}

function isErrorEnvelope(v: unknown): v is PublicErrorEnvelope {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).code === 'string' &&
    typeof (v as Record<string, unknown>).message === 'string'
  )
}

function isVersioned(v: unknown): v is { protocolVersion: string } {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).protocolVersion === 'string'
  )
}

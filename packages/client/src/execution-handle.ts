import type {
  ExecutionStatusResponse,
  ExecutionResultResponse,
  ExecutionEvidenceResponse,
  CancelExecutionRequest,
  CancelExecutionResponse,
  PublicExecutionState,
  PublicExecutionEvent,
} from '@rohinik-org/execution-protocol-v1'
import { PUBLIC_TERMINAL_STATES, PUBLIC_TERMINAL_EVENT_KINDS } from '@rohinik-org/execution-protocol-v1'
import { RohinikClientError, fetchStream } from './transport.js'
import type { HttpTransport } from './transport.js'

// ── Poll options ──────────────────────────────────────────────────────────────

export interface PollOptions {
  /** Milliseconds between status polls. Default: 500. */
  readonly pollIntervalMs?: number
  /** Milliseconds until the poll loop gives up and throws. Default: 30 000. */
  readonly timeoutMs?: number
  /** External abort signal — cancels the poll loop immediately when aborted. */
  readonly signal?: AbortSignal
  /** Called on every status response during the poll loop. */
  readonly onStatus?: (status: ExecutionStatusResponse) => void
}

// ── Events options ────────────────────────────────────────────────────────────

export type StreamMode = 'auto' | 'sse' | 'poll'

export interface EventsOptions {
  /** External abort signal — stops the stream when aborted. */
  readonly signal?: AbortSignal
  /**
   * Transport strategy.
   * - 'sse'  — SSE only; throws on failure (no fallback).
   * - 'poll' — poll GET /status; synthesizes lifecycle events only.
   * - 'auto' — try SSE, reconnect within budget, fall back to poll.
   * Default: 'auto'.
   */
  readonly streamMode?: StreamMode
  /**
   * When streamMode='sse' or 'auto', reconnect using last cursor after
   * connection drop. Ignored in 'poll' mode. Default: true.
   */
  readonly reconnect?: boolean
  /** Poll interval in ms. Used in 'poll' mode and 'auto' poll fallback. Default: 500. */
  readonly pollIntervalMs?: number
  /** Total timeout in ms before giving up (all modes). Default: 30 000. */
  readonly timeoutMs?: number
  /** Called when auto mode switches transport strategy. */
  readonly onStreamModeChange?: (mode: 'sse' | 'poll') => void
}

// ── Terminal failure errors ───────────────────────────────────────────────────

export class ExecutionFailedError extends RohinikClientError {
  readonly executionId: string
  readonly terminalState: PublicExecutionState

  constructor(executionId: string, state: PublicExecutionState) {
    super(`Execution ${executionId} reached terminal state ${state}`)
    this.name = 'ExecutionFailedError'
    this.executionId = executionId
    this.terminalState = state
  }
}

export class ExecutionCancelledError extends ExecutionFailedError {
  constructor(executionId: string) {
    super(executionId, 'CANCELLED')
    this.name = 'ExecutionCancelledError'
  }
}

export class ExecutionTimeoutError extends RohinikClientError {
  readonly executionId: string

  constructor(executionId: string, timeoutMs: number) {
    super(`Execution ${executionId} did not reach terminal state within ${timeoutMs}ms`)
    this.name = 'ExecutionTimeoutError'
    this.executionId = executionId
  }
}

// ── ExecutionHandle ───────────────────────────────────────────────────────────

export class ExecutionHandle {
  readonly executionId: string

  constructor(
    executionId: string,
    private readonly transport: HttpTransport,
  ) {
    this.executionId = executionId
  }

  status(): Promise<ExecutionStatusResponse> {
    return this.transport.request<ExecutionStatusResponse>(
      'GET',
      `/v1/executions/${encodeURIComponent(this.executionId)}`,
    )
  }

  result(): Promise<ExecutionResultResponse> {
    return this.transport.request<ExecutionResultResponse>(
      'GET',
      `/v1/executions/${encodeURIComponent(this.executionId)}/result`,
    )
  }

  evidence(): Promise<ExecutionEvidenceResponse> {
    return this.transport.request<ExecutionEvidenceResponse>(
      'GET',
      `/v1/executions/${encodeURIComponent(this.executionId)}/evidence`,
    )
  }

  cancel(body?: CancelExecutionRequest): Promise<CancelExecutionResponse> {
    return this.transport.request<CancelExecutionResponse>(
      'POST',
      `/v1/executions/${encodeURIComponent(this.executionId)}/cancel`,
      body ?? {},
    )
  }

  /**
   * Poll status until terminal. Resolves with the terminal status response.
   * Throws ExecutionTimeoutError if timeoutMs elapses before terminal.
   */
  async waitUntilTerminal(options?: PollOptions): Promise<ExecutionStatusResponse> {
    const pollIntervalMs = options?.pollIntervalMs ?? 500
    const timeoutMs      = options?.timeoutMs      ?? 30_000
    const signal         = options?.signal
    const onStatus       = options?.onStatus

    const deadline = Date.now() + timeoutMs

    while (true) {
      if (signal?.aborted) {
        throw new RohinikClientError('Poll aborted via AbortSignal')
      }

      const status = await this.status()
      onStatus?.(status)

      if (PUBLIC_TERMINAL_STATES.has(status.state)) {
        return status
      }

      if (Date.now() >= deadline) {
        throw new ExecutionTimeoutError(this.executionId, timeoutMs)
      }

      await _sleep(pollIntervalMs, signal)
    }
  }

  /**
   * Poll until terminal, then return the execution result.
   *
   * - COMPLETED: resolves with ExecutionResultResponse
   * - FAILED:    throws ExecutionFailedError
   * - CANCELLED: throws ExecutionCancelledError
   * - timeout:   throws ExecutionTimeoutError
   */
  async waitForResult(options?: PollOptions): Promise<ExecutionResultResponse> {
    const status = await this.waitUntilTerminal(options)

    if (status.state === 'CANCELLED') {
      throw new ExecutionCancelledError(this.executionId)
    }
    if (status.state === 'FAILED') {
      throw new ExecutionFailedError(this.executionId, status.state)
    }

    return this.result()
  }
  /**
   * Stream execution events as an async iterable.
   *
   * streamMode:
   *   'sse'  — SSE only; throws on failure (no fallback)
   *   'poll' — synthesize lifecycle events from status polls (no fabricated partial events)
   *   'auto' — try SSE, reconnect within budget, fall back to poll (default)
   *
   * Closing the iterator does NOT cancel the execution.
   */
  async *events(options?: EventsOptions): AsyncIterable<PublicExecutionEvent> {
    const mode           = options?.streamMode    ?? 'auto'
    const signal         = options?.signal
    const reconnect      = options?.reconnect     ?? true
    const pollIntervalMs = options?.pollIntervalMs ?? 500
    const timeoutMs      = options?.timeoutMs      ?? 30_000
    const deadline       = Date.now() + timeoutMs

    if (mode === 'poll') {
      yield* this._pollStream(signal, pollIntervalMs, deadline)
      return
    }

    // sse or auto: attempt SSE with reconnect, then optionally fall back
    let lastCursor: string | undefined
    let lastSequence = 0
    let terminal = false
    let sseExhausted = false

    while (!terminal && !sseExhausted) {
      if (signal?.aborted) break
      if (Date.now() >= deadline) {
        throw new RohinikClientError(`Stream timed out after ${timeoutMs}ms`)
      }

      const path = lastCursor
        ? `/v1/executions/${encodeURIComponent(this.executionId)}/events?after=${encodeURIComponent(lastCursor)}`
        : `/v1/executions/${encodeURIComponent(this.executionId)}/events`

      let res: Response
      try {
        res = await fetchStream(this.transport.baseUrl, path, this.transport.extraHeaders, signal)
      } catch (err) {
        if (signal?.aborted) break
        if (mode === 'sse') {
          throw new RohinikClientError(
            `Cannot reach Rohinik runtime: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        sseExhausted = true
        break
      }

      if (!res.ok) {
        const body = await res.json().catch(() => undefined) as unknown
        const msg = (body !== null && typeof body === 'object' && typeof (body as Record<string, unknown>).message === 'string')
          ? (body as { message: string }).message
          : `HTTP ${res.status}`
        if (mode === 'sse') {
          throw new RohinikClientError(msg, { status: res.status })
        }
        sseExhausted = true
        break
      }

      if (!res.body) {
        if (mode === 'sse') throw new RohinikClientError('No response body from SSE endpoint')
        sseExhausted = true
        break
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let connectionDropped = false

      try {
        outer: while (true) {
          if (signal?.aborted) break outer
          if (Date.now() >= deadline) {
            throw new RohinikClientError(`Stream timed out after ${timeoutMs}ms`)
          }

          let chunk: Awaited<ReturnType<typeof reader.read>>
          try {
            chunk = await reader.read()
          } catch {
            connectionDropped = true
            break outer
          }

          if (chunk.done) break outer
          buf += decoder.decode(chunk.value, { stream: true })

          const parts = buf.split('\n\n')
          buf = parts.pop()!

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue
              let event: PublicExecutionEvent
              try {
                event = JSON.parse(line.slice(6)) as PublicExecutionEvent
              } catch {
                continue
              }

              const seq = (event as unknown as { sequence: number }).sequence

              if (seq <= lastSequence && lastSequence > 0) continue

              if (seq !== lastSequence + 1 && lastSequence > 0) {
                throw new RohinikClientError(
                  `Non-monotonic sequence: expected ${lastSequence + 1}, got ${seq}`,
                )
              }

              lastSequence = seq
              lastCursor   = (event as unknown as { cursor: string }).cursor

              yield event

              if (signal?.aborted) break outer

              const kind = (event as unknown as { kind: string }).kind
              if (PUBLIC_TERMINAL_EVENT_KINDS.has(kind as PublicExecutionEvent['kind'])) {
                terminal = true
                break outer
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      if (terminal || signal?.aborted) break

      // Connection dropped — reconnect if opted in; otherwise SSE is exhausted
      if (connectionDropped && reconnect) continue
      sseExhausted = true
    }

    if (terminal || signal?.aborted) return

    // auto fallback to poll
    if (mode === 'auto' && sseExhausted) {
      options?.onStreamModeChange?.('poll')
      yield* this._pollStream(signal, pollIntervalMs, deadline)
    }
  }

  private async *_pollStream(
    signal: AbortSignal | undefined,
    pollIntervalMs: number,
    deadline: number,
  ): AsyncIterable<PublicExecutionEvent> {
    let seq = 1
    const now = () => new Date().toISOString()

    while (true) {
      if (signal?.aborted) break

      if (Date.now() >= deadline) {
        throw new RohinikClientError(`Stream timed out`)
      }

      const status = await this.status()
      const state  = status.state

      if (PUBLIC_TERMINAL_STATES.has(state)) {
        const terminalKind =
          state === 'COMPLETED' ? 'EXECUTION_COMPLETED' :
          state === 'CANCELLED' ? 'EXECUTION_CANCELLED' :
          'EXECUTION_FAILED'

        yield _synthEvent(this.executionId, seq++, terminalKind, {}) as unknown as PublicExecutionEvent
        return
      }

      if (signal?.aborted) break

      await _sleep(pollIntervalMs, signal).catch(() => { /* aborted */ })
    }
  }
}

function _synthEvent(
  executionId: string,
  sequence: number,
  kind: string,
  payload: unknown,
): object {
  return {
    kind,
    sequence,
    executionId,
    occurredAt: new Date().toISOString(),
    cursor: Buffer.from(`${executionId}:${sequence}`).toString('base64url'),
    payload,
  }
}

function _sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new RohinikClientError('Poll aborted via AbortSignal'))
    }, { once: true })
  })
}

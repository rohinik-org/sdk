import { HttpTransport, type TransportOptions } from './transport.js'
import { ExecutionsResource } from './executions-resource.js'

export interface RohinikClientOptions {
  readonly baseUrl?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
}

export class RohinikClient {
  readonly executions: ExecutionsResource
  private readonly transport: HttpTransport

  constructor(options: RohinikClientOptions = {}) {
    this.transport = new HttpTransport({
      baseUrl:   options.baseUrl ?? 'http://localhost:8080',
      headers:   options.headers,
      timeoutMs: options.timeoutMs,
    } satisfies TransportOptions)
    this.executions = new ExecutionsResource(this.transport)
  }
}

export function createRohinikClient(options?: RohinikClientOptions): RohinikClient {
  return new RohinikClient(options)
}

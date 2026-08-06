import type {
  SubmitExecutionRequest,
  SubmitExecutionResponse,
} from '@rohinik-org/execution-protocol-v1'
import type { HttpTransport } from './transport.js'
import { ExecutionHandle } from './execution-handle.js'

export class ExecutionsResource {
  constructor(private readonly transport: HttpTransport) {}

  async start(request: SubmitExecutionRequest): Promise<ExecutionHandle> {
    const response = await this.transport.request<SubmitExecutionResponse>(
      'POST',
      '/v1/executions',
      request,
    )
    return new ExecutionHandle(response.executionId, this.transport)
  }

  /** Attach to an existing execution by ID without making a network call. */
  attach(executionId: string): ExecutionHandle {
    return new ExecutionHandle(executionId, this.transport)
  }
}

import type {
  ExecutionStatusResponse,
  ExecutionResultResponse,
  ExecutionEvidenceResponse,
  CancelExecutionRequest,
  CancelExecutionResponse,
} from '@rohinik-org/execution-protocol-v1'
import type { HttpTransport } from './transport.js'

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
}

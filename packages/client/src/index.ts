export { createRohinikClient, RohinikClient } from './client.js'
export type { RohinikClientOptions } from './client.js'
export { ExecutionHandle } from './execution-handle.js'
export { ExecutionsResource } from './executions-resource.js'
export { RohinikClientError, ProtocolVersionError } from './transport.js'

// Re-export protocol types callers need — these come from the packed artifact
export type {
  SubmitExecutionRequest,
  SubmitExecutionResponse,
  ExecutionStatusResponse,
  ExecutionResultResponse,
  CancelExecutionRequest,
  CancelExecutionResponse,
  ExecutionEvidenceResponse,
  EvidenceEntry,
  PublicExecutionState,
  PublicErrorEnvelope,
  PublicErrorCode,
} from '@rohinik-org/execution-protocol-v1'
export { EXECUTION_PROTOCOL_VERSION } from '@rohinik-org/execution-protocol-v1'

# STAGE-16-CLOSURE — Rohinik Developer Platform: Full Stage Closure

**Date:** 2026-08-11  
**Author:** sritamsarkar  
**Status:** FROZEN

---

## Preamble

This document constitutionally closes the Stage 16 program. It records what was built, the invariants that were established, and the exact boundary at which Stage 16 ends and the Beta release sequence begins.

Stage 16 was not a single feature. It was a six-part program to build the externally consumable developer platform for Rohinik — from the lowest-level async execution wire protocol through the full authoring and distribution toolchain. This document closes that program.

---

## The Stage 16 Program

```
16A  Async Execution Protocol
 │   Objective: establish the minimum viable async execution contract
 │   Result: wire protocol, execution lifecycle, SSE events, evidence
 │
16B  Streaming, Cancellation, and Cursor-Based Reconnect
 │   Objective: add streaming partial output, graceful cancellation, reconnect
 │   Result: SSE stream events, cursor protocol, cancel endpoint, disconnection safety
 │
16C  Typed Results and Schema Validation
 │   Objective: server-validated typed output with schema binding
 │   Result: output field, schema registry, typed execution pipeline, hash verification
 │
16D  Agent and Delegation SDK
 │   Objective: public agent/delegation SDK without RS1 internal exposure
 │   Result: AgentHandle/RunHandle/DelegationHandle, typed delegation, delegateMany(),
 │            14 agent routes, dogfood migration of repo-engineer
 │
16E  Control Plane for AI Mutation Authority
 │   Objective: governed mutation — approval, apply, verify, recover
 │   Result: ControlWorkflowState machine (13 states), approval binding, verification
 │            contract, recovery safety rules, control SDK, dogfood migration
 │
16F  Distribution, CLI, and Developer Authoring Platform
 │   Objective: external developer platform — install, run, author, validate, pack
 │   Result: install-manifest schema, CLI (15 commands), ROHINIK_HOME isolation,
 │            4 authoring SDKs, testing fixtures, 4 templates, 7 examples,
 │            clean-install conformance gate (46/46)
 ▼
PUBLIC ROHINIK DEVELOPER PLATFORM
```

---

## What an External Developer Can Now Do

A developer with no access to this repository, starting from `npm install -g @rohinik-org/cli`:

### Install and operate a runtime

```bash
rohinik install --artifact bundle.tgz --bundle ./runtime --manifest runtime.json
rohinik start
rohinik status
rohinik doctor
rohinik stop
```

They can configure providers without embedding secrets:

```yaml
# rohinik.yaml
providers:
  anthropic:
    apiKeyEnv: ANTHROPIC_API_KEY   # env var name, never the value
```

```bash
rohinik provider configure anthropic --api-key-env ANTHROPIC_API_KEY
rohinik config validate
rohinik config show   # prints config with secrets redacted
```

### Execute work

```typescript
const client = createRohinikClient({ baseUrl: 'http://localhost:8080' })

// Async: submit and wait
const result = await client.executions.start({ content: 'summarise this', contentType: 'TEXT' }).waitForResult()

// Stream: consume partial output as it arrives
for await (const event of client.executions.start({ ... }).events()) {
  if (event.kind === 'EXECUTION_PROGRESS') console.log(event.payload.partial)
  if (event.kind === 'EXECUTION_COMPLETED') break
}

// Cancel
const handle = client.executions.start({ ... })
await handle.cancel()

// Reconnect from cursor
const events = client.executions.events({ after: lastCursor })
```

### Request typed output

```typescript
const result = await client.executions
  .start({ content, contentType: 'TEXT', outputSchema: 'word-count-v1' })
  .waitForResult()

const count = (result.output as WordCountOutput).count
```

### Use agents

```typescript
import { admit, createAgentClient } from '@rohinik-org/agent'

const agent = await admit(instanceId, { baseUrl })
const run   = await agent.start()
const del   = await run.delegate({ delegateeRunId, taskId, grantedCapabilities })
await del.accept()
const execution = await del.run({ content })
await del.acceptResult()

const evidence = await run.evidence()
```

### Perform governed mutations

```typescript
import { createControlClient } from '@rohinik-org/control'

const ctl      = createControlClient(baseUrl)
const artifact = await ctl.artifacts.create({ content: patchBytes, contentType: 'application/patch' })
const approval = await artifact.approve({ scope, actionType, expiresAt })
const workflow = await ctl.workflows.create(artifact.id, { idempotencyKey })
const checkpoint = await captureCheckpoint()

await workflow.apply({ approvalId: approval.id, checkpoint, applyRecord })
await workflow.verify({ status: VerificationStatus.PASSED, exitCode: 0, ... })
// On failure:
await workflow.recover({ strategy: RecoveryStrategy.REVERSE_PATCH, ... })
```

### Extend Rohinik

```bash
# Scaffold
rohinik dev create capability my-cap
cd my-cap && npm install && npm test

# Validate and pack
rohinik dev validate --entry dist/package-definition.js   # → ✓ Valid
rohinik dev pack --entry dist/package-definition.js       # → ✓ Packed my-cap-0.1.0.rpk
```

```typescript
// src/index.ts
export const myCapability = defineCapability({
  id: 'example:my-capability',
  execute: async (ctx, input) => {
    return result({ answer: input.question.toUpperCase() })
  },
})

// test/index.test.ts — no network required
const ctx = createTestCapabilityContext()
const res = await myCapability.execute(ctx, { question: 'hello' })
expect((res as CapabilityResult<unknown>).value).toEqual({ answer: 'HELLO' })
```

---

## The Invariant Chain

The following invariants were established across Stage 16 and are frozen permanently. They describe the constitutional structure of the Rohinik developer platform.

### Execution invariants (16A–16C)

**Execution is asynchronous by contract.** There is no synchronous execution path in the protocol. Every execution is submitted (202 Accepted), tracked by ID, and polled or streamed to completion.

**Observation does not equal cancellation.** Closing an SSE stream, disconnecting a client, or losing a network connection does not cancel the execution. Cancellation requires an explicit `POST /v1/executions/:id/cancel`.

**Terminal state is final.** An execution that has reached COMPLETED, FAILED, or CANCELLED cannot transition to any other state.

**Schema validation is server-authoritative.** Output type binding happens server-side. Client-side hash verification is advisory. The caller assertion `T` in `TypedResult<T>` is not a proof.

### Agent and delegation invariants (16D)

**SDK convenience does not create runtime authority.** `admit()`, `start()`, `delegate()` are choreography helpers. Each call maps 1:1 to a server route. No implicit authority is granted by calling a helper.

**Identity ≠ admission ≠ execution.** Having an `instanceId` does not mean an agent is admitted. Being admitted does not mean a run has started. Being RUNNING does not mean execution has been submitted.

**Delegation cannot amplify authority or budget.** Granted capabilities, actions, depth, cost, latency, and token limits are hard-capped at the delegator's current values at the server.

**Child execution completion ≠ delegated-result acceptance.** The delegator must call `delegation.acceptResult()` explicitly. Until then, the parent run remains DELEGATING.

### Control plane invariants (16E)

**approve ≠ apply.** An approval record binds a content hash to a scope. It does not authorise any actor to apply. Applying requires presenting the approvalId at the apply boundary where the server re-derives the binding.

**apply ≠ verify.** Reaching APPLIED state demonstrates that the patch was accepted by the apply mechanism. It does not demonstrate that the resulting working tree is correct.

**VERIFICATION_FAILED ≠ rollback authority.** A failed verification does not grant the system authority to reverse its own mutation. Recovery requires an explicit strategy from an operator.

**Content hash is server-authoritative.** `ApprovalBinding.contentHash` is derived from the stored artifact, not from any caller-supplied value.

### Distribution and authoring invariants (16F)

**Authoring does not confer authority.** A `PackageDefinition` is a declaration, not a credential.

**Packaging does not confer trust.** `rohinik dev pack` produces an `.rpk` with `status: "unpublished"`. An unpublished package is not installable, not trusted, and not admissible.

**Installation does not bypass admission.** The admission act is a downstream gate not defined in Stage 16F.

**`packed ≠ published ≠ trusted ≠ installed`.** Four distinct lifecycle states. No code path in Stage 16F collapses or shortcuts any of these transitions.

**ROHINIK_HOME is the complete isolation boundary.** All runtime state lives under one developer-chosen directory. Multiple ROHINIK_HOME instances on one machine are fully independent.

**Secrets are never stored in config files.** Provider configuration records `apiKeyEnv` (an environment variable name), never the secret value.

---

## Stage 16 Test Evidence Summary

| Stage | Key test suite | Tests passing |
|-------|---------------|---------------|
| 16A | execution-conformance.test.ts (RS1) | ✓ |
| 16B | sse-events.test.ts, streaming-conformance.test.ts (RS1) | ✓ |
| 16C | typed-output-conformance.test.ts (RS1) | ✓ |
| 16D | agent-conformance.test.ts (RS1), agent-sdk live (24), boundary external (1) | ✓ |
| 16E | control-conformance (31), control-sdk-live (14), control-attack (34), boundary4 (1) | ✓ |
| 16F — template gate | packages/testing/src/__tests__/template-gate.test.ts | 32/32 |
| 16F — examples gate | packages/testing/src/__tests__/examples-gate.test.ts | 32/32 |
| 16F — T11 clean install | packages/cli/src/__tests__/t11-clean-install.test.ts | **46/46** |
| SDK packages total | all passing packages | **378 tests** |

The T11 clean-install gate is the definitive end-to-end conformance proof: isolated ROHINIK_HOME, real runtime binary, no RS1 source references, 8 phases from install through stale PID cleanup, all 16A–16E compat floors re-verified in-process.

---

## Stage 16 Closure Checklist

### 16A — Async Execution Protocol

- [x] Wire protocol: 202 Accepted, executionId, state field, terminal flag
- [x] Execution lifecycle: QUEUED → RUNNING → COMPLETED/FAILED/CANCELLED
- [x] Evidence: per-execution audit log, `/v1/executions/:id/evidence`
- [x] Idempotency: idempotency key; second submission with same key returns same executionId
- [x] Protocol version field on all submission responses

### 16B — Streaming, Cancellation, Cursor

- [x] SSE event stream: `/v1/executions/:id/events`
- [x] Events carry: `kind`, `executionId`, `sequence`, `occurredAt`, `cursor`, `payload`
- [x] Events are monotonically ordered by sequence
- [x] Cursor-based reconnect: `?after=<cursor>` replays only subsequent events
- [x] Cancel: `POST /v1/executions/:id/cancel` → 200 or 409 (never 404 for known execution)
- [x] Disconnection invariant: closing SSE stream does not cancel execution

### 16C — Typed Results and Schema Validation

- [x] Result endpoint: `GET /v1/executions/:id/result` — `output` field present
- [x] `totalDurationMs` field present
- [x] Server-side schema validation gate

### 16D — Agent and Delegation SDK

- [x] 14 agent/delegation HTTP routes
- [x] `@rohinik-org/agent-sdk` public surface: no RS1 internal imports
- [x] `delegateMany()` bounded fan-out helper
- [x] SSE events carry `payload` field (16D compat floor)
- [x] `repo-engineer` dogfood migration complete

### 16E — Control Plane

- [x] 13-state workflow machine: DRAFT → APPLIED → VERIFIED / VERIFICATION_FAILED / RECOVERED
- [x] Approval binding: server-derived content hash, no caller override
- [x] Verification contract: exit code 0 ≠ PASSED
- [x] Recovery safety: RESTORE_CHECKPOINT gated on clean checkpoint
- [x] Three-boundary conformance: mock fetch (34) + live SDK (14) + packed consumer (1)
- [x] `repo-engineer` dogfood migration: local sidecar files removed

### 16F — Distribution, CLI, Authoring

- [x] Install-manifest schema frozen (`@rohinik-org/install-manifest` 0.1.0)
- [x] SHA-256 artifact integrity check at install time
- [x] ROHINIK_HOME directory layout frozen
- [x] CLI: 15 commands, all implemented and gate-tested
- [x] Doctor: 14 checks, covers all failure modes from no-install through live health probe
- [x] Configuration: YAML schema, secret boundary enforced, `config show` redacts
- [x] Provider configuration: `apiKeyEnv` pattern, no secret storage
- [x] 4 authoring SDKs: capability, agent, provider, package (all 0.16.0)
- [x] `@rohinik-org/testing` 0.16.0: 7 public fixtures, 6 vendored tarballs
- [x] 4 project templates: gate-verified (32/32), no workspace links
- [x] 7 examples: gate-verified (32/32), no RS1 refs, examples 06+07 with validate+pack+rpk
- [x] QUICKSTART.md: published
- [x] T11 clean install: 46/46, Windows-native, isolated ROHINIK_HOME, IPC isolation
- [x] `.rpk` constitutional invariant: `status: "unpublished"` in all packed artifacts
- [x] `.rpk` determinism: two pack runs of the same source produce identical `contentHash`
- [x] IPC isolation: per-ROHINIK_HOME socket derivation, no inter-instance collision

---

## What Stage 16 Does Not Include

This is the explicit boundary. These items are **not** defined in Stage 16 and are not implied by it:

| Item | Status |
|------|--------|
| Package admission into a runtime | Not in Stage 16F — downstream gate |
| Published package registry | Not in Stage 16 |
| Release signing and provenance | Not in Stage 16 |
| npm publication of SDK packages | Not in Stage 16 |
| Repository preparation for public release | Not in Stage 16 |
| Licensing review | Not in Stage 16 |
| Container smoke test | Not in Stage 16F — Beta limitation, recorded in T11 |
| Production runtime hosting | Not in Stage 16 |
| Multi-tenant isolation | Not in Stage 16 |
| Billing and rate limiting | Not in Stage 16 |

None of these gaps block the developer-experience readiness that Stage 16 was designed to establish.

---

## Beta Readiness Statement

Stage 16 establishes Rohinik's externally consumable developer platform and satisfies the technical developer-experience prerequisites for Beta packaging.

This statement is precise. It does not assert that Rohinik is ready for production deployment, commercial release, or public npm publication. Those acts require publication infrastructure, release signing, licensing and repository preparation, and release operations that sit outside Stage 16's scope.

What it asserts is this:

A developer outside this repository, using only published `@rohinik-org/*` packages and a distributed runtime bundle, can now:

- Install and operate a Rohinik runtime
- Execute work asynchronously, stream it, cancel it, reconnect to it
- Request typed, schema-validated output
- Use the agent and delegation SDK
- Perform governed mutations through the control plane
- Author, test, validate, and pack capabilities, agents, and providers
- Do all of the above without touching RS1 source, without workspace links, and without any RS1-internal package import

This is what Stage 16 was built to prove. The T11 clean-install conformance gate is the evidence.

---

## Post-Stage-16 Sequence

The next conversation should address the Beta release sequence, not Stage 16G. Stage 16 is closed.

The open questions for the post-Stage-16 sequence include:

- Package publication pipeline (`@rohinik-org/*` on npm)
- Runtime distribution hosting and release signing
- Repository structure for public consumption
- Licensing
- Admission gate (the downstream step that `packed ≠ trusted` points to)
- Beta release operations

None of these require changes to any Stage 16 artifact. If an issue in the Beta release preparation reveals a defect in the Stage 16 platform, it will be addressed with a targeted fix and a new AFS, not a reopened Stage 16.

---

## Frozen Artifact Registry

| Artifact | Location | Status |
|----------|----------|--------|
| AFS-016A.md | `rs1/AFS-016A.md` | FROZEN |
| AFS-016B.md | `rs1/AFS-016B.md` | FROZEN |
| AFS-016C.md | `rs1/AFS-016C.md` | FROZEN |
| AFS-016D.md | `rs1/AFS-016D.md` | FROZEN |
| AFS-016E.md | `rs1/docs/stage-closures/AFS-016E.md` | FROZEN |
| AFS-016F.md | `sdk/AFS-016F.md` | FROZEN |
| stage-16f-evidence.json | `sdk/stage-16f-evidence.json` | FROZEN |
| STAGE-16-CLOSURE.md | `sdk/STAGE-16-CLOSURE.md` | FROZEN |

Stage 16 is closed.

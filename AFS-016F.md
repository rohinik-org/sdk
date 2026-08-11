# AFS-016F — Distribution, CLI, and Developer Authoring Platform

**Stage:** 16F  
**Status:** FROZEN  
**Date:** 2026-08-11  
**Author:** sritamsarkar

---

## 1. Stage Objectives

Stage 16F delivered the complete externally consumable Rohinik developer platform: runtime distribution, CLI lifecycle, configuration/secret boundary, developer authoring toolchain, testing fixtures, project templates, examples, and a clean-install conformance gate.

The concrete objectives were:

1. Define and freeze the install-manifest schema: `@rohinik-org/install-manifest` — runtime distribution contract, platform bundle format, integrity hash algorithm, CLI compatibility floor, protocol version declarations.
2. Ship the `@rohinik-org/cli` package: `install`, `start`, `stop`, `status`, `version`, `runtime list`, `config`, `provider`, `doctor`, `dev create`, `dev validate`, `dev pack`.
3. Establish `ROHINIK_HOME` as the canonical isolation boundary. All runtime state lives under a single, per-developer directory. No global shared state.
4. Establish the configuration/secret boundary: all provider secrets referenced via environment variable names (`secretRefs`), never embedded in config files or manifest blobs.
5. Ship `@rohinik-org/capability-sdk`, `@rohinik-org/agent-sdk`, `@rohinik-org/provider-sdk`, `@rohinik-org/package-sdk`: external authoring surfaces with no RS1 internal imports.
6. Ship `@rohinik-org/testing` — deterministic fixtures (`createMockExecutionClient`, `ExecutionEventBuilder`, `createTestCapabilityContext`, `createTestProviderContext`, `assertValidCapability`, `assertValidProvider`, `assertValidPackage`) for offline unit testing without a live runtime.
7. Produce four project templates (app, capability, agent, provider) via `rohinik dev create`, verified clean via template gate (T9, 32/32 tests).
8. Produce seven annotated examples (01–07) covering all five capability surfaces, verified clean via examples gate (T10, 32/32 tests).
9. Publish `QUICKSTART.md` — external developer onboarding guide.
10. Close the end-to-end Beta gate: T11 clean-install + runtime conformance (46/46 tests, isolated ROHINIK_HOME, real runtime binary, 8 phases).

All ten objectives are complete.

---

## 2. Constitutional Invariants

The following invariants are frozen as constitutional law for 16F and all subsequent stages. All prior boundaries (16A/16B/16C/16D/16E) remain in full effect.

| # | Invariant |
|---|-----------|
| 27 | **Authoring does not confer authority.** Writing a capability, agent, or provider definition does not grant any permission to invoke, install, or trust it. A `PackageDefinition` is a declaration, not a credential. |
| 28 | **Packaging does not confer trust.** `rohinik dev pack` produces an `.rpk` with `status: "unpublished"`. An unpublished package is not installable, not trusted, and not admissible into any runtime. |
| 29 | **Installation does not bypass admission.** A runtime explicitly admitting a package is a separate act from packaging it. The admission act is not defined in Stage 16F; it is a downstream gate. |
| 30 | **`packed ≠ published ≠ trusted ≠ installed`.** These are four distinct lifecycle states. No code path in 16F collapses or shortcuts any of these transitions. |
| 31 | **ROHINIK_HOME is the complete isolation boundary.** All runtime state, config, installed runtimes, process records, logs, and package registrations live under the single ROHINIK_HOME directory. No global directories, no per-user registry, no OS-level shared state. Multiple ROHINIK_HOME instances on one machine are fully independent. |
| 32 | **Secrets are never stored in config files.** Provider configuration records `apiKeyEnv` (an environment variable name), never the key value. Secret resolution happens at runtime from the process environment. No secret value persists to disk in any 16F artifact. |
| 33 | **`.rpk` integrity is server-authoritative at admission time.** `rohinik-integrity.json` records the content hash of the packed artifact. The admitting runtime verifies this hash independently. The packing tool cannot produce a hash that pre-authorises admission. |
| 34 | **SDK authoring packages do not import RS1 runtime internals.** `@rohinik-org/capability-sdk`, `@rohinik-org/agent-sdk`, `@rohinik-org/provider-sdk`, `@rohinik-org/package-sdk`, `@rohinik-org/testing` may not import from any RS1-internal package. External consumer isolation is verified by the template gate and examples gate (zero `workspace:*` links in installed package-lock.json). |
| 35 | **IPC isolation is per-ROHINIK_HOME.** The spawned runtime's named pipe path (Windows) or Unix socket path is derived deterministically from ROHINIK_HOME. Concurrent `rohinik start` instances with different ROHINIK_HOME values will never share or collide on an IPC channel. |

---

## 3. Runtime Distribution Contract

### Manifest Schema — `@rohinik-org/install-manifest`

**Package version:** 0.1.0  
**Schema version constant:** `MANIFEST_SCHEMA_VERSION` (string, current value recorded in source)

| Field | Type | Notes |
|-------|------|-------|
| `schemaVersion` | string | Must equal `MANIFEST_SCHEMA_VERSION` |
| `runtimeVersion` | string | Semver — identifies the installed runtime bundle |
| `releaseChannel` | `"stable" \| "beta" \| "dev"` | Distribution tier |
| `platform` | `{ os, arch }` | Target platform |
| `entrypoint` | string | Relative path within the bundle to the main JS file |
| `protocols` | `{ execution, agent, control }` | Semver strings, each independently versioned |
| `integrity` | `{ algorithm: "sha256", artifactHash }` | SHA-256 hex of the distribution artifact |
| `config` | `{ schemaVersion, defaultFile }` | Runtime config schema reference |
| `minimumRequirements` | `{ node }` | Node.js version range |
| `cliCompatibility` | `{ minCliVersion }` | Minimum CLI version that can manage this runtime |
| `installedAt` | ISO 8601 string | Timestamp written at install time |
| `includedPackages` | array | Built-in packages (empty for bare runtime) |

**Integrity invariant:** `install()` derives the SHA-256 hash of the artifact bytes before extracting the bundle. If the derived hash does not match `manifest.integrity.artifactHash`, installation is rejected and the active version pointer is not updated.

### ROHINIK_HOME Directory Layout

```
$ROHINIK_HOME/
├── config/
│   └── rohinik.yaml          # user-managed config file
├── runtimes/
│   └── <version>/            # one directory per installed runtime
│       ├── bin/rhks.js       # runtime entrypoint
│       └── ...               # bundle files
├── state/
│   ├── active-version.txt    # currently active runtime version
│   ├── process.json          # running process record (pid, endpoint, ...)
│   └── manifests/
│       └── <version>.json    # installed manifest per version
├── packages/                 # admitted packages (downstream gate)
└── logs/                     # runtime stdout/stderr (future)
```

### IPC Socket Derivation

On Windows: `\\.\pipe\rohinik-<sha1(ROHINIK_HOME)[0:8]>`  
On Unix: `/tmp/rohinik-<sha1(ROHINIK_HOME)[0:8]>.sock`

Deterministic per ROHINIK_HOME. No two distinct ROHINIK_HOME paths can produce the same socket name (collision probability negligible for the number of developer machines in scope).

---

## 4. CLI Command Inventory

All commands resolved from `@rohinik-org/cli` version 0.16.0.

| Command | Synopsis | Effect |
|---------|----------|--------|
| `rohinik install` | `--artifact <file> --bundle <dir> --manifest <path>` | Verifies SHA-256 integrity, extracts bundle, writes manifest, updates active pointer |
| `rohinik start` | `[--config <path>]` | Spawns runtime, waits for `/v1/health READY`, writes process record |
| `rohinik stop` | | Sends SIGTERM to recorded PID, removes process record |
| `rohinik status` | | Reads process record, probes `/v1/health`, prints status + PID + endpoint + latency |
| `rohinik version` | | Prints CLI version, runtime version, all three protocol versions |
| `rohinik runtime list` | | Lists all installed runtime versions from `$ROHINIK_HOME/runtimes/` |
| `rohinik config path` | `[--config <file>]` | Resolves and prints config file path |
| `rohinik config validate` | `[--config <file>]` | Validates config YAML schema |
| `rohinik config show` | `[--config <file>]` | Prints config with secrets redacted |
| `rohinik provider list` | `[--config <file>]` | Lists configured providers, secret resolution status |
| `rohinik provider configure` | `<name> --api-key-env <VAR> [--base-url <url>]` | Adds/updates provider entry in config |
| `rohinik doctor` | `[--config <file>]` | Runs all diagnostic checks; exits 1 if any FAIL |
| `rohinik dev create` | `<app\|capability\|agent\|provider> [dir]` | Scaffolds project from template |
| `rohinik dev validate` | `[--entry <file>]` | Validates a `PackageDefinition` export |
| `rohinik dev pack` | `[--entry <file>] [--output <file>] [--packed-by <str>]` | Produces `.rpk` with `status: "unpublished"` |

Global option: `--home <path>` overrides ROHINIK_HOME on any command.

---

## 5. Doctor Check Inventory

`rohinik doctor` runs the following checks in order. Each check returns one of: `PASS`, `FAIL`, `WARN`, `SKIP`.

| Check name | What it verifies |
|------------|-----------------|
| `Runtime installation` | Active version exists; version directory present |
| `Manifest integrity` | Manifest readable; passes schema validation |
| `CLI compatibility` | CLI version satisfies `manifest.cliCompatibility.minCliVersion` |
| `Configuration` | Config file discoverable; parses; passes schema validation |
| `Environment variables` | All `secretRefs` in config have corresponding env vars set |
| `Runtime process` | Process record exists; PID is alive |
| `Health` | `/v1/health` reachable; status is READY or HEALTHY |
| `Protocol execution` | `manifest.protocols.execution` readable |
| `Protocol agent` | `manifest.protocols.agent` readable |
| `Protocol control` | `manifest.protocols.control` readable |
| `Provider <name> configuration` | Per-provider: secret refs resolved |
| `Provider <name> readiness` | Per-provider: health probe response |
| `Storage` | ROHINIK_HOME accessible |
| `Packages` | Package directory readable |

---

## 6. Configuration and Secret Boundary

### rohinik.yaml Schema (canonical fields)

```yaml
version: "1.0"
runtime:
  routing:
    mode: balanced | fast | quality | custom
    explain: bool
  logLevel: error | warn | info | debug
server:
  port: <number>
  host: <string>
providers:
  <name>:
    apiKeyEnv: <ENV_VAR_NAME>      # env var name only — never the value
    baseUrl: <url>                  # optional
extensions:
  paths: []
```

**Invariant:** No provider secret value ever appears in `rohinik.yaml`. Only the name of the environment variable that holds the secret. The `config show` command redacts any value that looks like a secret before printing.

---

## 7. Capability / Agent / Provider Authoring Boundaries

### Package authoring surface (`@rohinik-org/package-sdk` 0.16.0)

| Export | Kind |
|--------|------|
| `PackageDefinition` | interface |
| `definePackage` | factory |
| `packPackage` | pack function — produces `.rpk` bytes |
| `validatePackageDefinition` | validator |
| `PackageIntegrityManifest` | `{ status: "unpublished", contentHash, ... }` |

### Capability authoring surface (`@rohinik-org/capability-sdk` 0.16.0)

| Export | Kind |
|--------|------|
| `CapabilityDefinition<I, O>` | interface |
| `defineCapability` | factory |
| `CapabilityContext` | execution context interface |
| `CapabilityResult<T>` | `{ value: T, evidence?, warnings? }` |
| `result()` | result constructor |
| `validateCapabilityDefinition` | validator |

**Capability ID rule:** `namespace:name` — reverse-domain namespace with no dots. `example:text-echo` ✓. `com.example:text-echo` ✗.

### Agent authoring surface (`@rohinik-org/agent-sdk` 0.16.0)

| Export | Kind |
|--------|------|
| `AgentDefinition` | interface |
| `defineAgent` | factory |
| `AgentContext` | execution context interface |
| `validateAgentDefinition` | validator |

### Provider authoring surface (`@rohinik-org/provider-sdk` 0.16.0)

| Export | Kind |
|--------|------|
| `ProviderDefinition` | interface |
| `defineProvider` | factory |
| `ProviderContext` | execution context interface |
| `ProviderHealth` | `{ status: "HEALTHY" \| "DEGRADED" \| "UNAVAILABLE" }` |
| `validateProviderDefinition` | validator |

**Provider secret rule:** Secrets are declared as `secretRefs` in the `ProviderDefinition`. They are resolved from environment variables at runtime. No secret value is ever stored in the definition object.

---

## 8. `.rpk` Semantics

An `.rpk` file is a gzip-compressed tar archive containing:

| Entry | Content |
|-------|---------|
| `rohinik-integrity.json` | `{ status: "unpublished", contentHash, algorithm, packedAt, packedBy? }` |
| `package-definition.js` | The compiled `PackageDefinition` export |
| `package.json` | Package metadata |

**Production of an `.rpk` by `rohinik dev pack` does not:**
- Publish the package
- Register it with any runtime
- Grant it any trust
- Make it installable

**The `.rpk` is deterministic:** Two invocations of `rohinik dev pack` on the same built source produce `.rpk` files with identical `contentHash` values (verified by T11 Phase 7 determinism test).

---

## 9. Testing and Template Platform

### `@rohinik-org/testing` 0.16.0 — offline test fixtures

| Export | Purpose |
|--------|---------|
| `createMockExecutionClient` | Deterministic execution mock; no network required |
| `ExecutionEventBuilder` | Builds typed SSE event sequences: `goldenPath()`, `streamingPath(chunks)`, `delegationPath(id, agentId)`, `controlApprovalPath(wf, cp)`, `controlApprovalPending()`, `controlApproved()` |
| `createTestCapabilityContext` | Injects a `CapabilityContext` for unit testing capability execute handlers |
| `createTestProviderContext` | Injects a `ProviderContext` for unit testing provider execute handlers |
| `assertValidCapability` | Validates a `CapabilityDefinition` — throws on invalid |
| `assertValidProvider` | Validates a `ProviderDefinition` — throws on invalid |
| `assertValidPackage` | Validates a `PackageDefinition` — throws on invalid |

### Project Templates (4 total)

Each template is scaffolded by `rohinik dev create <kind> [dir]`:

| Template | Files scaffolded | No RS1 references |
|----------|-----------------|-------------------|
| `app` | `package.json`, `tsconfig.json`, `src/index.ts`, `test/index.test.ts` | Verified by T9 gate |
| `capability` | `package.json`, `tsconfig.json`, `src/index.ts`, `src/package-definition.ts`, `test/index.test.ts` | Verified by T9 gate |
| `agent` | `package.json`, `tsconfig.json`, `src/index.ts`, `src/package-definition.ts`, `test/index.test.ts` | Verified by T9 gate |
| `provider` | `package.json`, `tsconfig.json`, `src/index.ts`, `src/package-definition.ts`, `test/index.test.ts` | Verified by T9 gate |

### Examples (7 total)

Each example is a self-contained npm project with tests:

| Directory | Surfaces exercised |
|-----------|--------------------|
| `01-hello-execution` | `createRohinikClient`, `executions.start()`, `waitForResult()` |
| `02-streaming-execution` | `ExecutionHandle.events()`, SSE streaming, partial output |
| `03-typed-output` | Typed result extraction, output field binding |
| `04-agent-delegation` | Agent delegation events, `traceDelegations()` |
| `05-governed-mutation` | Control approval checkpoints, `traceGovernedExecution()` |
| `06-custom-capability` | `defineCapability`, `rohinik dev validate`, `rohinik dev pack`, `.rpk` verification |
| `07-custom-provider` | `defineProvider`, health checks, secret ref enforcement, `.rpk` verification |

---

## 10. Clean-Install Evidence (T11)

**Test location:** `packages/cli/src/__tests__/t11-clean-install.test.ts`  
**Result:** 46/46 passed  
**Commit:** `92a979d`

| Phase | Tests | Description |
|-------|-------|-------------|
| 1 — Install | 10 | Manifest hash, active pointer, reinstall safety, config separation, no RS1 refs |
| 2 — Start | 3 | Real process spawn, PID alive, process record written, duplicate guard |
| 3 — Health | 4 | HTTP health endpoint, doctor checks (installation, process, health), no secret leakage |
| 4 — Execute | 6 | 202 accepted, terminal poll, result output, idempotency, 400 and 404 error paths |
| 5 — SSE stream | 5 | ACCEPTED first, terminal event, field structure, ordering, cursor reconnect |
| 6 — 16A–16E compat floors | 8 | runtime identity (16A), protocolVersion (16B), output field (16C), payload (16D), evidence (16E), cancel (16E) |
| 7 — Dev authoring | 4 | create capability/provider (no workspace links), validate + pack + deterministic .rpk hash |
| 8 — Stop + stale PID | 6 | stop removes record, STOPPED status, STALE_PROCESS_RECORD, stale record cleared |

**Windows portability evidence:** IPC socket derived from `sha1(ROHINIK_HOME)[0:8]`. Named pipe `\\.\pipe\rohinik-<hash>` passes without EADDRINUSE collision across concurrent test runs. Verified by T11 Phase 2.

**Container smoke path:** Not implemented. Runtime bundle is not containerised. Recorded as Beta limitation; no blocker for developer-platform release gate.

---

## 11. Gate Checklist

- [x] T1 — Install manifest contract and SDK (`@rohinik-org/install-manifest`)
- [x] T2 — Runtime distribution (`install()`, bundle extraction, hash verification)
- [x] T3 — Runtime lifecycle CLI (`start`, `stop`, `status`, `version`, `doctor`)
- [x] T4 — Local config, provider setup, doctor (`config`, `provider`, all doctor checks)
- [x] T5 — Capability authoring SDK (`@rohinik-org/capability-sdk`)
- [x] T6 — Agent authoring SDK (`@rohinik-org/agent-sdk`)
- [x] T7 — Provider authoring SDK (`@rohinik-org/provider-sdk`)
- [x] T8 — Package authoring SDK (`@rohinik-org/package-sdk`, `.rpk` format)
- [x] T9 — Testing fixtures, project templates, template gate (32/32)
- [x] T10 — Examples (7 total), examples gate (32/32), QUICKSTART.md
- [x] T11 — Clean install + runtime conformance (46/46, isolated ROHINIK_HOME)
- [x] All 16A–16E compat floors verified in-process (T11 Phase 6)
- [x] Zero `workspace:*` dependencies in any external-consumer artifact (template gate + examples gate)
- [x] Zero RS1 source references in CLI package-lock (T11 Phase 1)
- [x] Secret boundary enforced end-to-end (config → env var name → runtime env resolution)
- [x] `.rpk` constitutional invariant: `status: "unpublished"` in all packed artifacts
- [x] IPC isolation: per-ROHINIK_HOME socket path, no inter-instance collision
- [x] ROHINIK_IPC_SOCKET env var forwarded by `start()` (RS1 commit `bbe62f8`, SDK commit `92a979d`)

---

## 12. Frozen Constraints for Downstream Stages

1. `MANIFEST_SCHEMA_VERSION` is frozen. Manifest schema changes require a new AFS.
2. `status: "unpublished"` is the only valid `PackageIntegrityManifest.status` value producible by `rohinik dev pack`. No code path produces `"published"` or `"trusted"` without explicit admission by a runtime.
3. `ROHINIK_HOME` directory layout is frozen. Any new subdirectory or state file under ROHINIK_HOME requires a new AFS update.
4. CLI command names and flag signatures are frozen. New commands or flag additions require a new AFS.
5. `@rohinik-org/testing` fixture API is frozen for external consumers. Breaking changes require a new AFS and version bump.
6. Provider `secretRefs` pattern is frozen. Secrets may not be embedded in `ProviderDefinition` objects, config YAML, or `.rpk` artifacts.
7. The constitutional chain `packed ≠ published ≠ trusted ≠ installed` is frozen. No 16F code path may collapse these transitions. The admission gate is a downstream concern.

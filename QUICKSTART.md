# Rohinik SDK — Developer Quickstart

## Prerequisites

- Node.js 18 or later
- npm 9 or later

---

## Install the CLI

```bash
npm install -g @rohinik-org/cli
rohinik --version
```

---

## Run an example

Each example in `examples/` is a self-contained npm project. Pick any one:

```bash
cd examples/01-hello-execution
npm install
npm test
```

All seven examples follow the same pattern:

| Directory | What it covers |
|-----------|----------------|
| `01-hello-execution` | Submit an execution and wait for the result |
| `02-streaming-execution` | Consume partial-output events as they arrive |
| `03-typed-output` | Extract a structured JSON result with schema |
| `04-agent-delegation` | Observe sub-agent delegation in a multi-agent run |
| `05-governed-mutation` | Handle control-approval checkpoints |
| `06-custom-capability` | Author, test, validate, and pack a capability |
| `07-custom-provider` | Author, test, validate, and pack a model provider |

---

## Author a capability

```bash
rohinik dev create capability my-capability
cd my-capability
npm install
npm test
```

Authoring lifecycle:

```
1. Edit src/index.ts
2. npm test
3. npm run validate   # rohinik dev validate
4. npm run pack       # rohinik dev pack
5. Inspect .rpk — status: "unpublished"
```

> **Constitutional invariant:** `packed ≠ published ≠ trusted ≠ installed`
>
> An `.rpk` file produced by `rohinik dev pack` has `status: "unpublished"`.
> It is not installed or trusted until a runtime explicitly admits it.

---

## Author an agent

```bash
rohinik dev create agent my-agent
cd my-agent
npm install
npm test
```

Same lifecycle as a capability. The `rohinik dev validate` and `rohinik dev pack`
steps apply to any project that exports a `PackageDefinition`.

---

## Author a model provider

```bash
rohinik dev create provider my-provider
cd my-provider
npm install
npm test
```

Provider secrets are declared as `secretRefs` in the definition and gated at
runtime — they are never embedded in the `ProviderDefinition` object.

---

## Scaffold an app

```bash
rohinik dev create app my-app
cd my-app
npm install
npm test
```

App projects use `createRohinikClient` and the `@rohinik-org/testing` fixtures
for offline test coverage. Replace the `baseUrl` with your running endpoint.

---

## Capability ID rules

Capability IDs follow `namespace:name` — reverse-domain namespace with no dots:

```
example:text-echo      ✓
com.example:text-echo  ✗  (dots not allowed in capability IDs)
```

Package IDs use reverse-domain format with dots:

```
com.example.my-package  ✓
```

---

## Testing without a runtime

`@rohinik-org/testing` provides deterministic fixtures for offline unit tests:

```typescript
import {
  createMockExecutionClient,
  ExecutionEventBuilder,
  createTestCapabilityContext,
  createTestProviderContext,
  assertValidCapability,
} from '@rohinik-org/testing'

// Exercise a capability execute without a running runtime
const ctx = createTestCapabilityContext()
const result = await myCapability.execute(ctx, { text: 'hello world' })

// Validate the definition
assertValidCapability(myCapability)
```

---

## Next steps

- Read `examples/06-custom-capability/src/index.ts` for a full annotated capability
- Read `examples/07-custom-provider/src/index.ts` for a full annotated provider
- Run `rohinik --help` to see all available commands

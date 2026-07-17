# Contributing to Rohinik

## Prerequisites

- Node.js 20+
- pnpm 9+
- `pnpm install` at repo root

## Build & Test

```bash
pnpm build     # build all packages in dependency order
pnpm test      # run all tests
```

## Package Locations

| Layer | Path | Contents |
|-------|------|----------|
| Compiler | `compiler/` | IR types, schemas, shared interfaces |
| Kernel | `core/kernel/` | Foundation, capability-core |
| Runtime | `core/runtime/` | Execution, orchestration, networking, daemon, artifacts |
| Intelligence | `core/intelligence/` | Planner, observer, acquisition, autonomy, reasoning, reflection, multi-agent |
| Memory | `core/memory/` | Memory engine, knowledge-graph, corpus, recommender |
| Drivers | `core/drivers/` | Anthropic, OpenAI, filesystem, MCP, null-reasoning |
| SDK | `sdk/typescript/` | adapter-sdk, asset-sdk |
| Shell | `shell/` | NL → WorkflowPlan |
| CLI | `cli/` | rhk CLI |
| Tools | `tools/` | Installer, package-manager, asset frontends, benchmark |

## Contribution Guidelines

- Follow existing patterns. Read the relevant AFS-* spec before adding to a subsystem.
- Every non-trivial change needs tests. Run `pnpm test` locally before opening a PR.
- Keep PRs focused. One feature / bugfix per PR.
- Add a `ponytail:` comment when you deliberately simplify (known ceiling, upgrade path).
- Do not add external dependencies without discussion.

## Architecture Specs

Before changing system-level behavior, read the relevant spec in `docs/`:
- `AFS-0001` — Core architecture
- `AFS-0002` — Governance strategy
- ADR-001 through ADR-004 — Key design decisions

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

# BR-1 — Beta Release Audit: Public Release Inventory & Licensing Boundary

**Date:** 2026-08-11  
**Author:** sritamsarkar  
**Baseline:** Stage 16 + BSA-1 (SDK commit `921d08c`, RS1 commit `bbe62f8`)  
**Status:** AUDIT COMPLETE — no publication or visibility changes made

---

## Purpose

Audit-only pre-release inventory covering all artifacts, packages, and third-party dependencies that
would be involved in a Beta release. Identifies P0/P1 blockers that must be resolved before any
`npm publish` or public repository action. Recommends minimum Beta public surface.

---

## 1. Repository Inventory

### 1.1 SDK Repository (`C:/Users/C5182688/Documents/Rohinik/sdk`)

| Item | Value |
|------|-------|
| Root package | `rohinik-sdk` v0.0.0 |
| Root private | `true` |
| License file | `LICENSE` — Apache License 2.0, "Copyright 2026 Rohinik Contributors" |
| Workspace manager | pnpm 9+ |
| Node requirement | ≥22.0.0 |
| Workspace packages | 11 published + 7 examples (private) + 4 templates (no private field) |
| NOTICE file | **ABSENT** |
| `.npmrc` | **ABSENT** |
| `publishConfig` | **ABSENT** on all packages |

### 1.2 RS1 Repository (`C:/Users/C5182688/Documents/rs1`)

| Item | Value |
|------|-------|
| Root package | `rohinik` v0.0.0 |
| Root private | `true` |
| License file | `LICENSE` — Apache License 2.0, "Copyright 2026 Rohinik Contributors" |
| Workspace manager | pnpm |
| Workspace packages | 159 packages under `@rohinik-org/` scope + 1 unscoped app |
| NOTICE file | **ABSENT** |
| `.npmrc` | **ABSENT** |
| `publishConfig` | **ABSENT** on all packages |

---

## 2. SDK Package Inventory

### 2.1 Stage 16 Public Surface (Minimum Beta set)

These 8 packages form the externally consumable developer platform established by Stage 16F.
All are currently **publishable by accident** (no `private: true`, no `publishConfig`) with **no `license` field**.

| Package | Version | Public dep | IR dependency mechanism | Stage |
|---------|---------|-----------|------------------------|-------|
| `@rohinik-org/cli` | 0.16.0 | `@rohinik-org/install-manifest` (vendored tgz) | vendor tgz in `packages/cli/vendor/` | 16F |
| `@rohinik-org/client` | 1.0.0 | none (zero prod deps; protocol bundled) | vendor tgz (devDep only) | 16A–16C |
| `@rohinik-org/capability-sdk` | 0.16.0 | none | vendor tgz (devDep only) | 16F |
| `@rohinik-org/agent-sdk` | 0.16.0 | none | vendor tgz (devDep only) | 16F |
| `@rohinik-org/provider-sdk` | 0.16.0 | none | vendor tgz (devDep only) | 16F |
| `@rohinik-org/package-sdk` | 0.16.0 | none | vendor tgz (devDep only) | 16F |
| `@rohinik-org/testing` | 0.16.0 | none | vendor tgz (devDep only) | 16F |
| `@rohinik-org/install-manifest` | 0.1.0 | none (zero prod deps) | — (RS1 source mirrored into SDK) | 16F |

**Key finding:** All 8 packages have zero runtime production dependencies on external npm packages.
All IR contracts are devDependencies bundled via `file:./vendor/*.tgz`. These packages are
self-contained on publish. The protocol types in `@rohinik-org/client` are inlined by tsup at
build time. This is a clean public surface.

### 2.2 Pre-Stage-16 Packages (NOT in minimum Beta surface)

These packages contain hard `link:` paths to RS1 absolute filesystem paths. They **cannot be
published** in their current state and are not part of the Stage 16 public surface.

| Package | Version | Blocker | Status |
|---------|---------|---------|--------|
| `@rohinik-org/sdk` | 0.15.0 | `link:../../../../rs1/core/runtime/client`, `link:...agent`, `link:...agent-protocol-v1` | **P0 — absolute link paths** |
| `@rohinik-org/adapter-sdk` | 0.15.0 | `link:.../rs1/core/runtime/adapter-ir`, `link:.../rs1/compiler` | **P0 — absolute link paths** |
| `@rohinik-org/asset-sdk` | 0.15.0 | `link:.../rs1/compiler` | **P0 — absolute link paths** |
| `@rohinik-org/sdk-contracts` | 0.15.0 | No external links; depends on adapter-sdk (workspace) | Out of scope for 16F Beta |

These are pre-16 packages not gated in Stage 16F. Not in minimum Beta surface. Deferred to a
future stage.

### 2.3 Examples and Templates

| Artifact | Count | Private field | Status |
|----------|-------|---------------|--------|
| examples (`01`–`07`) | 7 | `"private": true` on all | Correctly gated — no accidental publish risk |
| templates (`app`, `capability`, `agent`, `provider`) | 4 | **ABSENT** (no private field) | **P1 — need `"private": true`** |

Templates are scaffolding sources, not publishable packages. Missing `private: true` means
`pnpm publish` or CI tooling with publish-all would attempt to publish them.

---

## 3. RS1 Package Inventory

### 3.1 Packages Referenced by Published SDK Artifacts

These RS1 packages have their built artifacts vendored into SDK packages. They are distributed
indirectly through the vendor tarballs and never appear as npm registry dependencies.

| RS1 Package | Version | Vendored into |
|-------------|---------|--------------|
| `@rohinik-org/install-manifest` | 0.1.0 | `packages/cli/vendor/` |
| `@rohinik-org/execution-protocol-v1` | 1.0.0 | `packages/client/vendor/` |
| `@rohinik-org/agent-ir` | 0.1.0 | `packages/agent-sdk/vendor/` |
| `@rohinik-org/capability-ir` | 0.1.0 | `packages/capability-sdk/vendor/` |
| `@rohinik-org/capability-manifest` | 0.1.0 | `packages/capability-sdk/vendor/` |
| `@rohinik-org/package-manifest-ir` | 0.1.0 | `packages/provider-sdk/vendor/`, `packages/package-sdk/vendor/` |
| `@rohinik-org/package-sdk` (v0.1.0 predecessor) | 0.1.0 | `packages/package-sdk/vendor/` (self-reference: earlier build) |

These packages need license fields added if they are ever to be published directly. For Beta,
they are consumed only via vendored tarballs — **no immediate P0 blocker on these**, but P1.

### 3.2 RS1 Runtime Bundle (Distribution Artifact)

The runtime bundle is distributed as a tarball artifact, not as an npm package. It is installed via
`rohinik install --artifact <bundle.tgz>`.

| Item | Value |
|------|-------|
| Entry point | `core/runtime/server` — `@rohinik-org/server` v0.1.0 |
| Binary alias | `rhks` → `./dist/bin.js` |
| Only external prod dep | `fastify@^5.0.0` |
| All other deps | 24 `@rohinik-org/workspace:*` packages (internal) |

The runtime bundle is **not** published to npm. It is distributed as a build artifact and installed
by `rohinik install`. License field absence is a gap but does not block the distribution artifact
itself. Fastify is MIT-licensed and has no NOTICE requirements.

### 3.3 RS1 Internal Packages — Classification

| Classification | Count | Examples | Action |
|---------------|-------|---------|--------|
| Should be `private: true` | ~80 | All `*-ir`, `mock-*`, `stage-9k-*`, `*-conformance`, `*-certification` | **P1** — add `private: true` |
| Potentially publishable (future) | ~20 | `@rohinik-org/execution-protocol-v1`, `@rohinik-org/agent-protocol-v1`, `@rohinik-org/control-protocol-v1`, `@rohinik-org/install-manifest`, `@rohinik-org/kernel`, `@rohinik-org/runtime-client` | P1 — needs license field, registry config |
| App — unscoped, should be private | 1 | `repo-engineer` (has `bin` entries) | **P1** — add `private: true` |
| Ambiguous / immature | ~58 | Intelligence, ML, experience, knowledge, provisioning, trust | Defer to future stage |

---

## 4. Third-Party Dependency Inventory

### 4.1 SDK Runtime Dependencies

SDK packages `@rohinik-org/cli`, `@rohinik-org/client`, `@rohinik-org/capability-sdk`,
`@rohinik-org/agent-sdk`, `@rohinik-org/provider-sdk`, `@rohinik-org/package-sdk`,
`@rohinik-org/testing` have **zero external runtime dependencies**. All IR contracts are
devDependencies bundled at build time.

### 4.2 RS1 Runtime Bundle External Dependencies

These are the only external (non-workspace) production dependencies in the RS1 runtime:

| Package | Version | License | NOTICE requirement | Where used |
|---------|---------|---------|-------------------|-----------|
| `fastify` | `^5.0.0` | MIT | None | `core/runtime/server` |
| `@anthropic-ai/sdk` | `^0.39.0` | MIT | None | `core/drivers/anthropic` |
| `js-yaml` | `^4.1.0` | MIT | None | `core/runtime/` (config parsing) |
| `uuid` | `^11.0.0` | MIT | None | `core/runtime/` |
| `zod` | `^3.0.0` | MIT | None | `compiler`, `core/runtime/` |

**All 5 external runtime dependencies are MIT-licensed.** No GPL, no LGPL, no copyleft. No
NOTICE file requirements under MIT. No attribution obligations beyond including the license text
in the distribution.

### 4.3 SDK Dev Dependencies

| Package | Version | License | Used for |
|---------|---------|---------|---------|
| `typescript` | `^5.5.0` | Apache-2.0 | Build/type checking |
| `tsup` | `^8.0.0` | MIT | Build bundler |
| `vitest` | `^1.6.0` | MIT | Test runner |
| `@types/node` | `^22.0.0` | MIT | Node type definitions |

None of these ship in published package artifacts (devDependencies only).

---

## 5. Legal and Publication Readiness

### 5.1 License Status

| Repository | Root LICENSE file | Per-package `license` field | Status |
|-----------|------------------|-----------------------------|--------|
| SDK | ✓ Apache-2.0 | **ABSENT on all 11 packages** | **P0** |
| RS1 | ✓ Apache-2.0 | **ABSENT on all 159 packages** | **P1** (no publish planned for RS1 packages at Beta) |

npm requires a `license` field for publication. Its absence does not cause `npm publish` to fail,
but it:
- Causes `npm publish` warnings
- Leaves the package legally ambiguous ("unlicensed" status on npmjs.com)
- Prevents automated license scanners in enterprise consumers from accepting the package

**Resolution:** Add `"license": "Apache-2.0"` to all 8 minimum-Beta SDK packages.

### 5.2 NOTICE File Requirement

Apache License 2.0 §4(d) requires a NOTICE file in distributions if the original NOTICE file
contains attribution notices. Since no NOTICE file exists in either repository, and all external
runtime dependencies are MIT-licensed (no attribution requirements), **no NOTICE file is legally
required for Beta**.

Recommendation: Create a minimal `NOTICE` file (or `THIRD_PARTY_NOTICES`) for hygiene,
noting the MIT-licensed dependencies bundled in the runtime distribution. Not a blocker.

### 5.3 Registry Configuration

No `.npmrc` and no `publishConfig` exist in any SDK package. Without `publishConfig.registry`,
`npm publish` will publish to the public `https://registry.npmjs.org`.

For Beta, this is likely intentional. However, to prevent accidental publish from developer
machines before the release pipeline is ready, a `publishConfig` with explicit registry and/or
`"access": "public"` should be added.

### 5.4 `files` Array / `.npmignore`

None of the SDK packages define a `files` array or `.npmignore`. tsup outputs to `dist/`, and
without a `files` array, `npm pack` will include everything not in `.gitignore`. This likely
includes:
- `src/` (TypeScript sources — acceptable, even desirable)
- `vendor/` tarballs (IR contracts — these are devDep build artifacts; **should be excluded**)
- `test/` files (acceptable either way)

**P1:** Add `"files": ["dist"]` to all 8 packages. This ensures only built output is published
and vendor tarballs do not bloat the published artifact.

---

## 6. Blocker Summary

### P0 Blockers (must fix before any `npm publish`)

| # | Finding | Affected | Fix |
|---|---------|---------|-----|
| P0-1 | Missing `license` field | All 8 minimum-Beta SDK packages | Add `"license": "Apache-2.0"` to each `package.json` |

### P1 Blockers (should fix before Beta release, not strictly `npm publish` failures)

| # | Finding | Affected | Fix |
|---|---------|---------|-----|
| P1-1 | Missing `"private": true` on 4 templates | `templates/app`, `capability`, `agent`, `provider` | Add `"private": true` |
| P1-2 | Missing `"private": true` on all ~80 RS1 internal packages | All `*-ir`, `mock-*`, `stage-9k-*`, test stubs | Add `"private": true` in bulk |
| P1-3 | Missing `"private": true` on `repo-engineer` app | `app/repo-engineer` | Add `"private": true` |
| P1-4 | Missing `files` array on all 8 Beta SDK packages | All 8 | Add `"files": ["dist"]` |
| P1-5 | Vendor tarballs (IR contracts) missing `license` field | 7 RS1 IR packages vendored into SDK | Add `"license": "Apache-2.0"` in RS1 before next vendor rebuild |
| P1-6 | No `publishConfig` | All 8 Beta SDK packages | Add `"publishConfig": { "access": "public" }` (or private if scoped-registry Beta) |

### Deferred / Not Blockers

| Finding | Reason deferred |
|---------|----------------|
| `adapter-sdk`, `asset-sdk`, `sdk` link: paths to RS1 | Not in Stage 16 public surface; future stage work |
| No NOTICE file | No legal requirement; all runtime deps MIT-licensed |
| RS1 publishable packages (protocol, install-manifest, kernel) lacking license/publishConfig | Not published at Beta; distributed only via bundle artifact or vendor tarballs |
| `package-sdk` vendor self-reference (`@rohinik-org/package-sdk@0.1.0`) | Earlier build used for type-test purposes only (devDep); does not affect published output |
| Container smoke test gap | Documented Beta limitation in T11 evidence |

---

## 7. Minimum Beta Public Surface Recommendation

The minimum set of packages to publish for a Beta developer release:

```
@rohinik-org/cli            @ 0.16.0   — runtime install + lifecycle CLI
@rohinik-org/client         @ 1.0.0    — async execution client
@rohinik-org/capability-sdk @ 0.16.0   — capability authoring
@rohinik-org/agent-sdk      @ 0.16.0   — agent authoring
@rohinik-org/provider-sdk   @ 0.16.0   — provider authoring
@rohinik-org/package-sdk    @ 0.16.0   — package authoring + .rpk
@rohinik-org/testing        @ 0.16.0   — offline test fixtures
@rohinik-org/install-manifest @ 0.1.0  — manifest schema (CLI runtime dep)
```

**Not published at Beta:**
- Protocol packages (`execution-protocol-v1`, `agent-protocol-v1`, `control-protocol-v1`) — bundled in `@rohinik-org/client` at build time; no consumer needs to `npm install` them directly
- `@rohinik-org/sdk`, `adapter-sdk`, `asset-sdk` — pre-16 packages with link: blockers
- `@rohinik-org/sdk-contracts` — internal to adapter/asset SDK, no direct consumer use
- All RS1 packages — distributed via runtime bundle artifact only

**Runtime distribution:** Distributed as a tarball artifact via `rohinik install`, not npm. No RS1
packages are published to npm as part of Beta.

---

## 8. Pre-Publication Checklist

Before executing `npm publish` on any of the 8 minimum-Beta packages:

- [ ] Add `"license": "Apache-2.0"` to all 8 `package.json` files — **P0-1**
- [ ] Add `"files": ["dist"]` to all 8 `package.json` files — **P1-4**
- [ ] Add `"publishConfig": { "access": "public" }` to all 8 — **P1-6**
- [ ] Add `"private": true` to all 4 template `package.json` files — **P1-1**
- [ ] Verify `dist/` is present and built (`pnpm --filter <pkg> run build`) for all 8
- [ ] Verify `npm pack --dry-run` output for each — confirm only `dist/` files included
- [ ] Add `"license": "Apache-2.0"` to IR vendor source packages in RS1 — **P1-5**
- [ ] Rebuild vendor tarballs after RS1 license field additions
- [ ] Confirm registry target (npmjs.com public vs private Beta registry)
- [ ] Confirm npm authentication (`npm whoami` or equivalent CI secret)
- [ ] Add `"private": true` to RS1 internal packages (bulk, ~80 packages) — **P1-2, P1-3**

---

## Frozen Baseline Reference

| Repository | HEAD at audit |
|-----------|--------------|
| SDK | `921d08c` (Stage 16 BSA-1) |
| RS1 | `bbe62f8` (IPC isolation) |

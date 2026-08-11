# Stage 16 Beta Stabilization Amendment 1

**Date:** 2026-08-11  
**Author:** sritamsarkar  
**Amends:** AFS-016F, STAGE-16-CLOSURE  
**Status:** FROZEN

---

## Purpose

This amendment records three post-freeze correctness and efficiency fixes identified during a ponytail audit of Stage 16F code. The Stage 16 freeze remains in effect. These fixes do not change any protocol, contract, invariant, or public API. They are recorded here rather than silently absorbed into the frozen baseline.

---

## Audit Disposition

```
Beta pre-release code audit

Auditor input:
  1 BLOCKER
  10 WARN
  13 NITS

Disposition:
  BLOCKER   1  false positive — dismissed
  FIXED     3  correctness/efficiency findings
  ACCEPTED  0  unresolved correctness blockers
  DEFERRED  1  known provider YAML parser ceiling (documented, ponytail: comment present)
  NITS      0  no action
```

---

## Fixes Applied

### Fix 1 — `start.ts`: health probe timeout

**File:** `packages/cli/src/commands/start.ts`  
**Commit:** `42865d4`  
**Classification:** Reliability defect

`probeHealth(endpoint, pollMs)` was passing the poll interval (default 500 ms) as
the HTTP timeout for each individual health probe. During startup, 500 ms is too
short — the runtime process may be alive and healthy but not yet accepting
connections, causing the probe to return `UNREACHABLE` before the server has
finished binding. The poll interval and the per-probe HTTP timeout are different
concerns.

**Fix:** Fixed probe timeout to `5_000` ms (constant). `pollMs` remains only the
inter-probe sleep between iterations.

```diff
-    const probe = await probeHealth(endpoint, pollMs)
+    const probe = await probeHealth(endpoint, 5_000)
```

No protocol or contract change. `probeHealth` signature unchanged.

---

### Fix 2 — `parse.ts`: empty nested YAML key

**File:** `packages/cli/src/config/parse.ts`  
**Commit:** `42865d4`  
**Classification:** Config correctness defect

When `parseLines()` encountered a key with an empty value and no following children
at a greater indent level (e.g. `extensions:` on its own line with no children),
it set `obj[key] = null`. Downstream code that accessed `config.extensions.paths`
would throw on a valid minimal config that omits children under a known key.

Correct YAML semantics: a mapping key with no value is an empty mapping `{}`,
not null.

**Fix:** `obj[key] = {}` instead of `obj[key] = null`.

```diff
-        obj[key] = null
+        obj[key] = {}
```

No protocol or contract change. No change to the ParsedConfig interface.

---

### Fix 3 — `pack.ts`: redundant intermediate gzip

**File:** `packages/package-sdk/src/pack.ts`  
**Commit:** `42865d4`  
**Classification:** Efficiency fix (not a correctness defect)

`pack()` built and gzip-compressed the tar archive twice:

1. First pass: tar without integrity entry → gzip → hash the compressed blob →
   discard the blob. Hash stored as `contentHash` in `rohinik-integrity.json`.
2. Second pass: tar with integrity entry → gzip → final `.rpk` file.

The first gzip was wasted work. The intermediate hash's only purpose is provenance
tracing — it identifies the source content for audit purposes, not for
verification at admission time. Hashing the raw tar bytes achieves identical
uniqueness with no compression overhead.

**Fix:** Replaced the first gzip pass with a direct SHA-256 of `tarContent`:

```diff
-  const gzipChunks: Buffer[] = []
-  await new Promise<void>((resolve, reject) => {
-    const gz    = createGzip({ level: 9 })
-    const src   = Readable.from([tarContent])
-    src.pipe(gz)
-    gz.on('data', (chunk: Buffer) => gzipChunks.push(chunk))
-    gz.on('end',  resolve)
-    gz.on('error', reject)
-  })
-  const rpkBytes  = Buffer.concat(gzipChunks)
-  const hash      = createHash('sha256').update(rpkBytes).digest('hex')
+  // ponytail: hashing raw tar instead of gzip; same uniqueness, skips one compress round-trip
+  const hash = createHash('sha256').update(tarContent).digest('hex')
```

`contentHash` in `rohinik-integrity.json` is now `sha256:<hash-of-raw-tar>` instead
of `sha256:<hash-of-intermediate-gzip>`. The `PackResult.contentHash` (returned to
callers) is still the hash of the final `.rpk` file — unchanged.

**Note on the `.rpk` determinism invariant:** The two-pack determinism test in T11
Phase 7 passes without modification. The final `.rpk` hash is still fully
deterministic because it depends only on source files, manifest, and integrity
JSON — all of which are deterministic inputs.

---

## Dismissed Findings

| Finding | Reason dismissed |
|---------|-----------------|
| `bin.ts:169` alleged `cd undefined` | False positive — `targetDir ?? \`my-${kind}\`` handles undefined correctly |
| `health.ts` AbortController race | `finally { clearTimeout }` is correct; `AbortSignal.timeout()` would be cleaner but not safer |
| `dev.ts` entry/SDK loading duplication | `resolveEntry()` and `resolveSdk()` already extracted; remaining duplication is 6 lines, not worth an abstraction |
| `stop.ts` / `start.ts` duplicated `sleep()` | 3-line private functions at file scope; shared util file would increase indirection with no benefit |
| `pack.ts` `padLeft()` vs `String.padStart()` | Equivalent; not a bug |
| `provider.ts` YAML regex fragility | Acknowledged; `ponytail:` comment present; known ceiling |
| All 13 NITS | Formatting/style; no action |

---

## Stage 16 Floor Re-verification

All Stage 16 conformance gates re-run after fixes applied:

| Gate | Tests | Result |
|------|-------|--------|
| T11 — clean install + runtime conformance | 46/46 | ✓ PASS |
| T9 — template gate | 32/32 | ✓ PASS |
| T10 — examples gate | 32/32 | ✓ PASS |
| **Total** | **110/110** | **✓ ALL PASS** |

No regression introduced. Stage 16 frozen baselines are intact.

---

## Amendment Scope

This amendment does not:

- Change any protocol contract (16A–16E invariants unchanged)
- Change any public API surface (CLI commands, SDK exports, fixture API)
- Change the `.rpk` format or `rohinik-integrity.json` schema
- Change the `PackResult.contentHash` semantics (still hash of final `.rpk`)
- Alter any frozen constitutional invariant from AFS-016A through AFS-016F

The Stage 16 freeze remains in effect. No further amendments are anticipated
before the Beta release sequence begins.

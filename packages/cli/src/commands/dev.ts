/**
 * rohinik dev validate  — validate a package definition
 * rohinik dev pack      — pack a validated definition into .rpk
 *
 * These commands run in the author's project directory.
 * They dynamically import the author's package entry (default: ./package-definition.js)
 * and call into @rohinik-org/package-sdk which is resolved from the project's
 * own node_modules.
 *
 * Packing does NOT make a package trusted, admitted, installed, or published.
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface DevCommandResult {
  readonly ok:      boolean
  readonly message: string
  readonly details?: string[]
}

function resolveEntry(cwd: string, entry?: string): string {
  const candidates = entry
    ? [resolve(cwd, entry)]
    : [
        join(cwd, 'package-definition.js'),
        join(cwd, 'dist', 'package-definition.js'),
        join(cwd, 'src', 'package-definition.js'),
      ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(
    `No package definition found. Tried:\n${candidates.map(c => `  ${c}`).join('\n')}\n` +
    `Run from your package directory or pass --entry <path>.`
  )
}

function resolveSdk(cwd: string): string {
  // Try to load from the project's own node_modules first
  const local = join(cwd, 'node_modules', '@rohinik-org', 'package-sdk', 'dist', 'index.js')
  if (existsSync(local)) return local
  // Fall back: resolve from Node module resolution (if globally installed or in parent)
  return '@rohinik-org/package-sdk'
}

export async function devValidate(cwd: string, opts: { entry?: string }): Promise<DevCommandResult> {
  let entryPath: string
  try {
    entryPath = resolveEntry(cwd, opts.entry)
  } catch (e) {
    return { ok: false, message: String((e as Error).message) }
  }

  let def: unknown
  try {
    const mod = await import(pathToFileURL(entryPath).href)
    def = mod.default ?? mod.definition ?? mod.packageDefinition
    if (!def) {
      return { ok: false, message: `Entry file "${entryPath}" has no default, .definition, or .packageDefinition export` }
    }
  } catch (e) {
    return { ok: false, message: `Failed to load "${entryPath}": ${(e as Error).message}` }
  }

  let sdk: { validatePackageDefinition: (d: unknown) => { ok: boolean; errors: readonly string[] } }
  try {
    const sdkPath = resolveSdk(cwd)
    sdk = await import(sdkPath.startsWith('@') ? sdkPath : pathToFileURL(sdkPath).href)
  } catch (e) {
    return { ok: false, message: `Cannot load @rohinik-org/package-sdk from "${cwd}". Run: npm install @rohinik-org/package-sdk` }
  }

  const result = sdk.validatePackageDefinition(def)
  if (result.ok) {
    const pkg = (def as Record<string, unknown>)['package'] as Record<string, unknown>
    return { ok: true, message: `Valid: ${pkg['id']} v${pkg['version']}` }
  }
  return {
    ok:      false,
    message: `Validation failed (${result.errors.length} error(s)):`,
    details: result.errors as string[],
  }
}

export async function devPack(cwd: string, opts: {
  entry?:    string
  output?:   string
  packedBy?: string
}): Promise<DevCommandResult> {
  let entryPath: string
  try {
    entryPath = resolveEntry(cwd, opts.entry)
  } catch (e) {
    return { ok: false, message: String((e as Error).message) }
  }

  let def: unknown
  try {
    const mod = await import(pathToFileURL(entryPath).href)
    def = mod.default ?? mod.definition ?? mod.packageDefinition
    if (!def) {
      return { ok: false, message: `Entry file "${entryPath}" has no default, .definition, or .packageDefinition export` }
    }
  } catch (e) {
    return { ok: false, message: `Failed to load "${entryPath}": ${(e as Error).message}` }
  }

  let sdk: {
    validatePackageDefinition: (d: unknown) => { ok: boolean; errors: readonly string[] }
    pack: (def: unknown, opts: unknown) => Promise<{ outputPath: string; contentHash: string; fileCount: number; sizeBytes: number }>
  }
  try {
    const sdkPath = resolveSdk(cwd)
    sdk = await import(sdkPath.startsWith('@') ? sdkPath : pathToFileURL(sdkPath).href)
  } catch (e) {
    return { ok: false, message: `Cannot load @rohinik-org/package-sdk from "${cwd}". Run: npm install @rohinik-org/package-sdk` }
  }

  // Validate first
  const validation = sdk.validatePackageDefinition(def)
  if (!validation.ok) {
    return {
      ok:      false,
      message: `Validation failed before packing:`,
      details: validation.errors as string[],
    }
  }

  const pkg      = (def as Record<string, unknown>)['package'] as Record<string, unknown>
  const pkgId    = String(pkg['id'])
  const pkgVer   = String(pkg['version'])
  const outName  = opts.output ?? join(cwd, `${pkgId.replace(/\./g, '-')}-${pkgVer}.rpk`)

  try {
    const result = await sdk.pack(def, {
      sourceDir: cwd,
      outputPath: outName,
      packedBy:  opts.packedBy,
    })
    return {
      ok:      true,
      message: `Packed: ${result.outputPath}`,
      details: [
        `  package:   ${pkgId} v${pkgVer}`,
        `  files:     ${result.fileCount}`,
        `  size:      ${(result.sizeBytes / 1024).toFixed(1)} KB`,
        `  sha256:    ${result.contentHash.slice(0, 16)}...`,
        `  status:    unpublished (not trusted, admitted, or installed)`,
      ],
    }
  } catch (e) {
    const err = e as Error & { code?: string; violations?: unknown[] }
    if (err.code === 'secret-scan-failed') {
      return {
        ok:      false,
        message: `Pack aborted: secret scan violation(s)`,
        details: [err.message.split('\n').slice(1).join('\n')],
      }
    }
    return { ok: false, message: `Pack failed: ${err.message}` }
  }
}

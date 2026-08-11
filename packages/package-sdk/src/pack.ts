/**
 * Deterministic .rpk pack pipeline.
 *
 * .rpk = gzipped tar archive with:
 *   - all declared source files, sorted lexicographically by path
 *   - rohinik-package.json — canonical manifest
 *   - rohinik-integrity.json — SHA-256 content hash + provenance metadata
 *
 * Packing does NOT make a package trusted, admitted, installed, or published.
 */

import { createHash }    from 'node:crypto'
import { createGzip }    from 'node:zlib'
import { Readable }      from 'node:stream'
import { pipeline }      from 'node:stream/promises'
import { createWriteStream, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import type { PackageDefinition } from './types.js'
import { validatePackageDefinition } from './validate-package.js'
import { resolveManifest }           from './manifest.js'
import { scanFiles }                 from './scanner.js'

export interface PackResult {
  readonly outputPath:   string
  readonly contentHash:  string   // SHA-256 of the .rpk bytes (hex)
  readonly fileCount:    number
  readonly sizeBytes:    number
}

export interface PackOptions {
  /** Absolute path to the root directory containing the package files */
  readonly sourceDir:   string
  /** Absolute path for the output .rpk file */
  readonly outputPath:  string
  /** Files to include, relative to sourceDir. Defaults to all files. */
  readonly files?:      readonly string[]
  /** Declared secret ref env-var names — values checked against file content */
  readonly secretRefs?: readonly string[]
  /** Packer identity for provenance (optional) */
  readonly packedBy?:   string
  /** ISO timestamp override for deterministic testing */
  readonly packedAt?:   string
}

// ── Minimal POSIX ustar tar builder ──────────────────────────────────────────

function padLeft(s: string, n: number, ch = '0') {
  return s.length >= n ? s : ch.repeat(n - s.length) + s
}

function tarHeader(filePath: string, size: number): Buffer {
  const h = Buffer.alloc(512, 0)
  // name (100)
  h.write(filePath.slice(0, 100), 0, 'ascii')
  // mode (8)
  h.write('0000644\0', 100, 'ascii')
  // uid, gid (8 each)
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  // size (12) — octal
  h.write(padLeft(size.toString(8), 11) + '\0', 124, 'ascii')
  // mtime (12) — zero for determinism
  h.write('00000000000\0', 136, 'ascii')
  // type flag: '0' = regular file
  h[156] = 0x30
  // magic "ustar\0" + version "00"
  h.write('ustar\0', 257, 'ascii')
  h.write('00', 263, 'ascii')
  // checksum: sum of all header bytes (placeholder)
  h.write('        ', 148, 'ascii')
  let sum = 0
  for (let i = 0; i < 512; i++) sum += h[i]!
  h.write(padLeft(sum.toString(8), 6) + '\0 ', 148, 'ascii')
  return h
}

function tarEntry(filePath: string, content: Buffer): Buffer[] {
  const header  = tarHeader(filePath, content.length)
  const padding = (512 - (content.length % 512)) % 512
  return [header, content, Buffer.alloc(padding, 0)]
}

function tarEnd(): Buffer {
  return Buffer.alloc(1024, 0)
}

// ── File collection ───────────────────────────────────────────────────────────

function collectFiles(dir: string, rel = ''): string[] {
  const result: string[] = []
  for (const entry of readdirSync(join(dir, rel || '.'))) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const full    = join(dir, rel, entry)
    const relPath = rel ? `${rel}/${entry}` : entry
    const st      = statSync(full)
    if (st.isDirectory()) {
      result.push(...collectFiles(dir, relPath))
    } else {
      result.push(relPath)
    }
  }
  return result
}

// ── Pack pipeline ─────────────────────────────────────────────────────────────

export async function pack(def: PackageDefinition, opts: PackOptions): Promise<PackResult> {
  // Step 1: validate public contract
  const validation = validatePackageDefinition(def)
  if (!validation.ok) {
    throw Object.assign(
      new Error(`pack: package definition invalid:\n${validation.errors.join('\n')}`),
      { code: 'validation-failed', errors: validation.errors },
    )
  }

  // Step 2: resolve canonical manifest
  const manifest = resolveManifest(def)

  // Step 3: collect declared files only (sorted)
  const rawFiles = opts.files
    ? [...opts.files]
    : collectFiles(opts.sourceDir)
  const sortedPaths = [...rawFiles].sort()

  // Step 4: load file contents
  const fileMap = new Map<string, string>()
  for (const f of sortedPaths) {
    const abs     = join(opts.sourceDir, f.split('/').join(sep))
    const content = readFileSync(abs, 'utf-8')
    fileMap.set(f, content)
  }

  // Step 5: authoritative secret scan
  const scan = scanFiles(fileMap, opts.secretRefs ?? [])
  if (!scan.clean) {
    const lines = scan.violations.map(v =>
      `  ${v.file}:${v.line} [${v.rule}] ${v.excerpt}`
    )
    throw Object.assign(
      new Error(`pack: secret scan failed — ${scan.violations.length} violation(s):\n${lines.join('\n')}`),
      { code: 'secret-scan-failed', violations: scan.violations },
    )
  }

  // Step 6: build tar entries — source files + manifest
  const manifestJson   = JSON.stringify(manifest, null, 2)
  const manifestBuf    = Buffer.from(manifestJson, 'utf-8')
  const manifestPath   = 'rohinik-package.json'

  const entries: Buffer[] = []
  for (const [path, content] of fileMap) {
    entries.push(...tarEntry(path, Buffer.from(content, 'utf-8')))
  }
  entries.push(...tarEntry(manifestPath, manifestBuf))
  // integrity placeholder — added after hash computed below
  entries.push(tarEnd())

  const tarContent = Buffer.concat(entries)

  // Step 7: hash intermediate tar (no gzip needed — only used for integrity provenance)
  // ponytail: hashing raw tar instead of gzip; same uniqueness, skips one compress round-trip
  const hash = createHash('sha256').update(tarContent).digest('hex')

  // Step 8: rebuild with integrity entry included
  const provenanceTs   = opts.packedAt ?? new Date().toISOString()
  const integrityData  = {
    schemaVersion: 'rohinik.package/v1',
    packageId:     def.package.id,
    version:       def.package.version,
    contentHash:   `sha256:${hash}`,
    fileCount:     fileMap.size + 1,  // +1 for manifest
    packedAt:      provenanceTs,
    ...(opts.packedBy ? { packedBy: opts.packedBy } : {}),
    // Packing does NOT make a package trusted, admitted, installed, or published.
    status: 'unpublished',
  }
  const integrityBuf  = Buffer.from(JSON.stringify(integrityData, null, 2), 'utf-8')
  const integrityPath = 'rohinik-integrity.json'

  const entries2: Buffer[] = []
  for (const [path, content] of fileMap) {
    entries2.push(...tarEntry(path, Buffer.from(content, 'utf-8')))
  }
  entries2.push(...tarEntry(manifestPath,   manifestBuf))
  entries2.push(...tarEntry(integrityPath,  integrityBuf))
  entries2.push(tarEnd())

  const tarContent2   = Buffer.concat(entries2)
  const gzipChunks2: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const gz    = createGzip({ level: 9 })
    const src   = Readable.from([tarContent2])
    src.pipe(gz)
    gz.on('data', (chunk: Buffer) => gzipChunks2.push(chunk))
    gz.on('end',  resolve)
    gz.on('error', reject)
  })
  const finalRpk      = Buffer.concat(gzipChunks2)
  const finalHash     = createHash('sha256').update(finalRpk).digest('hex')

  // Step 9: write .rpk
  await pipeline(Readable.from([finalRpk]), createWriteStream(opts.outputPath))

  return {
    outputPath:  opts.outputPath,
    contentHash: finalHash,
    fileCount:   fileMap.size + 2,  // source + manifest + integrity
    sizeBytes:   finalRpk.length,
  }
}

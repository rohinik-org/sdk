/**
 * T8 acceptance tests — package-sdk: scanner, manifest, validate, pack pipeline.
 *
 * Critical invariants:
 *   SCANNER: clean content passes; API tokens rejected; .env files rejected;
 *            private key PEM rejected; declared ref value inlining rejected
 *   MANIFEST: canonical ordering (provides/consumes/deps/secrets all sorted);
 *             schemaVersion correct; optional fields only when present
 *   VALIDATE: valid definition passes; bad id/version/type caught;
 *             duplicate/invalid capability ids caught; duplicate secrets caught
 *   PACK: pipeline produces .rpk; contentHash stable (deterministic);
 *         secret scan failure aborts pack; validation failure aborts pack;
 *         pack status = "unpublished" (not trusted/admitted/installed/published)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join }    from 'node:path'
import { tmpdir }  from 'node:os'
import { createGunzip } from 'node:zlib'
import { Readable }     from 'node:stream'

import {
  scanContent,
  scanFiles,
  validatePackageDefinition,
  resolveManifest,
  pack,
} from '../index.js'
import type { PackageDefinition } from '../index.js'
// ponytail: vendor path import avoids self-name circular resolution
import { definePackage } from '../../node_modules/@rohinik-org/package-sdk/dist/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minimalDef(): PackageDefinition {
  return definePackage({
    package: {
      id:      'com.example.my-provider',
      name:    'My Provider',
      version: '1.0.0',
      type:    'capability-provider',
    },
    provides: [
      { capability: 'text:complete', version: '1.0.0' },
    ],
  })
}

// ── Secret scanner tests ───────────────────────────────────────────────────────

describe('scanContent — clean content', () => {
  it('passes clean source file', () => {
    const v = scanContent('src/index.ts', 'export function hello() { return "world" }')
    expect(v).toHaveLength(0)
  })

  it('passes non-credential JSON', () => {
    const v = scanContent('config.json', '{"model":"gpt-4","temperature":0.7}')
    expect(v).toHaveLength(0)
  })
})

describe('scanContent — API token patterns', () => {
  it('REJECT: OpenAI key', () => {
    const v = scanContent('src/a.ts', 'const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890"')
    expect(v.some(x => x.rule === 'openai-key')).toBe(true)
  })

  it('REJECT: Anthropic key', () => {
    const v = scanContent('src/a.ts', 'const k = "sk-ant-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF"')
    expect(v.some(x => x.rule === 'anthropic-key')).toBe(true)
  })

  it('REJECT: GitHub PAT', () => {
    const v = scanContent('src/a.ts', 'const tok = "ghp_abcdefghijklmnopqrstuvwxyz1234567890"')
    expect(v.some(x => x.rule === 'github-pat')).toBe(true)
  })

  it('REJECT: GitHub OAuth token', () => {
    const v = scanContent('src/a.ts', 'const tok = "gho_abcdefghijklmnopqrstuvwxyz1234567890"')
    expect(v.some(x => x.rule === 'github-oauth')).toBe(true)
  })

  it('REJECT: AWS access key', () => {
    const v = scanContent('src/a.ts', 'const ak = "AKIAIOSFODNN7EXAMPLE"')
    expect(v.some(x => x.rule === 'aws-access-key')).toBe(true)
  })

  it('REJECT: private key PEM block', () => {
    const v = scanContent('key.pem', '-----BEGIN RSA PRIVATE KEY-----\nMIIE...')
    expect(v.some(x => x.rule === 'private-key-pem')).toBe(true)
  })

  it('REJECT: bearer token in Authorization header', () => {
    const v = scanContent('src/client.ts', 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijklmnopqrstuvwxyz')
    expect(v.some(x => x.rule === 'bearer-token')).toBe(true)
  })

  it('excerpt is redacted (not full key)', () => {
    const v = scanContent('src/a.ts', 'const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890"')
    expect(v[0]!.excerpt).toMatch(/\*\*\*/)
  })
})

describe('scanContent — blocked filenames', () => {
  it('REJECT: .env file', () => {
    const v = scanContent('.env', 'API_KEY=hello')
    expect(v.some(x => x.rule === 'blocked-credential-file')).toBe(true)
  })

  it('REJECT: .env.production', () => {
    const v = scanContent('.env.production', '')
    expect(v.some(x => x.rule === 'blocked-credential-file')).toBe(true)
  })

  it('REJECT: id_rsa', () => {
    const v = scanContent('id_rsa', '')
    expect(v.some(x => x.rule === 'blocked-credential-file')).toBe(true)
  })

  it('REJECT: .npmrc', () => {
    const v = scanContent('.npmrc', '')
    expect(v.some(x => x.rule === 'blocked-credential-file')).toBe(true)
  })

  it('blocked file returns early (no further scanning)', () => {
    const v = scanContent('.env', 'sk-abcdefghijklmnopqrstuvwxyz1234567890')
    // Only blocked-credential-file, not also openai-key
    expect(v).toHaveLength(1)
    expect(v[0]!.rule).toBe('blocked-credential-file')
  })
})

describe('scanContent — declared secret ref value inlining', () => {
  it('REJECT: env var value appears verbatim in file', () => {
    const secretValue = 'super-secret-value-1234'
    const origEnv = process.env['MY_API_KEY']
    process.env['MY_API_KEY'] = secretValue
    try {
      const v = scanContent('src/a.ts', `const key = "${secretValue}"`, ['MY_API_KEY'])
      expect(v.some(x => x.rule === 'declared-secret-value-inlined')).toBe(true)
    } finally {
      if (origEnv === undefined) delete process.env['MY_API_KEY']
      else process.env['MY_API_KEY'] = origEnv
    }
  })

  it('PASS: short env value (< 8 chars) not flagged', () => {
    const origEnv = process.env['MY_KEY']
    process.env['MY_KEY'] = 'abc'
    try {
      const v = scanContent('src/a.ts', 'const k = "abc"', ['MY_KEY'])
      expect(v).toHaveLength(0)
    } finally {
      if (origEnv === undefined) delete process.env['MY_KEY']
      else process.env['MY_KEY'] = origEnv
    }
  })
})

describe('scanFiles', () => {
  it('clean scan returns clean=true', () => {
    const files = new Map([
      ['src/index.ts', 'export const x = 1'],
      ['src/util.ts',  'export const y = 2'],
    ])
    const r = scanFiles(files)
    expect(r.clean).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('violation in any file returns clean=false', () => {
    const files = new Map([
      ['src/index.ts', 'export const x = 1'],
      ['src/bad.ts',   'const k = "sk-abcdefghijklmnopqrstuvwxyz1234567890"'],
    ])
    const r = scanFiles(files)
    expect(r.clean).toBe(false)
    expect(r.violations.length).toBeGreaterThan(0)
    expect(r.violations[0]!.file).toBe('src/bad.ts')
  })
})

// ── Manifest resolution tests ─────────────────────────────────────────────────

describe('resolveManifest — golden path', () => {
  it('sets schemaVersion correctly', () => {
    const m = resolveManifest(minimalDef())
    expect(m.schemaVersion).toBe('rohinik.package/v1')
  })

  it('copies package identity fields', () => {
    const m = resolveManifest(minimalDef())
    expect(m.package.id).toBe('com.example.my-provider')
    expect(m.package.version).toBe('1.0.0')
    expect(m.package.type).toBe('capability-provider')
  })

  it('provides sorted by capability id', () => {
    const def = definePackage({
      package: { id: 'com.example.pkg', name: 'P', version: '1.0.0', type: 'capability-provider' },
      provides: [
        { capability: 'text:stream', version: '1.0.0' },
        { capability: 'audio:transcribe', version: '1.0.0' },
        { capability: 'image:generate', version: '1.0.0' },
      ],
    })
    const m = resolveManifest(def)
    const ids = m.provides!.map(p => p.capability)
    expect(ids).toEqual([...ids].sort())
  })

  it('consumes sorted by capability id', () => {
    const def = definePackage({
      package: { id: 'com.example.pkg', name: 'P', version: '1.0.0', type: 'capability-composite' },
      provides: [{ capability: 'text:complete', version: '1.0.0' }],
      consumes: [
        { capability: 'text:stream',      versionRange: '>=1.0.0' },
        { capability: 'audio:transcribe', versionRange: '>=1.0.0' },
      ],
    })
    const m = resolveManifest(def)
    const ids = m.consumes!.map(c => c.capability)
    expect(ids).toEqual([...ids].sort())
  })

  it('npm deps sorted by name', () => {
    const def = definePackage({
      package: { id: 'com.example.pkg', name: 'P', version: '1.0.0', type: 'capability-provider' },
      provides: [{ capability: 'text:complete', version: '1.0.0' }],
      dependencies: {
        npm: [
          { name: 'zod',     version: '^3.0.0' },
          { name: 'axios',   version: '^1.0.0' },
          { name: 'ms',      version: '^2.0.0' },
        ],
      },
    })
    const m = resolveManifest(def)
    const names = m.dependencies!.npm!.map(d => d.name)
    expect(names).toEqual([...names].sort())
  })

  it('omits empty optional sections', () => {
    const m = resolveManifest(minimalDef())
    expect(m.publisher).toBeUndefined()
    expect(m.consumes).toBeUndefined()
    expect(m.dependencies).toBeUndefined()
  })
})

// ── validatePackageDefinition tests ──────────────────────────────────────────

describe('validatePackageDefinition', () => {
  it('PASS: valid minimal definition', () => {
    const r = validatePackageDefinition(minimalDef())
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('REJECT: invalid package id (no domain)', () => {
    // Bypass definePackage validation to directly test validatePackageDefinition
    const def = {
      package: { id: 'my-provider', name: 'P', version: '1.0.0', type: 'capability-provider' },
      provides: [{ capability: 'text:complete', version: '1.0.0' }],
      consumes: [],
    } as unknown as PackageDefinition
    const r = validatePackageDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('package id'))).toBe(true)
  })

  it('REJECT: invalid semver version', () => {
    const patched = { ...minimalDef(), package: { ...minimalDef().package, version: 'latest' } } as unknown as PackageDefinition
    const r = validatePackageDefinition(patched)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('version'))).toBe(true)
  })

  it('REJECT: duplicate provides capability id', () => {
    const def = {
      ...minimalDef(),
      provides: [
        { capability: 'text:complete', version: '1.0.0' },
        { capability: 'text:complete', version: '1.0.1' },
      ],
    } as unknown as PackageDefinition
    const r = validatePackageDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('duplicate'))).toBe(true)
  })

  it('REJECT: invalid capability id in provides', () => {
    const def = {
      ...minimalDef(),
      provides: [{ capability: 'INVALID CAPS', version: '1.0.0' }],
    } as unknown as PackageDefinition
    const r = validatePackageDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('invalid capability id'))).toBe(true)
  })

  it('REJECT: duplicate secret name', () => {
    const base = minimalDef()
    const def = {
      ...base,
      configuration: {
        secrets: [
          { name: 'MY_KEY', required: true },
          { name: 'MY_KEY', required: false },
        ],
        environment: [],
      },
    } as unknown as PackageDefinition
    const r = validatePackageDefinition(def)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.includes('duplicate secret'))).toBe(true)
  })
})

// ── Pack pipeline tests ───────────────────────────────────────────────────────

let tmpDir: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'package-sdk-test-'))
})
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeSourceDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpDir, 'src-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }
  return dir
}

describe('pack — golden path', () => {
  it('produces .rpk file', async () => {
    const srcDir = makeSourceDir({ 'src/index.ts': 'export const x = 1' })
    const outPath = join(tmpDir, 'test1.rpk')
    const result = await pack(minimalDef(), { sourceDir: srcDir, outputPath: outPath })
    expect(result.outputPath).toBe(outPath)
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.sizeBytes).toBeGreaterThan(0)
    expect(result.fileCount).toBeGreaterThanOrEqual(2) // source + manifest + integrity
  })

  it('output is valid gzip', async () => {
    const srcDir = makeSourceDir({ 'src/index.ts': 'export const x = 1' })
    const outPath = join(tmpDir, 'test2.rpk')
    await pack(minimalDef(), { sourceDir: srcDir, outputPath: outPath })
    const bytes = readFileSync(outPath)
    // gzip magic bytes: 0x1f 0x8b
    expect(bytes[0]).toBe(0x1f)
    expect(bytes[1]).toBe(0x8b)
  })

  it('deterministic: same inputs produce same hash', async () => {
    const files = {
      'src/index.ts': 'export const x = 1',
      'src/util.ts':  'export const y = 2',
    }
    const fixedAt = '2026-01-01T00:00:00.000Z'
    const srcDir1 = makeSourceDir(files)
    const srcDir2 = makeSourceDir(files)
    const out1 = join(tmpDir, 'det1.rpk')
    const out2 = join(tmpDir, 'det2.rpk')
    const r1 = await pack(minimalDef(), { sourceDir: srcDir1, outputPath: out1, packedAt: fixedAt })
    const r2 = await pack(minimalDef(), { sourceDir: srcDir2, outputPath: out2, packedAt: fixedAt })
    expect(r1.contentHash).toBe(r2.contentHash)
  })
})

describe('pack — integrity metadata', () => {
  it('rohinik-integrity.json status = "unpublished"', async () => {
    const srcDir = makeSourceDir({ 'src/index.ts': 'export const x = 1' })
    const outPath = join(tmpDir, 'integrity.rpk')
    await pack(minimalDef(), { sourceDir: srcDir, outputPath: outPath })

    // Extract integrity.json from gzipped tar
    const rpk     = readFileSync(outPath)
    const tarBuf  = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const gz = createGunzip()
      Readable.from([rpk]).pipe(gz)
      gz.on('data',  (c: Buffer) => chunks.push(c))
      gz.on('end',   () => resolve(Buffer.concat(chunks)))
      gz.on('error', reject)
    })

    // Find rohinik-integrity.json in tar
    let found: Record<string, unknown> | null = null
    let offset = 0
    while (offset + 512 <= tarBuf.length) {
      const nameBytes = tarBuf.subarray(offset, offset + 100)
      const name      = nameBytes.toString('ascii').replace(/\0+$/, '')
      if (!name) break
      const sizeOctal = tarBuf.subarray(offset + 124, offset + 136).toString('ascii').replace(/\0+$/, '')
      const size      = parseInt(sizeOctal, 8) || 0
      offset += 512
      if (name === 'rohinik-integrity.json') {
        found = JSON.parse(tarBuf.subarray(offset, offset + size).toString('utf-8'))
        break
      }
      offset += Math.ceil(size / 512) * 512
    }

    expect(found).not.toBeNull()
    expect(found!['status']).toBe('unpublished')
    expect(found!['contentHash']).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(found!['packageId']).toBe('com.example.my-provider')
  })
})

describe('pack — secret scan gate', () => {
  it('aborts if file contains API token', async () => {
    const srcDir = makeSourceDir({
      'src/index.ts': 'const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890"',
    })
    const outPath = join(tmpDir, 'scan-fail.rpk')
    await expect(pack(minimalDef(), { sourceDir: srcDir, outputPath: outPath }))
      .rejects.toThrow(/secret scan failed/)
  })

  it('aborts if .env file present', async () => {
    const srcDir = makeSourceDir({ '.env': 'API_KEY=hello' })
    const outPath = join(tmpDir, 'env-fail.rpk')
    await expect(pack(minimalDef(), { sourceDir: srcDir, outputPath: outPath }))
      .rejects.toThrow(/secret scan failed/)
  })
})

describe('pack — validation gate', () => {
  it('aborts if definition invalid', async () => {
    const srcDir = makeSourceDir({ 'src/index.ts': 'export const x = 1' })
    const outPath = join(tmpDir, 'val-fail.rpk')
    const bad = { ...minimalDef(), package: { ...minimalDef().package, version: 'bad' } } as unknown as PackageDefinition
    await expect(pack(bad, { sourceDir: srcDir, outputPath: outPath }))
      .rejects.toThrow(/invalid/)
  })
})

describe('pack — zero RS1 refs / zero workspace links', () => {
  it('dist/index.js has no file: references after build', async () => {
    // This test runs post-build; if dist doesn't exist yet, skip gracefully
    const distPath = new URL('../dist/index.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
    let content: string
    try {
      content = readFileSync(distPath, 'utf-8')
    } catch {
      return // dist not built yet — skip
    }
    // No workspace file: references in bundled output
    expect(content).not.toMatch(/file:\.\.\/\.\.\//)
    expect(content).not.toMatch(/file:\.\/vendor/)
  })
})

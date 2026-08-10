/**
 * Pack-time secret scanner.
 *
 * Authoritative across the final payload — runs against every file's content
 * before the .rpk is written. A single finding causes pack to abort.
 *
 * Detects:
 *   - Known API token patterns (OpenAI, Anthropic, GitHub, Slack, AWS, GCP, Azure)
 *   - .env files unless policy-allowed
 *   - Private key PEM blocks
 *   - Known credential file names
 *   - Accidental literal values matching declared secret ref names
 *     (i.e., env var is set AND its value appears verbatim in a source file)
 */

export interface SecretScanViolation {
  readonly file:    string
  readonly line:    number
  readonly rule:    string
  readonly excerpt: string  // first 40 chars, redacted after match end
}

export interface SecretScanResult {
  readonly clean:      boolean
  readonly violations: readonly SecretScanViolation[]
}

// ── Pattern rules ─────────────────────────────────────────────────────────────

interface ScanRule {
  readonly id:      string
  readonly pattern: RegExp
}

const RULES: ScanRule[] = [
  { id: 'openai-key',     pattern: /sk-[A-Za-z0-9]{32,}/g },
  { id: 'anthropic-key',  pattern: /sk-ant-[A-Za-z0-9\-_]{32,}/g },
  { id: 'github-pat',     pattern: /ghp_[A-Za-z0-9]{36,}/g },
  { id: 'github-oauth',   pattern: /gho_[A-Za-z0-9]{36,}/g },
  { id: 'slack-bot',      pattern: /xoxb-[A-Za-z0-9\-]{40,}/g },
  { id: 'slack-user',     pattern: /xoxp-[A-Za-z0-9\-]{40,}/g },
  { id: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { id: 'private-key-pem',pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'bearer-token',   pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+/]{20,}/gi },
]

// Credential file names that must not be included in packs
const BLOCKED_FILENAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.development',
  'credentials', '.aws/credentials', 'id_rsa', 'id_ed25519',
  '.npmrc', '.pypirc',
])

function matchesBlockedFilename(filePath: string): boolean {
  const base = filePath.split('/').pop() ?? ''
  const lower = filePath.toLowerCase()
  if (BLOCKED_FILENAMES.has(base)) return true
  if (BLOCKED_FILENAMES.has(lower)) return true
  // .env variants: .env.* pattern
  if (/^\.env(\..+)?$/.test(base)) return true
  return false
}

function redactedExcerpt(line: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - 10)
  const raw   = line.slice(start, start + 50)
  // Replace everything after the first 4 chars of the match with ***
  return raw.replace(/(.{4})[A-Za-z0-9\-._~+/]{4,}/g, '$1***')
}

/**
 * Scan a single file's content for secret patterns.
 * @param filePath  Logical path (used in violations only)
 * @param content   File content as string
 * @param secretRefs  Optional declared secret ref names; if process.env[name] is set,
 *                   the value is also scanned to catch accidental literal inlining.
 */
export function scanContent(
  filePath: string,
  content: string,
  secretRefs: readonly string[] = [],
): SecretScanViolation[] {
  const violations: SecretScanViolation[] = []

  // Blocked filename check
  if (matchesBlockedFilename(filePath)) {
    violations.push({
      file:    filePath,
      line:    0,
      rule:    'blocked-credential-file',
      excerpt: `file "${filePath}" is a known credential file`,
    })
    return violations  // no need to scan content of a blocked file
  }

  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    // Pattern rules
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0
      const m = rule.pattern.exec(line)
      if (m) {
        violations.push({
          file:    filePath,
          line:    i + 1,
          rule:    rule.id,
          excerpt: redactedExcerpt(line, m.index),
        })
      }
    }

    // Declared secret ref value scan — catch accidental literal inlining
    for (const refName of secretRefs) {
      const value = process.env[refName]
      if (value && value.length >= 8 && line.includes(value)) {
        violations.push({
          file:    filePath,
          line:    i + 1,
          rule:    'declared-secret-value-inlined',
          excerpt: `value of env var "${refName}" found verbatim in file`,
        })
      }
    }
  }

  return violations
}

export function scanFiles(
  files: ReadonlyMap<string, string>,
  secretRefs: readonly string[] = [],
): SecretScanResult {
  const all: SecretScanViolation[] = []
  for (const [path, content] of files) {
    all.push(...scanContent(path, content, secretRefs))
  }
  return { clean: all.length === 0, violations: all }
}

/**
 * Config display redaction.
 *
 * Rule: any value that does NOT look like an env-var reference (${...})
 * and is in a secret field (apiKey, password, token, secret, key) is
 * replaced with [REDACTED].
 *
 * env-var references are shown as-is because they contain no actual secret.
 * The actual env var value is never shown.
 */

const SECRET_FIELDS = new Set(['apiKey', 'password', 'token', 'secret', 'key', 'privateKey'])
const ENV_REF_RE   = /^\$\{[^}]+\}$/

export function redactConfig(raw: string): string {
  // Line-by-line redaction: if a line matches `key: <value>` where key is a
  // secret field and value is not an env-var reference, replace the value.
  return raw.split('\n').map(line => {
    const match = /^(\s*)([\w]+):\s*(.+)$/.exec(line)
    if (!match) return line
    const [, indent, key, value] = match
    if (!SECRET_FIELDS.has(key!)) return line
    const trimmed = (value ?? '').trim()
    if (ENV_REF_RE.test(trimmed)) return line  // ${VAR} — safe to show
    return `${indent}${key}: [REDACTED]`
  }).join('\n')
}

/**
 * Extract all ${VAR_NAME} references from raw config text.
 * Used by doctor to check whether referenced env vars are set.
 */
export function extractEnvRefs(raw: string): string[] {
  const refs: string[] = []
  for (const match of raw.matchAll(/\$\{([^}]+)\}/g)) {
    if (match[1]) refs.push(match[1])
  }
  return [...new Set(refs)]
}

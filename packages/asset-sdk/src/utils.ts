// Shared markdown parsing utilities for Semantic Frontends

// Extracts the text of the first H1 heading, or empty string if none.
export function titleFromMarkdown(body: string): string {
  const h1 = /^# (.+)$/m.exec(body)
  return h1 ? h1[1]!.trim() : ''
}

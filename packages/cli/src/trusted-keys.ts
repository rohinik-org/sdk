/** Committed Ed25519 public keys for known Rohinik release signers. */
export const TRUSTED_KEYS: Record<string, string> = {
  // Beta signing key — generated 2026-08-11, rotated via BR-6 key rotation
  'e7d24bfc0d0d3b69': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA8I1PlziF6wOBha7miJco2tl8xG4zKkNTamu2CsNeRWg=
-----END PUBLIC KEY-----
`,
  // CI dry-run test key — generated 2026-08-12, never used for production releases
  '67cad9f3c7786d3c': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA4wIF99X1t9/6kJaVg+YeAbbotniIJJIf7j/Um9tornk=
-----END PUBLIC KEY-----
`,
}

/** Committed Ed25519 public keys for known Rohinik release signers. */
export const TRUSTED_KEYS: Record<string, string> = {
  // Beta signing key — generated 2026-08-11, rotated via BR-6 key rotation
  'e7d24bfc0d0d3b69': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA8I1PlziF6wOBha7miJco2tl8xG4zKkNTamu2CsNeRWg=
-----END PUBLIC KEY-----
`,
  // CI dry-run test key — generated 2026-08-12, never used for production releases
  '67d7b40b619a238e': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVc8ZolkuYrwrXAyTLiQqN+xNvrJcJCq2vU3Wi1I/Nns=
-----END PUBLIC KEY-----
`,
}

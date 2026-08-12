/** Committed Ed25519 public keys for known Rohinik release signers. */
export const TRUSTED_KEYS: Record<string, string> = {
  // Beta signing key — generated 2026-08-12, rotated (prior private key lost)
  '5bbeedadbddadc71': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA20k2WBsA1MjGONC/di70kuJtKL85uJBvXONG5cRfZLw=
-----END PUBLIC KEY-----
`,
  // CI dry-run test key — generated 2026-08-12, never used for production releases
  '67d7b40b619a238e': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVc8ZolkuYrwrXAyTLiQqN+xNvrJcJCq2vU3Wi1I/Nns=
-----END PUBLIC KEY-----
`,
}

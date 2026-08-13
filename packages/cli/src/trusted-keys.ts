/** Committed Ed25519 public keys for known Rohinik release signers. */
export const TRUSTED_KEYS: Record<string, string> = {
  // Beta signing key — generated 2026-08-12, rotated (prior private key lost)
  '5bbeedadbddadc71': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA20k2WBsA1MjGONC/di70kuJtKL85uJBvXONG5cRfZLw=
-----END PUBLIC KEY-----
`,
  // CI dry-run test key — generated 2026-08-12, never used for production releases
  '095ab65cfecddab6': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABiDT7FVF3zxc+t4QQoAczqgVNNGN1cz/hFpdt6rxFRo=
-----END PUBLIC KEY-----
`,
  '0bae34200210cd8b': `-----BEGIN PUBLIC KEY-----                                                             
MCowBQYDK2VwAyEAxNvpTsqzrweYZE3qN8YgXiTQI7Ht90gz0jBToP1Bqt4=     
-----END PUBLIC KEY-----
`,
}

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/rohinik-logo-wordmark-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/rohinik-logo-wordmark-light.svg">
  <img src="./assets/rohinik-logo-wordmark-light.svg" alt="Rohinik" width="280">
</picture>

<br>

**TypeScript SDK monorepo for the Rohinik RS-1 runtime**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange)](https://pnpm.io)

</div>

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@rohinik-org/sdk`](./packages/sdk) | 0.15.0 | High-level client facade for the RS-1 runtime |
| [`@rohinik-org/adapter-sdk`](./packages/adapter-sdk) | 0.15.0 | Adapter authoring contracts & descriptor builders |
| [`@rohinik-org/asset-sdk`](./packages/asset-sdk) | 0.15.0 | Semantic asset frontend contracts & descriptor builders |
| [`@rohinik-org/sdk-contracts`](./packages/sdk-contracts) | 0.15.0 | Shared capability contracts & matcher infrastructure |

---

## Quick Start

```ts
import { RohinikSdk } from '@rohinik-org/sdk'

const sdk = new RohinikSdk({ baseUrl: 'http://localhost:8080' })

// Check runtime health
const health = await sdk.getHealth()

// List installed capabilities
const capabilities = await sdk.listInstalledCapabilities()

// Search and install
const results = await sdk.searchCapabilities('summarize')
await sdk.installCapability('summarize')

// Execute
const response = await sdk.execute({ input: 'Hello', capabilityId: 'summarize' })
```

---

## Installation

```bash
pnpm add @rohinik-org/sdk
```

For adapter authoring:

```bash
pnpm add @rohinik-org/adapter-sdk @rohinik-org/asset-sdk
```

---

## Package Details

### `@rohinik-org/sdk`

Main client facade. Wraps `RohinikHttpClient` with a typed, ergonomic API.

**Key exports:**
- `RohinikSdk` — main client class
- `RohinikSdkOptions` — constructor options (`baseUrl`, `client`)

### `@rohinik-org/adapter-sdk`

DSL for authoring adapter capability descriptors.

**Key exports:**
- `AdapterDescriptorBuilder` — builds deterministic (SHA-256 integrity) adapter descriptors
- `InvalidDiscoveryItemError` — thrown on malformed discovery items

### `@rohinik-org/asset-sdk`

DSL for authoring semantic asset frontends with confidence-based detection.

**Key exports:**
- `AssetDescriptorBuilder` — generates asset IR descriptors
- `SemanticFrontendRegistry` — registers and detects across multiple frontends
- `SemanticFrontendResolver` — resolves detection results by confidence threshold

### `@rohinik-org/sdk-contracts`

Shared contracts used across SDK packages.

**Key exports:**
- `CapabilityCategory`, `SdkCapabilityMetadata`, `SdkSkill`
- `KeywordMatcher`, `ExactMatcher`, `ContentTypeMatcher`, `AllOfMatcher`, `AnyOfMatcher`
- `EnglishTokenizer`

---

## Development

**Requirements:** Node ≥ 22, pnpm ≥ 9

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please read the [Code of Conduct](./CODE_OF_CONDUCT.md) before opening issues or PRs.

## Security

See [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.

## Trademarks

See [TRADEMARKS.md](./TRADEMARKS.md).

# Security Policy

## Supported Versions

See [SUPPORTED_VERSIONS.md](SUPPORTED_VERSIONS.md) for which versions receive
security updates.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report vulnerabilities privately by opening a GitHub Security Advisory in the
project repository, or by emailing the maintainers directly (contact visible
in the repository's maintainer profile).

Include:
- Description of the vulnerability and affected component
- Steps to reproduce or a proof-of-concept
- Impact assessment (what can an attacker achieve?)
- Suggested fix if you have one

## Response Timeline

- Acknowledgement within 48 hours
- Initial assessment within 7 days
- Fix or mitigation plan within 30 days for confirmed vulnerabilities

## Scope

In-scope components: all packages under `core/`, `compiler/`, `sdk/`, `shell/`, `cli/`.

Out of scope: third-party adapter implementations, experimental packages in `labs/`.

## Disclosure

We follow coordinated disclosure. We will credit reporters in the release notes
unless they prefer to remain anonymous.

# Security Policy

## Supported versions

ABH is at **0.1.0 preview**. Security fixes target the latest state of the `main` branch only; there are no long-term support branches yet.

| Version | Supported |
| --- | --- |
| 0.1.0.x (preview) | ✅ latest `main` |
| older | ❌ |

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately through GitHub:

1. Go to the repository's **Security** tab → **Advisories** → **Report a vulnerability**;
2. Describe the issue, the steps to reproduce it, and the affected component (`@abh/contracts`, `@abh/core`, an adapter, the CLI, or the workbench);
3. If possible, include a minimal reproduction (a test or script) that does not require real credentials or external services.

We aim to acknowledge reports within 7 days and will keep you informed while a fix is prepared. Credit is given in the changelog unless you prefer to remain anonymous.

## Current security posture — read before evaluating

ABH is a runtime harness whose entire purpose is to make agent execution accountable: every command passes an authorization chain (grant, purpose, tenant scope, version fence) re-checked inside each database transaction, writes land in an immutable audit trail, and capability packs are signature-verified before intake. The test suite exercises these paths against a real PostgreSQL 16.

That said, this is a preview release and the project's own tracking is explicit about what is **not** yet done:

- **No independent security review has been performed yet.** Internal tests are not a substitute for an external audit.
- **Production identity is not wired.** The reference deployment verifies bearer tokens and maps them to provisioned identities; swapping in a real identity provider is documented as the production step. The workbench ships a production identity adapter (JWKS/RS256/ES256, `exp`/`nbf`/`iss`/`aud` validation) that fails closed without configuration, but it has not been accepted against a production IdP.
- **Hosting and operations are not productionized.** Secrets handling, tenant worker hosting, and restricted global scans are still open items in the [gap list](./docs/development/V1-GAPS.md).

Until those items close, do not point ABH at real money, real external providers, or real personal data without your own review.

## Scope notes

The following are considered out of scope for security reports against this preview:

- Issues that require an operator to deliberately disable the authorization chain, signature verification, or audit writing in code;
- Findings about the third-party model/agent runtime behind `@abh/adapter-pi` that do not involve how ABH integrates it — report those upstream;
- Test-only helpers and fixtures never intended for deployment.

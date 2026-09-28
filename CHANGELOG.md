# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> `docs/V1` design documents follow a separate track (Chinese, CC BY 4.0); dated implementation evidence is recorded in [`docs/development/IMPLEMENTATION.md`](./docs/development/IMPLEMENTATION.md).

## [Unreleased]

## [0.1.0] - 2026-09-29

Initial public preview. The local engineering loop — contracts, types, tests, builds — passes end to end. Not yet production-grade: hosting, a real identity provider, and an independent security review are outstanding (see the [gap list](./docs/development/V1-GAPS.md)).

### Added

- **Contract-first foundation** (`@abh/contracts`): a single registry for public schemas, state machines, the error model, the HTTP protocol, and ports; TypeScript types, validators, an OpenAPI 3.1 document, and SQL constraints are generated from it, with a CI drift check.
- **Core engine** (`@abh/core`): Mission lifecycle (create → activate → pause/resume → close), Run task graphs with idempotency receipts and recovery workers, durable execution (pg-boss inbox/outbox, wait conditions, lease takeover, bounded recovery), and an authorization chain that re-checks grant, purpose, tenant scope, and version fence inside every database transaction.
- **Resource ledger**: period/unit catalogs, reservations, commitments, settlements, overage handling, and refund/exchange-rate corrections, with read-only balance and responsibility diagnostics.
- **Responsibility and decision layer**: responsibility assignments and routing, decision approvals with evidence, corrections, human exceptions with governed resolution effects, and safety-stop candidates.
- **Capability packs**: staged → enabled → suspended → retired lifecycle with cosign signature verification on intake, pin verification, and double-signature retirement with successor-pack convergence.
- **Adapters**: HTTP ingress on Fastify (`@abh/adapter-fastify`), queue delivery on PostgreSQL/pg-boss (`@abh/adapter-pg-boss`), and the Pi Agent runtime adapter (`@abh/adapter-pi`) that forces model and tool calls through injected gateways.
- **CLI** (`@abh/cli`): `abh run` explicit deployment hosting, `abh init --template hello-business` scaffolding, `abh pack compile-business`, and read-only `abh doctor` diagnostics (data, pack, candidate readiness).
- **Admin console** (`@abh/workbench`, optional): Next.js workbench with tokenized design system, authorized SSE projections with reconnect/resume, JSON Forms decision and action journeys, and Playwright e2e coverage.
- **Reference deployment** (`examples/hello-service`): a complete `abh run` service — migrations, identity provisioning, definitions and mission-authority registries, real pg-boss queue, drain journal, and startup readiness checks.
- **Engineering gate**: `pnpm check` — contract regeneration with drift check, documentation link check, type checks, a thousand-plus tests against a real PostgreSQL 16 via Testcontainers, builds, and the public API report.

### Known limitations

- Local closed-loop scope: real identity providers, production hosting, real external providers, and real-domain acceptance are not covered by this preview.
- An independent security review has not been performed; see [`SECURITY.md`](./SECURITY.md) before evaluating ABH for sensitive use.

[Unreleased]: https://github.com/GoatGit/ABH/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/GoatGit/ABH/releases/tag/v0.1.0

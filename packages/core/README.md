# @abh/core

[English](./README.md) | [简体中文](./README.zh-CN.md)

The ABH server engine, developed module by module against the design documents in `docs/V1`. It packages the authorization chain, mission/run execution, the resource ledger, durable execution, and the human gateways behind a set of explicit entry points.

## Entry points

| Import | Purpose |
| --- | --- |
| `@abh/core` (root) | `coreVersion` and the `defineBusiness` declaration |
| [`@abh/core/client`](src/CLIENT.md) | Browser-compatible typed HTTP client for decisions/actions |
| [`@abh/core/server`](src/server/README.md) | Service assembly: `Database`, `IdentityIngress`, `assembleAbhService`, `runHttpService` |
| `@abh/core/diagnostics` | `inspectDatabaseReadiness` — the read-only diagnostic behind `abh doctor data` |
| `@abh/core/evaluation` | HTTP evaluation dispatcher for the evaluation recovery worker |

Identity, credentials and mission installation always stay with the deployment; the server assembly does not invent them.

## Running and verifying

Pinned to Node 24.13.0 and pnpm 10.28.2. From the repo root, `pnpm check` runs contract generation, type checks, the real-PostgreSQL/OPA test suite, builds and the public API report. Integration tests use a pinned PostgreSQL 16.13 image digest, one isolated database per fixture, and need Docker.

- If Ryuk cannot download locally: `TESTCONTAINERS_RYUK_DISABLED=true pnpm check`.
- Tests run at most two files in parallel; leftover containers carry the `abh.purpose=isolated-integration-test` label.
- The largest test file (`actions.test.ts`) peaks around 2 GB RSS. Runners with ≥ 8 GB are fine; self-hosted VMs under 4 GB will be OOM-killed — a resource limit, not a defect.
- Seven real cosign signature tests need `ABH_TEST_COSIGN` pointing at a cosign 2.x CLI; they skip automatically when unset. CI pins v2.5.0.

Maintenance migrations: set `ABH_DATABASE_MIGRATION_URL`, then `pnpm --filter @abh/core migrate`. Regular apps never use migration credentials; `abh_runtime` and `abh_queue` have no default passwords.

## Implementation status

Implemented: tenant unit-of-work with in-transaction context/cancellation/lock ordering, command dedup and same-transaction audit/outbox; identity, grants, purpose/connection catalogs and revocation fences; the exact-decimal resource ledger with reservations, commitments and settlement; frozen responsibility seats with decision completion proofs; the action engine with real OPA policy evaluation, permits, attempts and receipts; reconciliation with unknown-outcome recovery; inbox dedup; and the durable wait owner with unique wakeups and compensation scans.

Still open: governance/bootstrap, full domain/scope/artifact admission, connector installation evidence (all have explicit fixture callbacks and must not be exposed as public routes yet), terminal-state corrections/exceptions, safe retry, and the full recovery strategy. Local fixture tests do not substitute for production governance, formal module gates, independent review, or SLO evidence.

Progress and per-batch evidence: the [implementation tracker](../../docs/development/IMPLEMENTATION.md) and the [database verification record](../../docs/development/M0-B-data.md) (both Chinese).

## Operational notes

- **Connection admission.** Tenant transactions, identity resolution and readiness share one admission gate sized to postgres.js `max` (1–1000). Waiting requests are served in arrival order and honor deadlines and abort signals; `Database.close` rejects requests that never got a slot.
- **Read-only diagnostics.** `inspectDatabaseReadiness` runs the same safety checklist as runtime startup on a separate read-only connection and returns only fixed check IDs, statuses, stable error codes and violation counts — never raw driver errors, SQL or credentials.
- **Policy fixture.** `test/fixtures/policy.wasm` is compiled from OPA 1.20.2; rebuild it with `node packages/core/scripts/build-policy-fixture.mjs` after pointing `ABH_OPA_PATH` at a digest-verified binary. The fixture does not replace real policy release governance.

## Upstream components

Runtime: postgres.js 3.4.9 (Unlicense), OPA-WASM 1.10.0 (Apache-2.0). Maintenance: node-pg-migrate 9.0.0 (MIT). Integration tests: Testcontainers PostgreSQL 12.1.0 (MIT). Contracts and public errors come from `@abh/contracts`.

Further internal reading: [durable assembly](src/durable/README.md), [human exception assembly](src/human/README.md), [CLI reference](../cli/README.md).

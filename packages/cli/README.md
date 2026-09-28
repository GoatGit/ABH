# @abh/cli

[English](./README.md) | [简体中文](./README.zh-CN.md)

The `abh` command line: project scaffolding, pack tooling, and read-only diagnostics. This is a workspace preview package — no release artifacts yet.

## Commands

| Command | What it does |
| --- | --- |
| `abh init` | Scaffold an Action-only business from a template |
| `abh pack build` | Build a canonical JSON manifest from declared payloads |
| `abh pack compile-business` | Compile a `defineBusiness` declaration into manifest + CTK plan |
| `abh pack validate` | Local, bounded pre-check of a pack against a deployment policy |
| `abh pack verify` | Verify payload bytes, digests, signature, provenance and signed CTK report |
| `abh pack sign` | Sign the pack with a deployment-pinned cosign binary |
| `abh doctor data` | Read-only database safety-checklist diagnostic |
| `abh doctor learning --candidate` | Check a learning candidate's release-readiness evidence |
| `abh doctor pack` | Check one exact pack installation record |
| `abh doctor ledger` | Rebuild and audit a ledger (bounded to 10,000 entries) |
| `abh doctor release` | Check a capability release's installation and execution readiness |
| `abh doctor operation` | Show an operation's recovery facts (permits, receipts, reconciliation) |
| `abh doctor inspection` | Query a persistent pack-inspection job through the public SDK |

## Shared conventions

- **Doctor commands are read-only.** They run in a `READ ONLY` transaction against the restricted runtime connection (`ABH_DATABASE_RUNTIME_URL`), never migrate or repair anything, and never fabricate evidence — successful output always has `commandRef=null` and `evidenceRefs=[]`. Fixing what they find goes through the audited command flows.
- **Connection URL rules.** `ABH_DATABASE_RUNTIME_URL` must be an explicit `postgres:`/`postgresql:` URL with host, user and database. Empty password is allowed; `PGPASSWORD` is never consulted. Only `sslmode=disable|require|verify-full` is accepted as a query parameter (default `disable`). Other parameters, duplicates and fragments are rejected; plain `PG*` environment variables never override anything.
- **Output.** `--format text|json` (default `text`), `--timeout-ms 100..30000` (default `10000`). stdout carries results only; stderr carries stable error codes only — never raw SQL, driver errors, connection URLs or catalog object names.
- **Exit codes.** `0` pass · `2` argument/configuration error · `3` identity/permission error · `4` safety-checklist mismatch (or a stop reason / invisible resource, depending on the command) · `6` dependency failure, deadline or cancellation.

## Notes on specific commands

- `abh doctor data` re-runs core's startup safety checklist (roles, schemas, RLS, grants, constraints, indexes, restricted functions, queue storage) against the live database. Build core first: `pnpm --filter @abh/core build`.
- `abh doctor inspection` talks to the HTTP API, not the database: set `ABH_API_BASE_URL` and `ABH_API_TOKEN` (HTTPS or explicit loopback only; no credentials in the URL). Exit code 0 only means a valid diagnostic was fetched — **if the job failed, you still get `Reported`/0**, so scripts must read `diagnostic.status` and `nextStep`.
- `abh init --template action-only` writes scaffolding validated by `resolveDevelopmentConfig`; it prints credential variable names only, never values. A non-empty target returns `TARGET_NOT_EMPTY`; `--force` replaces template-owned files only, after printing a bounded diff.
- Pack commands scan for symlinks, hard links, undeclared files, duplicate references and path escape, and never execute pack code. `pack build`/`compile-business` write local candidates only; `pack sign` requires keys through named environment refs and self-verifies with `verify-blob` before writing a 0600 bundle; `pack verify` passing does not install a pack or grant runtime authority.

## Not implemented yet

`dev`, full signed-pack verification, upgrade, import/export, the complete config schema, production secret-ref resolution and release packaging. Missing commands fail — they are never silent no-ops.

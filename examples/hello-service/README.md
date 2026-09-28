# hello-service — a reference `abh run` deployment

[English](./README.md) | [简体中文](./README.zh-CN.md)

A minimal but complete ABH service deployment. `abh run` assembles `service.mjs` from this directory, connects to a real PostgreSQL (96 migrations plus the pg-boss queue), and serves Mission lifecycle commands and queries over the public HTTP contract.

## What's in here

- `abh.config.json` — development config; `runtime.businessEntry` points at `service.mjs`
- `service.mjs` — a reference `createAbhServiceInstallation`:
  - identity: verifies the bearer token and maps it to a provisioned identity (`deployment.identity_locations`); swap in a real IdP for production
  - authorization: reads the current grant from `control.grants` on every call; core re-verifies it inside each transaction
  - definitions: CreateMission only accepts workflows/conditions/resource envelopes registered in `definitions.json`, with the workflow digest bound to the goal artifact
  - activation: ActivateMission resolves the current MissionAuthority from `deployment.mission_authorities`
  - queue: the real pg-boss adapter (schema 40) plus `LocalDrainJournal` for durable drain evidence
  - startup: the port opens only after the database readiness check passes

## Running it

```sh
# 1. Start PostgreSQL 16 (example values — inject real passwords through a protected mechanism)
docker run -d --name abh-hello -e POSTGRES_PASSWORD=devpass -p 54329:5432 \
  postgres:16

# 2. Apply migrations (migration_runner is the dedicated maintenance role)
export ABH_DATABASE_MIGRATION_URL='postgres://postgres:devpass@127.0.0.1:54329/postgres'
pnpm --filter @abh/core migrate

# 3. Provision identities, grants, fences and mission authorities (idempotent)
export ABH_PROVISION_ADMIN_URL="$ABH_DATABASE_MIGRATION_URL"
export ABH_ORGANIZATION_ID='00000000-0000-4000-8000-000000001234'
export ABH_SERVICE_TOKEN='dev-token-0123456789abcdef'
export ABH_RUNTIME_PASSWORD='runtimepass'
export ABH_QUEUE_PASSWORD='queuepass'
node provision.mjs

# 4. Start the service on the two restricted role connections
# (never start from the maintenance/admin connection; readiness rejects it)
# NOTE: the queue schema's internal tables are created by the queue role on first
# start — the first connection must be abh_queue. If a superuser ever connected
# to abh_pgboss, DROP SCHEMA abh_pgboss CASCADE and start over.
export ABH_DATABASE_RUNTIME_URL='postgres://abh_runtime:runtimepass@127.0.0.1:54329/postgres'
export ABH_DATABASE_QUEUE_URL='postgres://abh_queue:queuepass@127.0.0.1:54329/postgres'
export ABH_CURSOR_KEY='00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
export ABH_DRAIN_DIR="$PWD/.drain"; mkdir -p "$ABH_DRAIN_DIR"
pnpm abh run --config abh.config.json --host 127.0.0.1 --port 3000

# 5. Call it (on any migrated database, e.g. after creating a mission)
curl -s http://127.0.0.1:3000/v1/queries/abh.missions.list \
  -H 'authorization: Bearer dev-token-0123456789abcdef' \
  -H 'x-abh-organization: 00000000-0000-4000-8000-000000001234' \
  -H 'x-abh-purpose: abh.mission.manage'
# => {"asOf":"...","missions":[]}

# Troubleshooting: ABH_RUN_DEBUG=1 appends dependency-failure root causes to stderr
# (may contain upstream text; do not leave it on in production)
```

## Boundaries

- The single-token `ABH_SERVICE_TOKEN` identity and the `x-abh-*` headers are a **development setup**. Production requires a real IdP (see `identity-production.ts` in the workbench); organization and purpose come from the verified token claims.
- This example does not install the tenant worker loop (`runtime.tenant`) or the projection SSE subscription — add them as your deployment needs.
- `definitions.json` and `deployment.mission_authorities` are deployment-owned registry samples, not built-in governance.

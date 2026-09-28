# ABH — Agentic Business Harness

[![CI](https://github.com/GoatGit/ABH/actions/workflows/ci.yml/badge.svg)](https://github.com/GoatGit/ABH/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

English | [简体中文](./README.zh-CN.md)

ABH is a runtime harness for AI agents that do real work in a business. An agent answering questions can rely on itself; the moment it spends money, calls external services, or acts on someone's behalf, the business needs to know who authorized it, what it is allowed to do, what it actually did, and how to recover when something breaks halfway. ABH wires those answers into the runtime itself, and stays domain-neutral so any line of business can build on it.

The repo is a [pnpm](https://pnpm.io) workspace monorepo: a contract layer, a core engine, adapters for HTTP ingress / queues / the Pi Agent runtime, a CLI, and an optional admin console.

> **Status: 0.1.0 preview.** The local engineering loop is roughly 90% done — contracts, types, tests and builds pass end to end. Still missing: production hosting, a real identity provider, and an independent security review. The itemized state lives in the [gap list](./docs/development/V1-GAPS.md) (Chinese).

## What it does

- **Contract-first.** The public API, state machines, error model and ports are declared once in a registry. TypeScript types, validators, an OpenAPI 3.1 document and SQL constraints are generated from it, and CI fails on drift.
- **Authorization on every command.** Grant, purpose, tenant scope and version fence are re-checked inside each database transaction. No rights, no execution.
- **Full lifecycle.** Missions run create → activate → pause/resume → close. Runs form a task graph with idempotency receipts and recovery. Capability packs move through staged → enabled → suspended → retired, with signature verification on the way in.
- **Humans in the loop.** Decision approvals, corrections, exceptions and safety stops all land in an immutable audit trail.
- **A swappable agent runtime.** Core has no dependency on any agent framework. The Pi adapter keeps model and tool calls inside injected gateways; other runtimes can plug in through the same ports.
- **Domain-neutral core.** Business logic lives in packs, not in the engine. The marketing domain is developed separately in [lime-ads](https://github.com/GoatGit/lime-ads).

## Packages

| Package | Role |
| --- | --- |
| [`@abh/contracts`](./packages/contracts/README.md) | Generated contracts: schemas, states, errors, HTTP protocol, ports |
| [`@abh/core`](./packages/core/README.md) | The engine: missions, runs, the authorization chain, ledger, durable execution |
| [`@abh/adapter-pi`](./packages/adapter-pi/README.md) | Pi Agent runtime adapter — models and tools forced through gateways |
| [`@abh/adapter-fastify`](./packages/adapter-fastify/README.md) | HTTP ingress adapter |
| [`@abh/adapter-pg-boss`](./packages/adapter-pg-boss/README.md) | Queue delivery on PostgreSQL (pg-boss) |
| [`@abh/cli`](./packages/cli/README.md) | The `abh` command line |
| [`@abh/workbench`](./packages/workbench/README.md) | Optional Next.js admin console |

## Getting started

You need Node.js 24 (pinned in [`.nvmrc`](./.nvmrc)), pnpm 10.28 through corepack, and Docker if you want to run the integration tests.

```sh
git clone https://github.com/GoatGit/ABH.git
cd ABH
corepack pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` is the whole gate: contract regeneration with drift check, type checks, the test suite (a thousand-plus tests against a real PostgreSQL 16 managed by Testcontainers), builds, and the public API report. Contract generation runs offline; the tests need Docker once to pull the pinned image. Tests never call real models or external services.

To see a fully deployed service — migrations, provisioning, queues, HTTP — walk through the [hello-service example](./examples/hello-service/README.md).

### Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm contracts:generate` | Regenerate contract artifacts from the registry |
| `pnpm contracts:check` | Regenerate in a temp dir and fail on drift |
| `pnpm api:update` | Refresh the public API report after an intentional change (review the diff) |
| `pnpm abh doctor data --format json` | Read-only database diagnostics — see the [CLI reference](./packages/cli/README.md) |

## FAQ

**Do I need Docker to contribute?**

Only for the test suite: integration tests run against a real PostgreSQL 16 managed by Testcontainers. Contract generation, type checks, builds, and the documentation link check all run offline without Docker.

**Why do a few `@abh/core` tests skip locally?**

Seven real-signature tests run only when `ABH_TEST_COSIGN` points at a **cosign 2.x** CLI; they skip automatically otherwise. CI pins cosign v2.5.0 — 3.x removed `--tlog-upload` and will not work. See [CONTRIBUTING.md](./CONTRIBUTING.md).

**One core test file gets killed on my machine.**

`actions.test.ts` (the OPA WASM control snapshot) transiently peaks around 2 GB RSS. Sub-4 GB Docker VMs will OOM-kill it; keep 8 GB or more for self-hosted CI. It passes on GitHub runners.

**Do tests call real models or external services?**

No. The suite uses in-repo fakes and the Pi adapter invoked against test doubles — no real model calls, no real business services.

**Can I run ABH in production today?**

Not yet. This is a 0.1.0 preview: production hosting, a real identity provider, and an independent security review are still open. Read [`SECURITY.md`](./SECURITY.md) and the [gap list](./docs/development/V1-GAPS.md) before evaluating ABH for sensitive use.

**How is ABH different from an agent framework?**

Core has no dependency on any agent framework — the agent runtime plugs in through ports (the Pi adapter is one implementation). ABH owns what a framework leaves out: authorization on every command, the ledger, durable execution, audit, and recovery.

## Contributing

Contributions are welcome — bug reports, documentation, and help closing the open gaps. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, the `pnpm check` gate, and the contract-first workflow; proposals belong in [issues](https://github.com/GoatGit/ABH/issues) and security reports in the [private advisory flow](./SECURITY.md). All participants agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Documentation

- **[The ABH paper](./docs/V1/00-总体设计/Building-Agentic-Business-Harness-on-Agent-Harness.md)** — the design-science paper behind ABH: why an agent harness alone is not enough for a real business, and what a business-grade harness adds (CC BY 4.0, Chinese with English abstract)
- [Design documents index](./docs/V1/README.md) (Chinese) — overall design plus 33 module specifications
- [Implementation tracker](./docs/development/IMPLEMENTATION.md) (Chinese)
- [CLI reference](./packages/cli/README.md)

## License

Code, specs, SDK and examples are released under the [MIT License](./LICENSE). The design paper under `docs/V1` is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Third-party dependencies keep their own licenses.

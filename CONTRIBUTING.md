# Contributing to ABH

English | [简体中文](./CONTRIBUTING.zh-CN.md)

Thank you for considering a contribution to ABH (Agentic Business Harness). This document explains how to set up the repository, how the engineering gate works, and what a good pull request looks like.

> **Status: 0.1.0 preview.** The local engineering loop (contracts, types, tests, builds) passes end to end. Production hosting, a real identity provider, and an independent security review are still open — the itemized state lives in the [gap list](./docs/development/V1-GAPS.md) (Chinese). Issues and PRs that help close those gaps are especially welcome.

## Code of conduct

By participating in this project you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Repository setup

You need:

- **Node.js 24** — the exact version is pinned in [`.nvmrc`](./.nvmrc)
- **pnpm 10.28** — provided automatically through corepack (no global install needed)
- **Docker** — the test suite runs against a real PostgreSQL 16 managed by Testcontainers
- **cosign 2.x (optional)** — seven real-signature tests in `@abh/core` run only when `ABH_TEST_COSIGN` points at a cosign 2.x CLI; they skip automatically otherwise. CI pins v2.5.0 (cosign 3.x removed `--tlog-upload` and will not work).

```sh
git clone https://github.com/GoatGit/ABH.git
cd ABH
corepack pnpm install --frozen-lockfile
pnpm check
```

A green `pnpm check` on a fresh clone means your environment is correct.

## How the repo is organized

A [pnpm](https://pnpm.io) workspace monorepo:

| Package | Role |
| --- | --- |
| [`@abh/contracts`](./packages/contracts/) | Machine-generated contracts: schemas, state machines, errors, HTTP protocol, ports |
| [`@abh/core`](./packages/core/) | The engine: missions, runs, the authorization chain, ledger, durable execution |
| [`@abh/adapter-pi`](./packages/adapter-pi/) | Pi Agent runtime adapter |
| [`@abh/adapter-fastify`](./packages/adapter-fastify/) | HTTP ingress adapter |
| [`@abh/adapter-pg-boss`](./packages/adapter-pg-boss/) | Queue delivery on PostgreSQL (pg-boss) |
| [`@abh/cli`](./packages/cli/) | The `abh` command line |
| [`@abh/workbench`](./packages/workbench/) | Optional Next.js admin console |

Design documents live under [`docs/V1`](./docs/V1/README.md) (overall design plus module specifications, Chinese); the implementation tracker and the gap list live under [`docs/development`](./docs/development/).

## Making changes

ABH is **contract-first**: the public API, state machines, error model, and ports are declared once in registries under `packages/contracts`, and TypeScript types, validators, the OpenAPI 3.1 document, and SQL constraints are generated from them. CI fails on drift.

1. **Behavior changes touching the public surface** start in the contract registry: edit the relevant registry (protocol / states / errors / ports), then run `pnpm contracts:generate` and commit the regenerated artifacts together with your change.
2. **Intentional public API changes** require refreshing the API report: run `pnpm api:update` and review the diff. CI fails if the report is stale.
3. **Documentation changes** are validated by `pnpm docs:check`, which verifies every relative link (and heading anchors in Markdown targets) across the repo. Run it after moving or renaming files.
4. **Tests must never call real models or external business services.** Use the in-repo fakes and Testcontainers-based PostgreSQL fixtures.

## The engineering gate

`pnpm check` is the single gate every change must pass. It runs, in order:

| Step | Command | What it does |
| --- | --- | --- |
| Verification records | `pnpm verification:check` | Validates recorded verification evidence |
| Documentation | `pnpm docs:check` | Checks all relative Markdown links and heading anchors |
| Contracts | `pnpm contracts:check` | Regenerates contract artifacts into a temp dir and fails on drift |
| Types | `pnpm typecheck` | Builds all packages, then typechecks them |
| Tests | `pnpm test` | The full suite — a thousand-plus tests against a real PostgreSQL 16 |
| Builds | `pnpm build` | Builds all packages |
| API report | `pnpm api:check` | Fails when the public API report is out of date |

Practical notes:

- The first test run pulls the pinned `postgres:16` image; subsequent runs are offline.
- One core test file (`actions.test.ts`, the OPA WASM control snapshot) transiently peaks around 2 GB RSS. Machines with sub-4 GB Docker VMs may see that file OOM-killed — this is an environment limit, not a product defect. Keep runner memory at 8 GB or more if self-hosting CI.
- To run only the package you touched: `pnpm --filter @abh/core test` (the same `--filter` pattern works for `build` and `typecheck`).

## Commit and pull request guidelines

- Follow the existing Conventional Commits style: `type(scope): subject`, e.g. `fix(core): ...`, `docs(cli): ...`, `feat(contracts): ...`.
- Keep pull requests focused: one logical change per PR, with a description that says what changed and why.
- CI must be green (`check` and `e2e` jobs). If you could not run the full suite locally, say so in the PR.
- New user-facing behavior should come with tests, and README-affecting changes (commands, package roles) must be reflected in **both** `README.md` and `README.zh-CN.md`.
- Do not commit secrets, real connection strings, or environment files; `.env*` is ignored except `.env.example`.

## Reporting bugs and suggesting features

- **Bugs**: open a GitHub issue using the bug report template. Include the command you ran, the full error output, and your environment (Node/pnpm/Docker versions).
- **Features and design**: open an issue with the feature template first; large changes should be discussed before implementation. If your idea touches the contract layer or the authorization chain, link the relevant module specification under `docs/V1`.

## Security

Do not open public issues for security vulnerabilities. See [`SECURITY.md`](./SECURITY.md) for the private reporting channel.

## Licensing

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE) that covers this repository. Documentation under `docs/V1` is licensed CC BY 4.0. No CLA is required.

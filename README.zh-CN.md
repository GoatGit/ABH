# ABH — Agentic Business Harness

[![CI](https://github.com/GoatGit/ABH/actions/workflows/ci.yml/badge.svg)](https://github.com/GoatGit/ABH/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

[English](./README.md) | 简体中文

ABH 是给"在业务里干活的" AI 智能体准备的运行框架。一个只负责回答问题的智能体可以自己说了算；可一旦它要花钱、调外部服务、替人办事，业务方就必须能回答四个问题：谁授权的？允许它做什么？它实际做了什么？中途出了问题怎么恢复？ABH 把这些答案直接做进运行时，并且保持领域中立——任何业务都可以基于它来搭建。

仓库是 [pnpm](https://pnpm.io) workspace monorepo：契约层、核心引擎、HTTP 入站 / 队列 / Pi Agent 运行时三类适配器、CLI，以及一个可选的管理台。

> **当前状态：0.1.0 Preview。** 本地工程闭环完成约 90%——契约、类型、测试、构建可以端到端跑通。尚未完成：生产托管、真实身份 Provider、独立安全审查。逐项明细见[缺口清单](./docs/development/V1-GAPS.md)。

## 它做什么

- **契约优先。** 公开 API、状态机、错误模型、端口都在注册表里声明一次；TypeScript 类型、校验器、OpenAPI 3.1 文档、SQL 约束全部由它生成，CI 会检查漂移。
- **每条命令都过授权链。** Grant、用途、租户 Scope、版本 fence 在每个数据库事务内复核，缺权直接拒绝。
- **完整生命周期。** Mission 走 Create → Activate → Pause/Resume → Close；Run 是带幂等回执和恢复能力的任务图；能力 Pack 按 Staged → Enabled → Suspended → Retired 演进，接入前验签名。
- **人在回路。** Decision 审批、纠错、异常接管、安全停止，全部落不可变审计记录。
- **Agent 运行时可替换。** Core 不依赖任何 Agent 框架。Pi 适配器把模型与工具调用强制收进注入的 Gateway；其他运行时走同样的端口接入。
- **核心领域中立。** 业务逻辑放在 Pack 里，不进引擎。营销领域在独立的 [lime-ads](https://github.com/GoatGit/lime-ads) 仓库开发。

## 包结构

| 包 | 职责 |
| --- | --- |
| [`@abh/contracts`](./packages/contracts/README.md) | 机器生成契约：Schema、状态、错误、HTTP 协议、端口 |
| [`@abh/core`](./packages/core/README.md) | 核心引擎：Mission/Run 执行、授权执行链、账本、持久执行 |
| [`@abh/adapter-pi`](./packages/adapter-pi/README.md) | Pi Agent 运行时适配——模型与工具强制经 Gateway |
| [`@abh/adapter-fastify`](./packages/adapter-fastify/README.md) | HTTP 入站适配器 |
| [`@abh/adapter-pg-boss`](./packages/adapter-pg-boss/README.md) | 基于 PostgreSQL（pg-boss）的队列投递 |
| [`@abh/cli`](./packages/cli/README.md) | `abh` 命令行 |
| [`@abh/workbench`](./packages/workbench/README.md) | 可选的 Next.js 管理台 |

## 快速开始

准备 Node.js 24（版本固定在 [`.nvmrc`](./.nvmrc)）、经 corepack 提供的 pnpm 10.28；跑集成测试需要 Docker。

```sh
git clone https://github.com/GoatGit/ABH.git
cd ABH
corepack pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` 是完整的门禁：契约重新生成与漂移检查、类型检查、测试套件（一千余个测试，跑在 Testcontainers 管理的真实 PostgreSQL 16 上）、构建、公开 API 报告。契约生成可离线运行；测试首次需要 Docker 拉取固定镜像。测试不会调用真实模型或外部业务服务。

想看一个完整部署的服务——迁移、身份预备、队列、HTTP——请走一遍 [hello-service 示例](./examples/hello-service/README.md)。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm contracts:generate` | 从注册表重新生成契约制品 |
| `pnpm contracts:check` | 在临时目录重新生成并检查漂移 |
| `pnpm api:update` | 有意更改公开 API 后刷新报告（请审阅差异） |
| `pnpm abh doctor data --format json` | 只读数据库诊断——见 [CLI 文档](./packages/cli/README.md) |

## 文档

- [设计文档索引](./docs/V1/README.md)——总体设计与 33 份模块规范
- [实施跟踪](./docs/development/IMPLEMENTATION.md)
- [CLI 参考](./packages/cli/README.md)

## 许可证

代码、规范、SDK 与示例采用 [MIT 许可证](./LICENSE)。`docs/V1` 下的设计论文采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。第三方依赖保留各自原许可。

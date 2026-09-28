# 参与 ABH 贡献

[English](./CONTRIBUTING.md) | 简体中文

感谢你考虑为 ABH（Agentic Business Harness）做贡献。本文档说明如何搭建仓库环境、工程门禁如何运作，以及一个合格的 PR 长什么样。

> **当前状态：0.1.0 Preview。** 本地工程闭环（契约、类型、测试、构建）已端到端跑通；生产托管、真实身份 Provider、独立安全审查仍未完成——逐项明细见[缺口清单](./docs/development/V1-GAPS.md)。欢迎提交能推进这些缺口的 Issue 与 PR。

## 行为准则

参与本项目即表示你同意遵守[行为准则](./CODE_OF_CONDUCT.md)。

## 环境准备

需要：

- **Node.js 24**——精确版本固定在 [`.nvmrc`](./.nvmrc)
- **pnpm 10.28**——经 corepack 自动提供，无需全局安装
- **Docker**——测试套件跑在 Testcontainers 管理的真实 PostgreSQL 16 上
- **cosign 2.x（可选）**——`@abh/core` 有 7 个真实签名测试，仅在 `ABH_TEST_COSIGN` 指向 cosign 2.x CLI 时运行，未设置时自动跳过。CI 固定 v2.5.0（cosign 3.x 移除了 `--tlog-upload`，不可用）。

```sh
git clone https://github.com/GoatGit/ABH.git
cd ABH
corepack pnpm install --frozen-lockfile
pnpm check
```

全新克隆上 `pnpm check` 全绿，即说明你的环境正确。

## 仓库结构

[pnpm](https://pnpm.io) workspace monorepo：

| 包 | 职责 |
| --- | --- |
| [`@abh/contracts`](./packages/contracts/) | 机器生成契约：Schema、状态机、错误、HTTP 协议、端口 |
| [`@abh/core`](./packages/core/) | 核心引擎：Mission/Run 执行、授权执行链、账本、持久执行 |
| [`@abh/adapter-pi`](./packages/adapter-pi/) | Pi Agent 运行时适配器 |
| [`@abh/adapter-fastify`](./packages/adapter-fastify/) | HTTP 入站适配器 |
| [`@abh/adapter-pg-boss`](./packages/adapter-pg-boss/) | 基于 PostgreSQL（pg-boss）的队列投递 |
| [`@abh/cli`](./packages/cli/) | `abh` 命令行 |
| [`@abh/workbench`](./packages/workbench/) | 可选的 Next.js 管理台 |

设计文档在 [`docs/V1`](./docs/V1/README.md)（总体设计加各模块规范，中文）；实施跟踪与缺口清单在 [`docs/development`](./docs/development/)。

## 如何改动

ABH 是**契约优先**的：公开 API、状态机、错误模型、端口都在 `packages/contracts` 下的注册表里声明一次，TypeScript 类型、校验器、OpenAPI 3.1 文档、SQL 约束全部由它生成。CI 会检查漂移。

1. **触及公开面的行为改动**从契约注册表开始：先改对应注册表（protocol / states / errors / ports），再运行 `pnpm contracts:generate`，并把重新生成的制品与你的改动一起提交。
2. **有意更改公开 API** 后必须刷新 API 报告：运行 `pnpm api:update` 并审阅差异。报告过期会让 CI 失败。
3. **文档改动**由 `pnpm docs:check` 校验，它会检查全仓相对链接（Markdown 目标还会校验标题锚点）。移动或重命名文件后请运行它。
4. **测试不得调用真实模型或外部业务服务。**请使用仓库内的 fake 与基于 Testcontainers 的 PostgreSQL 夹具。

## 工程门禁

`pnpm check` 是所有改动必须通过的唯一门禁，按顺序执行：

| 步骤 | 命令 | 作用 |
| --- | --- | --- |
| 验证记录 | `pnpm verification:check` | 校验已记录的验证证据 |
| 文档 | `pnpm docs:check` | 检查全部相对 Markdown 链接与标题锚点 |
| 契约 | `pnpm contracts:check` | 在临时目录重新生成契约制品，有漂移即失败 |
| 类型 | `pnpm typecheck` | 先构建全部包，再做类型检查 |
| 测试 | `pnpm test` | 完整套件——一千余个测试跑在真实 PostgreSQL 16 上 |
| 构建 | `pnpm build` | 构建全部包 |
| API 报告 | `pnpm api:check` | 公开 API 报告过期即失败 |

实用说明：

- 首次跑测试会拉取固定的 `postgres:16` 镜像，之后可离线运行。
- core 有一个测试文件（`actions.test.ts`，OPA WASM 控制快照）峰值 RSS 短时约 2 GB；低于 4 GB 的本地 Docker 虚拟机会把它 OOM 杀掉——这是环境限制，不是产品缺陷。自托管 CI 请保证运行内存 ≥ 8 GB。
- 只跑你改动的包：`pnpm --filter @abh/core test`（`build`、`typecheck` 同样支持 `--filter`）。

## 提交与 PR 规范

- 遵循仓库现有的 Conventional Commits 风格：`type(scope): subject`，例如 `fix(core): ...`、`docs(cli): ...`、`feat(contracts): ...`。
- PR 保持聚焦：一个 PR 只做一个逻辑改动，描述写清楚改了什么、为什么改。
- CI 必须全绿（`check` 与 `e2e` 两个 job）。若本地没有跑完整套件，请在 PR 中说明。
- 新增面向用户的行为要有测试；影响 README 的改动（命令、包职责）必须同步更新 `README.md` 与 `README.zh-CN.md` 两个版本。
- 不要提交密钥、真实连接串或环境文件；`.env*` 已被忽略，`.env.example` 除外。

## 报告缺陷与建议功能

- **缺陷**：用缺陷报告模板开 GitHub Issue。附上你执行的命令、完整错误输出和环境信息（Node/pnpm/Docker 版本）。
- **功能与设计**：先用功能建议模板开 Issue 讨论，大改动请先对齐再实现。若想法触及契约层或授权链，请链接 `docs/V1` 下对应的模块规范。

## 安全

安全漏洞不要开公开 Issue。私有上报渠道见 [`SECURITY.md`](./SECURITY.md)。

## 许可

提交贡献即表示你同意其按覆盖本仓库的 [MIT 许可证](./LICENSE)授权。`docs/V1` 下的文档采用 CC BY 4.0。本项目不要求签署 CLA。

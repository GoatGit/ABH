# Agentic Business Harness（ABH）

ABH 是面向业务智能体的运行框架：将组织责任、授权、资源约束、外部操作、结果确认与恢复连接起来，通过公开契约承载不同领域的产品。

当前处于 **0.1.0 Preview / M0-D，实现推进约 90%；生产托管与最终验收未完成**。33 份 V1 设计模块中 31 份已有契约和/或实现：公共契约/状态/授权执行链、Mission 完整生命周期（Create→Activate→Pause/Cancel/Resume/Block/ReviseGoal/Close + Trigger 去重 + Blocker）、Run 公共生命周期（Start/Complete/幂等回执/ActiveRun 同步/静态 Assignment PinSet/Tasks）、Context Manifest、Verification、Learning Signal Capture、Identity/Ledger、Tool Gateway（Binding/Invoke/幂等 callKey）、Model Gateway（Route/Call）、Action/Operation/Reconciliation、Durable Execution、Artifact/Audit、Pack 生命周期（Staged→Enabled→Suspended→Retired）、Responsibility/Decision、Projection（MissionSummary 读模型）、Pi Agent 契约（AgentTaskContract/RuntimeEvent/InvocationHandle）、Pi Agent 0.85.1 运行时适配基础和 SDK/CLI。OpenAPI 33 路径通过 HTTP 暴露，`abh mission` CLI 支持 list/get/activate/pause/cancel/verify。

## 开发

使用 `.nvmrc` 固定的 Node.js 24.13.0 和 pnpm 10.28.2：

```sh
cd ~/AI/ABH
nvm use
corepack pnpm install --frozen-lockfile
pnpm check
```

```sh
pnpm contracts:generate  # 从 Schema / YAML 注册表生成制品
pnpm contracts:check     # 临时目录重新生成，检查漂移，不改工作区
pnpm contracts:test     # 契约负例、状态组合、生成稳定性与浏览器执行
pnpm api:update         # 有意更改公开 API 时，构建并更新报告，需审阅差异
pnpm api:check          # 构建后核对公开 API 报告；已包含在 pnpm check
```

契约生成和契约测试可离线运行。完整 `pnpm check` 还需要 Docker，Testcontainers 会用固定 PostgreSQL 16 镜像创建独立测试实例；首次使用需要下载镜像。测试不调用真实模型或外部业务服务。容器与维护运行说明见 [Core README](./packages/core/README.md)。

开发诊断入口：`pnpm abh doctor data --format json`（需先构建 Core 并显式配置受限连接），参数与退出码见 [CLI README](./packages/cli/README.md)。

## 文档与边界

- [设计索引](./docs/V1/README.md)
- [持续实现跟踪](./docs/development/IMPLEMENTATION.md)
- [M0-A 实施记录](./docs/development/M0-A.md)
- [M0-B 持久层实施记录](./docs/development/M0-B-data.md)
- [Action/Decision 与传输契约实施记录](./docs/development/M0-A-contracts.md)
- [配置、目录与 Port 实施记录](./docs/development/M0-A-foundation.md)
- [公开契约包](./packages/contracts/README.md)
- [迁移清单与源文件摘要](./docs/migrations/2026-09-07-from-lime-ads.json)
- [Lime Ads 领域产品](https://github.com/GoatGit/lime-ads)

ABH Core 保持领域中立。营销设计留在 lime-ads；其他领域通过 Pack 和 Connector 接入。M0-D 的 Pi Adapter（`@abh/adapter-pi`）已接入 Pi Agent 0.85.1 开源组件，要求模型与工具分别通过注入 Gateway 执行，并提供契约事件、有界缓冲、预算/截止/取消基础；继续恢复与完整 CTK 矩阵仍按 V1 推进。

代码、规范、SDK、CTK 与示例采用 [Apache-2.0](./LICENSE)；[论文](./docs/V1/00-总体设计/Building-Agentic-Business-Harness-on-Agent-Harness.md)采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。第三方依赖保留原许可。

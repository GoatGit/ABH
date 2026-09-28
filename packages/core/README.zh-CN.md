# @abh/core

[English](./README.md) | 简体中文

ABH 服务端引擎，按 `docs/V1` 的设计逐模块实现。它把授权执行链、Mission/Run 执行、资源账本、持久执行与人工网关，收拢在一组显式入口之后。

## 入口一览

| 导入 | 用途 |
| --- | --- |
| `@abh/core`（根） | `coreVersion` 与 `defineBusiness` 声明 |
| [`@abh/core/client`](src/CLIENT.md) | 浏览器兼容的类型化 Decision/Action HTTP 客户端 |
| [`@abh/core/server`](src/server/README.md) | 服务装配：`Database`、`IdentityIngress`、`assembleAbhService`、`runHttpService` |
| `@abh/core/diagnostics` | `inspectDatabaseReadiness`——`abh doctor data` 背后的只读诊断 |
| `@abh/core/evaluation` | 评测恢复 Worker 的 HTTP 评测派发器 |

身份、凭证与 Mission 安装始终由部署显式提供，服务装配不会替你发明它们。

## 运行与验证

固定 Node 24.13.0 与 pnpm 10.28.2。在仓库根目录执行 `pnpm check`：契约生成、类型检查、真实 PostgreSQL/OPA 测试、构建、公开 API 报告。集成测试使用固定的 PostgreSQL 16.13 镜像摘要，每个 Fixture 一个隔离数据库，需要 Docker。

- 本机 Ryuk 下载受阻时：`TESTCONTAINERS_RYUK_DISABLED=true pnpm check`。
- 测试最多并行两个文件；遗留容器带 `abh.purpose=isolated-integration-test` 标签，可按标签清理。
- 最大的测试文件（`actions.test.ts`）峰值约 2 GB RSS。≥ 8 GB 内存的 runner 没问题；< 4 GB 的自托管 VM 会被 OOM SIGKILL——是资源限制，不是产品缺陷。
- 7 项真实 Cosign 签名测试需要 `ABH_TEST_COSIGN` 指向 cosign 2.x CLI；未设置时自动跳过。CI 钉住 v2.5.0。

维护迁移：设置 `ABH_DATABASE_MIGRATION_URL` 后运行 `pnpm --filter @abh/core migrate`。普通应用不使用迁移凭据；`abh_runtime` 与 `abh_queue` 默认无密码，由部署单独配置。

## 实现状态

已实现：租户 UoW（事务局部 Context、取消/截止、固定锁序、Command 去重、同事务 Audit/Outbox）；Identity/Grant、Purpose/Connection 目录与撤销 fence；精确十进制资源账本（Reservation、Commitment、Settlement）；冻结责任席位与 Decision 完成证明；Action 引擎（真实 OPA 策略求值、Permit/Attempt/Receipt）；带 Unknown 恢复的 Reconciliation；Inbox 去重；持久等待 Owner（唯一唤醒与补偿扫描）。

待完成：治理/bootstrap、完整 Domain/Scope/Artifact admission、Connector 安装证据（这些都有明确的 Fixture 回调，不能直接接成公共路由）、终态 Correction/Exception、安全重试与完整恢复策略。本地 Fixture 测试不替代生产治理、正式模块门禁、独立审查或 SLO 证据。

进度与分批证据：[实施跟踪](../../docs/development/IMPLEMENTATION.md)与[数据库验证记录](../../docs/development/M0-B-data.md)。

## 运维要点

- **连接准入。** 租户事务、身份定位与 readiness 共用一个准入闸，额度与 postgres.js `max` 一致（1—1000）。等待按进入顺序服务，并响应 deadline 与 AbortSignal；`Database.close` 会拒绝未取得额度的请求。
- **只读诊断。** `inspectDatabaseReadiness` 用单独只读连接执行与启动相同的安全清单，只返回固定检查 ID、状态、稳定错误码与违规数——不返回原始驱动错误、SQL 或凭据。
- **策略 Fixture。** `test/fixtures/policy.wasm` 由 OPA 1.20.2 编译；将 `ABH_OPA_PATH` 指向已核对摘要的二进制后，运行 `node packages/core/scripts/build-policy-fixture.mjs` 重建。Fixture 不替代正式的 Policy 发布治理。

## 上游组件

运行时：postgres.js 3.4.9（Unlicense）、OPA-WASM 1.10.0（Apache-2.0）。维护：node-pg-migrate 9.0.0（MIT）。集成测试：Testcontainers PostgreSQL 12.1.0（MIT）。契约与公开错误来自 `@abh/contracts`。

延伸阅读：[Durable 内部装配](src/durable/README.md)、[Human Exception 内部装配](src/human/README.md)、[CLI 参考](../cli/README.md)。

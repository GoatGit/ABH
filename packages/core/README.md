# @abh/core

ABH 服务端内部模块，按 `docs/V1` 持续实现。根入口导出 `coreVersion` 与 `defineBusiness` 声明；浏览器兼容的 [`@abh/core/client`](src/CLIENT.md) 提供类型化 Decision/Action HTTP 调用；[`@abh/core/server`](src/server/README.md) 提供 `Database`/`IdentityIngress`/`assembleAbhService`/`runHttpService` 的服务组合入口，身份、凭证与 Mission 安装仍由部署显式提供。

## 运行与验证

固定 Node 24.13.0、pnpm 10.28.2。根目录 `pnpm check` 检查契约生成、类型、真实 PostgreSQL/OPA 测试、构建和公开 API 报告，需要 Docker。测试使用 PostgreSQL 16.13 镜像摘要，为每个 Fixture 创建隔离数据库，完成后关闭连接并删除容器。

本机 Ryuk 下载受阻时使用 `TESTCONTAINERS_RYUK_DISABLED=true pnpm check`。测试最多并行两个文件，夹具会清理启动失败的实例；进程被强行终止后，可按 `abh.purpose=isolated-integration-test` 标签检查本项目遗留容器。

维护进程设置 `ABH_DATABASE_MIGRATION_URL` 后运行 `pnpm --filter @abh/core migrate`。普通应用不使用迁移凭据。`abh_runtime` 和 `abh_queue` 默认没有密码，由部署的凭据管理单独配置。破坏性回滚须使用独立维护迁移。

## 当前内部实现

- PostgreSQL Tenant UoW、事务局部 Context、取消/截止时间、固定锁序、Command 去重、CAS、同事务 Audit/Outbox，以及 RLS/角色/表/函数/状态约束的启动核验。
- 当前 Identity/Membership/Grant、跨组织最小 Workspace 核验、Purpose/Connection 目录、撤销 fence、静态 Release/Assignment/完整 PinSet。
- 精确十进制 Ledger、周期/单位目录、Reservation、Commitment/Settlement、Refund/FX Correction、实际超额冻结，以及受当前权限约束的内联 Artifact/摘要/墓碑。
- 冻结 ANY/ALL 责任席位、Decision 与整体完成证明、有限 Service Grant/Action ExecutionAuthority Effect。
- Action 不可变意图/Plan、真实 OPA Mandatory + 固定 Behavior、T1 Snapshot/资源预留、完整批准及当前来源回验。
- WorkLease 与不设 TTL 的未决资源占位、T2 Permit/Attempt、提交后一次性受信出口、Stateful Fake Provider。
- Receipt、完整证据 Reconciliation、Unknown 恢复、当前 Controller 最终判定、有限 Action 结果与原子资源结算。
- 零派发取消/到期/重授权、保留原 Hold 的 Snapshot Refresh，以及从已确认父结果解析声明输入并在 Permit 固定实际 payloadDigest。
- 自动 TransportCapture：原始字节、归一化 Receipt、Attempt 观察同事务；独立观察入口支持失租约/撤执行权后的迟到回执。进程内保存重试不重发 Provider；已终结的 Attempt 不重开。
- Inbox 与实际 Owner 效果同事务，按消费者/事件去重；语义重投和 Command 重放均重验当前权限。队列交付本身不授予执行资格。
- DurableWaitOwner 持久化等待与源水位，注册立即回读条件；Timer/信号/取消以 CAS 竞争，唯一 Wakeup 与 Audit/Outbox 同事务。Tenant 补偿扫描支持丢失信号后的回读恢复。

## 待完成与验证边界

治理/bootstrap、完整 Domain/Scope/Artifact admission 和 Connector 安装证据仍有明确 Fixture 回调，不能直接接成公共路由。独立 Query Authority 与已派发取消已有内部实现；终态 Correction/Exception、安全重试、持续外部责任与完整恢复策略继续实现。

内联 Artifact 上限 64 KiB UTF-8；二进制原始回执使用无损 base64 包装，上限 48,000 bytes。FilesystemObjectStore 支持单主机 durable 大对象 staging、digest/size 复核、streaming 读取、lineage、保留/删除证明和导出；公开上传用 Artifact 级回执预约去重。生产上传扫描/隔离、跨主机/云 ObjectStore 与完整 Domain 验收仍需宿主实现。保存失败的进程内句柄不会跨重启保存，进程丢失后仍须独立 Query 查回。

Outbox 冻结扇出与 Inbox 已持久化；真实 pg-boss 已验证队列角色隔离、入队超时查回、确认丢失重投和有界排空。DurableWaitOwner 已持久化等待、源水位回读、唯一唤醒、取消及 Tenant 补偿扫描；Wait Port 已与 pg-boss 组合，并接入真实 Action/Decision 授权请求等待、Operation 对账完成等待和 Inbox 通知；发布扫描与租户内 Worker 装配已有实现。HTTP、typed SDK、Mission/Run/Pi、显式 `abh run` 宿主和其余业务 Owner 已有本地闭环；`defineBusiness` 声明、hello-business 模板和本地 Manifest/CTK 计划编译已实现，生产身份/安装治理、发行验收及完整故障矩阵待完成。本地 Fixture 测试不替代生产治理、正式模块门禁、独立审查或 SLO 证据。

完整实现进度与分批证据见 [实施跟踪](../../docs/development/IMPLEMENTATION.md) 和 [数据库验证记录](../../docs/development/M0-B-data.md)。

## 上游组件

运行时使用 postgres.js 3.4.9（Unlicense）、OPA-WASM 1.10.0（Apache-2.0）；维护使用 node-pg-migrate 9.0.0（MIT）；集成测试使用 Testcontainers PostgreSQL 12.1.0（MIT）。契约和公开错误来自 `@abh/contracts`。

测试的 `test/fixtures/policy.wasm` 由 OPA 1.20.2 编译，源码与摘要在相邻文件。重建时将 `ABH_OPA_PATH` 指向已核对发行摘要的二进制，再运行 `node packages/core/scripts/build-policy-fixture.mjs`。Fixture 策略不替代正式 Policy 发布治理。

Wait Port 和 Action 业务装配说明见 [Durable 内部装配](src/durable/README.md)。


## 数据库连接等待

Database 的租户事务、最小身份定位与 readiness 核验共用内部 ConnectionAdmission，活动额度与 postgres.js 的 max 一致（1—1000）。等待项按进入顺序获得额度，最多 1000 项；超出返回 LIMIT_EXCEEDED。等待期间响应请求 deadline、Context 到期与 AbortSignal，失效项在调用底层 SQL 前删除，不在连接释放后执行已取消的业务回调。Database.close 拒绝尚未取得额度的请求，并阻止后续进入；已开始的数据库操作仍按原生连接关闭/事务回滚规则处理。

事务额度在提交或回滚结束后释放。租户 GUC 仍只在事务内设置；连接额度不是身份或业务权限。该入口控制避免将无限等待请求交给底层连接池，不替代数据库连接建立、事务初始化及网络故障的超时策略。

终态矛盾报告的异常责任绑定见 [Human Exception 内部装配](src/human/README.md)。

## 数据库只读诊断

公开入口 `@abh/core/diagnostics` 提供 `inspectDatabaseReadiness({ connectionString, signal, timeoutMs })`。它用单独只读连接执行与 runtime 启动相同的安全清单，返回 Contract Package 的 `DatabaseDiagnosticResult`，并在成功、失败、超时和取消后关闭连接。只返回固定检查 ID、状态、稳定错误码和违规项数量，不返回原始驱动错误、SQL、连接凭据或目录对象名称。

该入口没有租户查询、迁移或修复权限，也不签发 Context 或业务 Authority。`@abh/cli` 的 `doctor data` 使用此公开入口，连接参数、输出与退出码见 [CLI README](../cli/README.md)。

### 查询已启用能力

```ts
import { createAbhClient } from '@abh/core/client';

const client = createAbhClient({ baseUrl, headers: async () => ({ authorization: `Bearer ${token}` }) });
const result = await client.capabilities.query({ kind: 'abh.tool', versionRange: '^1.0.0', limit: 20 });
```

服务端须安装 `capabilityQuery` 并为当前业务用途校验独立的 `abh.capabilities.read` Grant。结果包含兼容／健康状态；`complete=false` 表示结果截断，应缩小查询范围。候选发现不授予执行权限，也不会自动选择版本或返回实现句柄。

### Evaluation Host HTTP Port

```ts
import { createHttpEvaluationDispatcher } from '@abh/core/evaluation';

const dispatcher = createHttpEvaluationDispatcher({
  endpoint: 'https://evaluation.internal/runs/',
  headers: signal => resolveEvaluationCredentials(signal),
});
```

该公开入口把 `EvaluationRecoveryWorker` 的租约上下文发送到宿主 POST `/dispatch`。请求是 canonical JSON，精确绑定 `evaluationRun`、`work lease` 和 `attempt`；凭据由回调注入且继承 Worker 取消/截止期。只有 HTTP `202` 加封闭 JSON `{ "outcome": "Accepted" }` 表示受理；非 202、非法响应、超时、过大、重定向或传输失败一律返回 `Unknown`，由 Worker 保留租约并安全过期。响应默认上限 64 KiB，可配置到 256 KiB。此 Port 不执行模型评测、不免除 Model/Tool Gateway 授权，也不把 Unknown 解释为失败或成功。

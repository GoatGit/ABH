# @abh/adapter-pg-boss

[English](./README.md) | 简体中文

内部队列交付适配器，固定 pg-boss 12.30.0（原生 Schema 40），运行于 Node 24.13.0。

实现 `DurableExecutionPort` 的 `enqueue` / `inspect` / `drain` 子集；`scheduleWakeup`、`cancelWakeup`、`signal` 由 Core 的 DurableWaitPort 提供，经 `composeDurableExecutionPort` 组合为完整 Port。本包只负责原生队列交付。

## 安装规则

- 先运行 Core 数据迁移。第 23 号迁移建立由 `abh_queue` 持有的 `abh_pgboss` Schema；适配器通过 pg-boss 公开 API 创建原生表、函数和四类队列。
- 连接必须使用隔离的 Queue 角色，禁止 Runtime 或管理员连接。Core readiness 会核验原生对象清单、函数摘要和权限；安装 pg-boss 后须再次执行 readiness。
- `DeliveryAdmission.resolve` 必须由服务器提供：解析当前 ContextRef、权限与已安装消费者，不是用户可传的租户选择器。Core 的 `QueueAdmissionDirectory` 是装配入口——发布入队、查回、排空都在真实事务中重验当前 Grant/fence。
- 队列策略必须通过 `queuePolicies` 显式配置（control/reconcile/interactive/background）：active 租约、保留窗口、完成后清理、重试、延迟与退避。`deleteAfterSeconds: 0` 只适用于必须保留已完成 Job 做幂等回放的部署；正值表示之后允许同 dedupeKey 重新入队。

## 投递语义

- `enqueue` 用组织、消费者、业务 dedupeKey 派生稳定 JobRef；队列只保存 JobEnvelope 与绑定摘要。原生 send 开始后超时或取消返回 `Tracked`——不可据此重发，应查回或重新提交同一入队请求。Outbox 只在拿到 `Completed` 后确认消费者投递。
- Worker 的 `fetch` 返回公共 Ref 与 JobEnvelope。每次调用 Owner 前都新建当前 Service Context 并重验租约与权限。`complete` 在 Owner/Inbox 提交后调用；`fail` 只触发队列交付重试。队列状态不能证明业务成功，也不授权外部执行。
- 原生 Job 保留期间，同组织/消费者/dedupeKey 的入队经 Queue 角色事务与跨队列 advisory lock 串行化；竞争的不同输入返回 `IDEMPOTENCY_CONFLICT`。
- `complete`/`fail` 先锁定原生 Job 行，用数据库时钟核对 active、retryCount 与租约期限，再修改状态——旧进程无法处理已被其他 Worker 认领的投递。该只读锁定查询绑定 Schema 40，升级须重新审查；本包从不直写原生状态。
- `drain` 停止指定队列的新交付，并在调用 deadline 内等待在途 Owner 确认与原生 send/fetch。取消排空同样返回真实排空报告——停止接收已经生效。

## 状态

真实 PostgreSQL 测试位于 Core（`pg-boss.test.ts`、`inbox.test.ts`），覆盖角色隔离、权限漂移、入队不确定性、业务提交后确认丢失、冻结多消费者扇出、发布回滚/失租约与有界排空。尚未完成：全局发布扫描、完整业务 Worker 服务与完整 V1 模块验收。幂等回放窗口与清理水位之间的取舍必须由部署审批。

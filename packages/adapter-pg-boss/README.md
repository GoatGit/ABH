# @abh/adapter-pg-boss

内部队列交付适配器，固定 pg-boss 12.30.0（原生 Schema 40），运行于 Node 24.13.0。实现 `DurableExecutionPort` 的 `enqueue`、`inspect`、`drain` 子集；`scheduleWakeup`、`cancelWakeup`、`signal` 由 Core DurableWaitPort 实现，使用 composeDurableExecutionPort 组合为完整 Port；该包仍仅拥有原生队列交付。

启动前运行 Core 数据迁移。第 23 号迁移建立由 `abh_queue` 持有的 `abh_pgboss` Schema；适配器通过 pg-boss 公开 API 创建原生表、函数和四类队列。传入的连接必须使用隔离 Queue 角色，禁止使用 Runtime 或管理员连接。Core readiness 验证原生对象清单、函数摘要和权限；安装 pg-boss 后须再次执行 readiness。

`DeliveryAdmission.resolve` 必须由服务器解析当前 ContextRef、权限与安装消费者。它不是用户提供的租户选择器。Core `QueueAdmissionDirectory` 已提供装配入口：发布入队、查回和排空都从受信 Service Context 生成短生命周期 RequestContext，并在真实数据库事务中重验当前 Grant/fence；不得用请求 JSON 或测试 fixture 替代生产解析器。

队列策略必须显式配置，不能继续依赖开发默认值。`queuePolicies` 按 control/reconcile/interactive/background 验证并写入 pg-boss 原生队列：active 租约、保留窗口、完成后清理、重试次数、延迟和退避。`deleteAfterSeconds: 0` 只适用于必须保留已完成 Job 做幂等回放的部署；配置正值表示接受后续同 dedupeKey 重新入队，由 pg-boss supervised maintenance 按数据库时钟清理。`retryDelayMax` 只允许与指数退避同时配置。

`enqueue` 用组织、消费者、业务 dedupeKey 派生稳定 JobRef；队列只保存 JobEnvelope 与绑定摘要。开始原生 send 后超时或取消返回 `Tracked`，不可据此重发 Provider；调用方应查回或重新提交同一入队请求。Outbox 仅在获得 `Completed` 后确认消费者投递。

内部 Worker 的 `fetch` 返回公共 Ref 和 JobEnvelope。每次调用 Owner 前均需新建当前 Service Context，并重验租约及权限。Owner/Inbox 提交后调用 `complete`；`fail` 只触发队列交付重试。队列状态不能证明业务成功或授权外部执行。

`drain` 停止指定队列的新交付，并等待在途 Owner 确认及原生 send/fetch，最多等到调用 deadline。剩余工作返回 JobRef；尚未返回 Job ID 的认领返回稳定 `abh.queue` Ref。排空后返回的认领退回原生重投。取消排空也返回真实排空报告，因为停止接收已经生效。完成结果保存后再关闭连接。

真实 PostgreSQL 测试位于 Core 的 `pg-boss.test.ts` 与 `inbox.test.ts`，覆盖角色隔离、权限漂移、入队不确定性、业务提交后确认丢失、冻结多消费者扇出、发布回滚/失租约和有界排空。

在原生 Job 保留期间，同组织/消费者/dedupeKey 的入队通过 Queue 角色事务和跨队列 advisory lock 串行化，查询与 send 共享同一事务，竞争的不同输入返回 IDEMPOTENCY_CONFLICT。事务只涉及隔离队列；pg-boss 公开 API 的 db 参数连接到该事务，业务 Owner/Inbox 仍另行提交。

complete/fail（包括取消认领退回和无效消息失败）先锁定原生 Job 行，以数据库时钟检查 active、retryCount、startedOn、createdOn 和租约期限，再通过 pg-boss 公开 API 修改状态。原生重试由另一 Worker 认领后，旧进程不能确认或失败新投递。该只读锁定查询绑定当前 Schema 40，版本升级须重新审查；不自写原生状态 UPDATE。

当前限制：全局发布扫描和完整业务 Worker 服务尚未完成。重试、租约和完成后清理水位已可显式配置；幂等回放窗口与清理水位之间的业务取舍必须由部署审批。该包尚未通过完整 V1 模块验收。

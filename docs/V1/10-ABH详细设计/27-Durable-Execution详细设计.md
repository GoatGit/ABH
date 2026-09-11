# Durable Execution、Outbox 与 Worker 详细设计

> 版本：1.2 · Owner：Runtime Maintainer · Adapter：`@abh/adapter-pg-boss`
>
> 唯一底层：PostgreSQL + pg-boss；业务状态与队列交付分开。

## 1. 职责

本模块持久传递已提交意图、调度 Timer/Wait、认领有界工作和恢复水位。Owner 控制业务迁移，pg-boss 负责 Job 存储、超时与投递；不自研通用队列。

Mission 唤醒必须送 Mission Controller；已运行 Run 内 Task 调度调用 Run Orchestrator。队列重投不能直接继续 Pi 或重新派发 Provider。

## 2. 数据

| 表 / 数据 | 字段与约束 |
|---|---|
| runtime.outbox | eventId、aggregateRef/version/ordinal、payloadRef、createdAt、publishedAt、lease；Owner 事务写入 |
| runtime.inbox | consumerId/eventId 唯一、handledAt、resultRef；与消费业务写入同事务 |
| runtime.waits | ownerRef/waitKey 唯一、causeFilter、sourceWatermark、deadline、authorityRef、statusRef=Durable Wait、version；Timer 只保存唤醒意图 |
| runtime.work_leases | targetRef、ownerWorkerId、leaseUntil、fencingToken；原子递增 token |
| pg-boss 自有 Schema | Job 生命周期、队列重投、归档；只由锁版 pg-boss API/迁移管理 |

业务重试预算在 Owner 记录，不能因 Job ID 改变而重置。Outbox 已投递不表示消费者已提交业务结果；Inbox 与目标版本保证重复安全。

## 3. DurableExecutionPort

| 方法 | 参数 | 返回与语义 |
|---|---|---|
| enqueue | jobType、targetRef、dedupeKey、causeRef、notBefore、deadline、authorityRef | jobRef；只入队，不能授权 |
| scheduleWakeup | ownerRef、waitKey、dueAt、causeRef | waitRef；相同 key 相同参数幂等 |
| cancelWakeup | waitRef、expectedVersion、reason | 阻止未认领唤醒；已认领仍需 Owner 重验 |
| signal | ownerRef、committedEventRef、waitKey | 可靠唤醒引用；不等于 Decision |
| inspect | job/waitRef | queueAge、deliveryCount、lastErrorCategory、ownerResultRef |
| drain | queueClasses、deadline | 停接/刷新/退出报告 |

Adapter 对外只返回公共 Ref，不暴露 pg-boss Job 原生类型。重投 delay 由统一策略与 Owner remainingBudget 计算。

## 4. 投递事务

T1 Owner 状态 + Outbox 同事务提交 → Publisher 用短 lease 领取 Outbox → pg-boss enqueue（以 event/consumer 组合去重）→ 标记 published → Worker 领取 Job → T2 写 Inbox + Owner 变化 + 新 Outbox → ack Job。

enqueue 成功而 published 未写时允许重投，消费方 Inbox 防重。V1 不依赖 pg-boss 与任意 Repository 共享内部 transaction API；采用可证明 at-least-once + Owner 幂等，不修改 pg-boss 内部表实现“统一事务”。

消费者版本缺口：保存 pending observation，回读 Owner/Outbox 补缺；无法补齐发数据完整性异常，不凭到达顺序回退正式状态。T2 崩溃前全部回滚，之后重投返回原 Inbox 结果。

Outbox 扇出使用冻结的 consumer 集合和 runtime.outbox_deliveries(eventId, consumerId) 唯一记录，逐消费者保存 publishedAt/jobRef；全部投递完成才标父 publishedAt。中途崩溃重投尚未确认项，Inbox 保证幂等；新增消费者从明确水位回填，不把旧父 publishedAt 当作自己已处理。清理同时检查每个消费者的处理水位。

等待注册先持久化 Wait 与 Owner 的 Waiting 意图，再立即回读源 Owner 条件；若条件已满足，同事务 CAS Wait → Succeeded 并写唤醒 Outbox。后续信号和 Timer 走相同 CAS，最多产生一次唤醒。信号先于 Wait 时依赖持久源事实回查，不能只靠瞬时通知；条件仍不满足则等待后续事件/有界补偿扫描。Deadline 唤醒只通知超时，由 Owner 决定 Blocker/失败，Durable 不批准或否决业务。

## 5. Worker 与故障

Worker 在每次认领后生成当前 Service Context，再调用 Owner。lease 默认 30 s，10 s 心跳；失去 lease 停止新模型/Tool 请求和状态提交。Run/Operation 写入要求 fencingToken，过期 Worker 的提交拒绝。可能已发出的外部请求按 Unknown 处理。

全局认领只经 [Data 的受限调度入口](28-Data-Artifact与Audit详细设计.md#13-跨组织核验与后台访问)读取最小 Ref/租户/租约字段；pg-boss 连接角色不能访问业务表。每个 Job 使用自己的 TenantContext 与 runtime UoW，不能复用前一个 Job 的租户会话设置。authorityRef 指向当前任务所需的 MissionAuthority/ExecutionAuthority，或已登记的有限准备/治理权限；Action Dispatch 必须回读 Action 绑定的执行 Authority，不能从 Job 参数替换。查回任务使用独立查询用途权限。

runtime.work_leases 是工作租约唯一来源；Run、Task 与 Operation 仅引用其 Ref/Token。协调者和各并行 Task 使用不同 targetRef，协调者独占 Graph 修改权；Lease 续约不续业务授权。pg-boss 的 Job 锁只用于交付，不与 Owner fencing 互相替代。旧 Worker 的迟到 Receipt 允许走只追加观察入口，正式状态由当前 Owner 提交。

SIGTERM 停接新 Job → 广播取消未开始任务 → 等待有界在途任务 → 刷新可靠结果/日志 → 释放租约/连接。未完成 Job 留待恢复；不能先关闭数据库再试图提交 Completion。

Provider 故障通过 Connection 隔舱与熔断，不无限产生新 Job。时间由数据库/受监控时钟判定；系统时钟偏差超过配置上限阻断新 Permit。

## 6. 配置与运维

queue.classes 固定 control/reconcile/interactive/background；publishBatch=100、pollIntervalMs=500、worker.concurrency 由 NFR 配额分配；job.safeRetryMax=3；普通积压 30/60 min 背压。生产配置必须声明 archive/retention，Outbox/Inbox 清理先保证所有消费者水位及业务幂等保留。

控制与对账保留资源，批量回补不占满连接池。指标 outbox_lag、inbox_duplicate、lease_lost、queue_oldest_age、deadletter_count、drain_duration；`abh doctor queue` 提供阻塞 Owner Ref 和允许的 replay 命令。Replay 重走 Owner，禁止直连 Provider。

## 7. 验收与替换

故障注入覆盖 T1 前后、enqueue 后 published 前、T2 前后、ack 丢失、Timer 重复、Worker 双活、陈旧 lease、时钟偏移、单租户洪峰和控制队列保留。

同时验证多消费者仅部分 enqueue 成功、信号在注册 Wait 前到达、Timer 与信号同到、跨 Task 并行和旧 Worker 晚到有效回执。不得出现已持久满足条件却永久等待。

Temporal 只有门禁成立时整体替换该 Port。迁移先冻结新调度、导出 Wait/Job/Owner 水位、验证目标映射、切换 ownershipEpoch，再逐队列放行；一个 Wait 不能同时被两套调度器拥有。未决 Operation 状态不由 Temporal 历史替代。

# Run Orchestrator 与 Task Graph 详细设计

> 版本：1.3 · Owner：Agentic Core Maintainer · 内部模块 `run`
>
> 状态、迁移与终结条件统一引用[状态规范第 3 节](02-状态与执行契约规范.md#3-runtask-与-invocation)。

## 1. 边界

Run Orchestrator 提交 Run、Task、Graph Revision、Checkpoint 和 Invocation 状态，调度 Agent/确定性 Job/等待节点。Task Graph 是该模块内部聚合，不另设图执行引擎。Coordinating Agent 只提出 Graph Patch；持久队列只唤醒 Owner。

这里的 Task Graph 仅表达有界业务依赖、验收与提交顺序；通用推理和工具循环复用 Agent Harness，持久投递/Timer 复用 Durable Adapter，图的通用校验优先用现有库或简单有界算法。上游能承接更多执行能力时，通过同一合同移交并删除重复调度代码；正式事实、授权检查与恢复证据仍只有一个 Owner，不扩展成通用 BPMN 或第二 Agent 引擎。

主用例为单 Workflow 串行推进；拒绝越界委托或循环 Patch；恢复未完成节点；在 Responsibility/Action 等待时释放执行槽；暂停/取消后处理迟到结果。

## 2. 数据设计

| 数据 | 关键字段与约束 |
|---|---|
| core.runs | missionId、triggerKey、missionVersion、goalRevision、stopEpoch、workflowVersion、assignmentSnapshotRef、executionMode、status、version、coordinatorLeaseRef |
| core.tasks | runId、nodeKey、kind、inputRefs、outputSchemaRef、definitionRef、budgetRef、deadline、status、attemptOrdinal、required、version |
| core.graph_revisions | runId/revision 唯一；baseRevision、patchDigest、proposerRef、verificationRef、nodes/edges Ref |
| core.checkpoints | runId/sequence 唯一；completedTaskRefs、verifiedOutputRefs、waitRefs、resourceUsageRef、watermark、versionRefs |
| core.invocations | taskId/ordinal 唯一；taskSpecDigest、contractDigest?、contextRef?、bindingRefs、status、stopReason、resultRef；Created 允许未装配，Running 必须完整 |

非终态 Run 对 missionId 建部分唯一索引。任务依赖按 runId/nodeKey 唯一引用，写 Patch 在同事务检查节点存在、环、深度与资源总上限。已 Running/终态节点不可改输入或删除；修改未来节点需新 Graph Revision。

assignmentSnapshotRef 引用 Release Owner 的 pinSetRef，字段与固定顺序见 [Release 第 4.1 节](30-Capability-Release详细设计.md#41-run-与独立-action-的固定协议)。该集合与 Run 创建同 UoW 提交；来源 Run 的 Action 只引用已有槽位，不因后续发布重选。

Lease 唯一记录由 Durable Execution 拥有；Run 引用协调者租约，Task 执行各引用自己的工作租约。所有提交校验对应 fencingToken，不能以 Task Worker 身份修改 Graph。失败节点的替代采用唯一 replacement 关系：同一原节点至多一个当前替代，依赖在新 Graph Revision 中显式重绑定；完成规则只评价当前有效 required 节点，原失败仍留在历史与指标中。

## 3. 契约

| Command / Port | 必填输入 | 结果 / 特有错误 |
|---|---|---|
| StartRun（Internal，仅 Mission Owner） | missionRef、triggerKey、workflowRef、stopEpoch、authorityRef | 冻结 Assignment、创建 Run/Graph；runRef；RUN_ALREADY_ACTIVE |
| WakeRun（Internal） | runRef、causeRef、waitRef、expectedVersion | 重验等待和 Mission；resume receipt；WAIT_NOT_SATISFIED |
| ProposeGraphPatch | runRef、baseRevision、addNodes、addEdges、supersedePendingNodes、rationaleRef | 验证后新 revision 或 GRAPH_CYCLE/GRAPH_LIMIT/GRAPH_STALE |
| AdvanceTask（Internal） | taskRef、fencingToken、eventRef | 状态迁移和下一调度；TASK_LEASE_LOST |
| CompleteInvocation（Internal） | invocationRef、resultArtifactRef、stopReason、usageRef | 记录 Harness 输出，Task → Verifying |
| CommitVerifiedTask（Internal） | taskRef、verificationRef、domainCommandReceiptRefs | Task 成功 + Checkpoint；TASK_COMMIT_INCOMPLETE |
| PrepareInvocation / FinalizeInvocation（Internal） | 前者 taskRef/TaskSpec/派生身份依据；后者 invocationRef/manifestRef/bindingRefs/contractDigest/当前 epoch | 先创建 Created 身份，后 CAS 固定完整合同；INVOCATION_ASSEMBLY_STALE |

Task.kind 为 Agent、Compute、StructuredModelJob、Wait、DomainCommand；Branch/Join 由 Workflow Definition 声明规则编译，不用可执行字符串。委托 Payload 还须包含 goal、inputRefs、outputSchemaRef、tools、资源上限、deadline、acceptanceRef；子任务权限与预算均不得超过父任务剩余。

`GetRun` Strong 返回状态、固定版本、图 revision、Task 摘要、等待与 stopReason；默认不返回 Transcript。`ListTasks` 支持 status、nodeKey 和 cursor。事件 RunCreated/Waiting/Completed、TaskReady/Verified/Failed、CheckpointCommitted 由 Owner 事务产生。

## 4. 调度主路径

1. Mission 的 StartRun 经 Inbox 去重，验证 Workflow 与当前准备权限，确定所需行为槽位。
2. T1 按公共锁序先锁控制/选择 fence，再建立 Queued Run，由 Release Owner 固定完整 pinSet，保存初始 DAG、Ready Tasks、Audit/Outbox；同一 UoW 全部提交或回滚，调度引用不携带长期 Token。
3. Worker 认领租约；Owner 检查 Mission stopEpoch。T2a 保存 Created Invocation、不可变 TaskSpec 与受限 Principal，再按其真实身份取得 Task 授权。
4. 依据 TaskSpec 组装 Context Manifest 和 Tool Binding；T2b 重验 Task/Goal/epoch/来源版本，固定含 manifestDigest 的 Invocation Contract，CAS Running 后调用 Pi Adapter。Compute/StructuredModelJob 使用相同顺序的 Job 身份，无需伪造 Pi Invocation。
5. T3 保存返回 Artifact Ref 与 Invocation 终态；Task 进入 Verifying。
6. Verification Pass 后向 Domain Owner 提交幂等 Command；得到正式 Receipt 后 T4 提交 Task Succeeded、Checkpoint 和下一 Ready Task。
7. 没有可运行节点但有合法等待则 Waiting；达到完成条件提交 Completed。

步骤 6 的跨模块提交可在同库应用事务完成；异步实现使用固定 commandKey 和 Receipt。崩溃恢复优先查询该 Receipt，不能重复创建候选对象。

TaskSpec 不包含 Manifest/最终 Contract Digest；Manifest 绑定 taskSpecDigest；最终 Contract 再绑定 Manifest 与 Binding。Created 装配中断可按同身份续装，输入或来源实质变化则取消该 Invocation 后新建；禁止用“先生成最终摘要”形成循环依赖。

## 5. 恢复与图合并

Checkpoint 是恢复索引，Owner 表是权威事实。恢复核对 graphRevision、固定版本、已提交 Domain Receipt、Action Outcome 和 Ledger Usage；缺少本地输出时不无条件 continue Pi，创建新的 Invocation 并引用已知产物。

模型返回后、T3 前崩溃可能重复计算，但已有 Propose Tool 的 Command 通过幂等键查回；不能把重算当成可重发外部写入。运行中丢租约，旧 Worker 不可提交 Task/Checkpoint，新 Worker 先判断可能已发生的 Tool 副作用。

并行分支使用同一输入快照，输出分别保存；Merge Proposal 明确每个字段来源和冲突。不以最后返回的分支覆盖其他意见。required 分支失败按定义 Stop/Responsibility/Alternative 规则处理；没有规则则停止。

Run 等待注册与信号遵循 Durable Wait 协议：登记后立即回读源 Owner 条件，信号提前到达仍可唤醒。恢复逐项验证等待与调用状态；Queued 的取消、Verifying 的取消和未完成 Task 的暂停恢复均按状态规范执行。丢租约 Worker 的迟到证据走观察入口保留，由当前 Owner 决定是否采用，不接受其状态写入。

## 6. 资源、安全与观测

并发、节点数、深度、Turn、Deadline 继承 NFR；费用上限由 Ledger 扣减，Graph Patch 的预计资源总额也需验证。等待节点不消耗模型槽，但占用有界 Run/Wait 记录。

每次 Invocation 使用新 Principal，工具可见集由 Control 收窄。验证不通过的 Artifact 仅在隔离工作状态；停止/授权撤销后不得提交正式结果。Agent 间通信只传 Ref 和结构化 Proposal。

executionMode 由宿主从生产运行或隔离评测 Authority 派生并写入 TaskSpec/身份链，客户端、Agent 和 Pack 不可覆盖；子 Task/Invocation 只能继承。Shadow 产物与工具行为受 Release 的隔离合同约束，重试/恢复不能改成生产模式。

配置：run.checkpointEveryCompletedTasks 默认 1（1–10，运行创建时固定）；run.maxWaitingSeconds 默认 86400（由领域缩小/声明更长等待）；超时产生 Blocker，不自动否决人类决定。指标 run_age、task_wait_age、graph_patch_reject、orphan_invocation、checkpoint_lag、lease_loss。`abh doctor run --id` 展示第一个未满足依赖和安全恢复入口。

## 7. 验收与边界

测试覆盖：DAG 环/深度/权限扩张拒绝；两个协调者只有有效 fencing 提案可提交；T1–T4 各提交点崩溃；工具提案已提交但 Invocation 丢失；重复 Decision Event；暂停后的迟到输出；并行分支冲突；无进展预算停止。断言为唯一 Run、固定版本、无重复 Domain Command、无未验证 Task 成功。

另须覆盖 Created 装配断点、信号早于等待、Queued/Verifying 取消、替代失败节点后合法完成、两个 Task 并行不争用同一执行租约。

部署为 Core 模块与 Worker 任务，不引入 LangGraph 或第二 Loop。复杂持久等待只通过 DurableExecutionPort 替换底层；Task Graph 与 Checkpoint 的 Owner 不随 Adapter 变化。

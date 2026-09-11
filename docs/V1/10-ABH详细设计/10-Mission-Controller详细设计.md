# Mission Controller 详细设计

> 版本：1.1 · Owner：Agentic Core Maintainer · 包：`@abh/core`，内部模块 `mission`
>
> 状态权威：[Mission 状态](02-状态与执行契约规范.md#2-mission)；公共输入：[通用契约](01-公共契约与错误模型.md)

## 1. 职责与用例

Mission Controller 保存长期目标并决定是否推进、暂停、阻塞或结束；它是 Run 创建/唤醒 Command 的唯一发起者。Run Orchestrator 提交 Run，Domain Owner 判断专业事实，Controller 不读 Provider SDK 或解释自然语言成败。

用例：用户创建受限目标；已授权目标被激活；领域结果触发下一轮；责任未解决时阻塞；取消后后台继续对账；旧触发重复或迟到时保持原状态。

## 2. 数据与不变量

| 表 / 键 | 主要字段、约束与索引 |
|---|---|
| core.missions / id | organizationId、workspaceId?、goalArtifactRef、goalRevision、domainType、businessStageRef?、status、authorityRef、workflowRef、stopEpoch、pauseRequested、activeRunRef?、version |
| core.mission_conditions / missionId,revision | successConditionRef、stopConditionRef、triggerPolicyRef、resourceEnvelopeRef；不可变版本 |
| core.mission_triggers / missionId,triggerKey | sourceEventRef、sourceWatermark、targetVersion、kind、receivedAt、handledAt、disposition |
| core.mission_blockers / id | missionId、type、sourceRef、required、resolvedByRef?；索引 missionId/required/resolved |

条件为注册的确定性 Predicate + 参数；Agent 可以建议条件，不能注入任意代码。Active Mission 同时最多一个非终态 Run；任务级并行在 Run 内处理。activeRunRef 是经 Run Owner 回执确认的引用，不是 Mission 私自创建的 Run 记录。

取消不物理删除。Goal 与条件实质变更创建新 revision，并触发旧 Run 停止；业务历史和外部清理继续保留。Draft 可修改；Active 的目标扩大需 Human Gateway 正式责任。

聚合 `version` 用于 Command CAS，`goalRevision` 专门固定 Goal/条件语义；记录 activeRunRef 或更新投影水位只增加前者，不使既有 Run 的目标快照失效。StartRun 同时保存创建时聚合版本和 goalRevision，后续以 goalRevision/stopEpoch 判断是否需要重规划。

## 3. Commands / Queries / Events

| 接口 | Payload 与前置条件 | 事务效果 / 返回 / 特有错误 |
|---|---|---|
| CreateMission | goalArtifactRef、domainType、workflowRef、conditionRefs、responsibilityScope；Schema/可见性有效 | 创建 Draft + Outbox；返回 missionRef；MISSION_DEFINITION_INVALID |
| ActivateMission | authorityRef、expectedVersion；责任、条件、能力可用 | Active + accepted Trigger + StartRun Command Outbox；返回 missionRef/triggerRef；MISSION_AUTHORITY_MISSING |
| ReviseMissionGoal | goal/conditionRefs、expectedVersion、authorityRefs；验证新目标与授权覆盖 | 新 goalRevision + stopEpoch + 停旧 Run 意图；返回 missionRef；GOAL_AUTHORITY_INSUFFICIENT |
| BlockMission / ResolveBlocker（Internal） | blockerRef、sourceEvidenceRef、expectedVersion；来源 Owner 证据有效 | 按状态规范停新工作或恢复；返回 blockers/missionRef；BLOCKER_EVIDENCE_INVALID |
| SubmitTrigger（Internal） | missionRef、triggerKey、kind、sourceRef、watermark | 去重后合并为一次推进意图；返回 Accepted/Duplicate/Obsolete |
| PauseMission / CancelMission | reasonCode、expectedVersion、evidenceRefs? | 改生命周期、提升 stopEpoch、发送停止 Command；返回 cleanupStatus |
| ResumeMission | expectedVersion、resolvedBlockerRefs? | 重验条件；发 WakeRun 或 StartRun；MISSION_BLOCKED |
| CloseMission（Internal） | resultRefs、conditionEvaluationRef、expectedVersion | 验证终止条件及未决效果，提交 Completed；MISSION_EFFECT_PENDING |

错误均登记到公共 Registry：定义问题为 Validation，授权缺失为 Precondition，版本为 Conflict。`GetMission` 为 Strong Query；`ListMissions` 支持 status/domainType/workspaceId、cursor，按 updatedAt/id 倒序；Projection 含 goal 摘要、阶段、blockers、activeRunRef、asOf 与可用动作。

事件：MissionCreated、MissionActivated、MissionPaused、MissionBlocked、MissionCompleted、MissionCancelled。Payload 只含 goal/condition/version Ref 与 stopEpoch；Run/Human/Projection 消费，Learning 通过正式结果另行采样。

## 4. 主流程

~~~text
Ingress -> authenticate/authorize Goal Command
T1 Mission Owner: validate definition + insert Mission/conditions + Audit/Outbox
Human/Control -> commit authority, if required
T2 Mission Owner: Activate CAS + Trigger + StartRun Outbox
Run Owner -> commit Run + RunCreated event
T3 Mission Owner: consume event via Inbox + set activeRunRef
~~~

T2 与 Run 创建之间不持有数据库锁；以 StartRun 的 triggerKey 防重。Active 而 Run 未创建时页面显示“准备中”，恢复 Worker 重投已提交 Command。

不同 Trigger 同时到达时保留各自受理记录：已有非终态 Run 则把可合并触发留在待推进集合，RUN_ALREADY_ACTIVE 不视为已处理成功。Run 终态事件经 Inbox 消费并清除匹配的 activeRunRef，再重验 Goal/条件/stopEpoch，生成下一次唯一 StartRun。RunCreated 与终态事件乱序时回读 Run 当前事实，终态 Run 不回填为 activeRunRef。恢复扫描覆盖“已有 Trigger、没有有效 Run/StartRun Outbox”的缺口，避免信号永久丢失。

## 5. 故障与并发

外部事件先由 External Ingress 归一化，不直接唤醒 Controller。Trigger 与 Pause 并发时在 Mission 行 CAS/stopEpoch 上串行：Pause 先提交则 Trigger 只留痕不启动；StartRun 先发出则 Run 在创建和启动时再次检查 stopEpoch。

成功条件计算失败时 Blocked，保留依赖缺口；不根据 Agent 摘要结束 Mission。RunCreated 迟到且 Mission 已取消时仍绑定历史引用，并发出停止 Command，不重开 Mission。

同一来源水位较旧时标记 Obsolete；可合并的高频观察只保存最新合并游标，同时保留事件引用。持续抖动的阈值使用注册迟滞/冷却规则，避免每个数据点都创建 Run。

## 6. 安全、配置与运维

所有 Command 校验组织、用途和对象版本；跨组织只借助 Workspace 的最小权限。MissionAuthority 的状态由 Control 决定，Controller 不能续期。普通详情不泄漏 Prompt/Token；诊断按权限展示 Trigger 与 Blocker Ref。

配置：mission.triggerCooldownSeconds 默认 30（0–3600，动态生效）；mission.maxPendingTriggers 默认 100（1–1000，重启生效）；超过上限合并可合并观察、拒绝新不可合并输入并报告。API 延迟继承 NFR；处理单 Trigger 的内部 p95 预算 50 ms，Domain 成败计算异步执行。

指标：trigger_lag、obsolete_trigger_count、active_without_run_age、blocked_age；日志只含 Ref；关键状态写入 Audit。`abh doctor mission --id` 检查 authority、Run Ref、未决 Outbox、Blocker 与 stopEpoch。运行在 server/worker 共用 Owner 服务，无独立常驻 Controller 服务。

## 7. 验收

| 情景 | 可观察断言 |
|---|---|
| 100 个同键 Trigger | 一个 StartRun 意图和一个 Run |
| T2 提交后进程退出 | 恢复后继续创建原 Run，不新建 Mission |
| Pause 与 Trigger 并发 | 无有效 stopEpoch 之后的新 Invocation |
| 成功摘要但缺 Result | Mission 不 Completed |
| Cancelled 且 Operation Unknown | 生命周期取消，cleanupStatus=Pending，对账继续 |
| 跨组织 Mission Ref | 拒绝且无对象存在性泄漏 |
| 两个不同 Trigger 与 Run 结束并发 | 最多一个非终态 Run，剩余有效触发在结束后推进 |
| Blocked 上再次 Pause | 解除 Blocker 后仍 Paused，不自动恢复 |

独立原因是长期生命周期和 Trigger 去重。Task Graph、模型重试和专业结果判断留给各自 Owner。待验证项为真实 Trigger 频率与条件成本，由 Core Maintainer 在 M0 故障矩阵、M1 负载验收前关闭。

# Action Engine 详细设计

> 版本：1.3 · Owner：Execution Maintainer · 内部模块 `action`
>
> 生命周期和 Outcome 唯一来源：[状态规范第 6–7 节](02-状态与执行契约规范.md#6-action生命周期与-outcome)。

## 1. 业务意图与执行边界

Action 是经过领域校验的外部副作用意图。它固定要改变什么、影响上界、依赖与完成条件；Operation Controller 负责把它编译为平台调用。Agent 和用户都只能经 Application Command 提案，直接 Tool Dispatch 不在公开接口中。

用例：需审批的创建；预授权范围内的调整；授权后对象变化；跨 Connection 部分成功；外部结果未知；取消尚未执行的意图；针对既有 Operation 提出补偿。

独立 Action 允许 missionRef 为空，经现有应用或 Agent 的合法 Service 身份提出，使用明确 ExecutionAuthority 和静态执行版本。该路径不创建占位 Mission/Run/Invocation，也不启动 Agent Runtime；所需 Domain 验证可由注册动作的受信 Handler 提供，无需自建领域数据库。必要责任、资源预留、对账与 Audit 使用完全相同协议。

公开 `actions.propose` 提交后，已登记的 Owner 处理链自动推进验证、计划编译和 RequestAuthorization，缺少必要批准则等待 Decision；调用方通过 trackingRef 查询，不手工调用内部阶段。各阶段复用原 Command 幂等和 Outbox 恢复，没有第二套 Workflow 引擎，也不会因为自动推进而获得额外执行权。

## 2. 数据与不变量

| 表 | 核心字段、约束 |
|---|---|
| execution.actions | id、organizationId、missionRef?、runRef?、sourceCommandRef、proposedBy、executionPrincipalRef、executionAuthorityRef?（AuthorityRef）、pinSetRef?、actionType、payloadArtifactRef/digest、targetRefs、inputVersionRefs、completionPolicyRef、riskClass、lifecycle、outcome、version |
| execution.action_authorizations | actionId/ordinal 唯一；authorityRef、snapshotRef、pinSetRef/digest、planDigest、reservationRefs、commitmentDeltaRefs、decisionRefs、expiresAt；不可变 |
| execution.action_plan_links | actionId 唯一 activePlanRef；planDigest、pinSetRef/digest、validatedAgainstPayloadDigest |
| execution.action_dependencies | actionId/dependencyActionId；约束无环、同授权协作边界 |
| execution.action_results | actionId/revision；operationResultRefs、aggregationRuleRef、outcome、unresolvedRefs；不可变 |
| execution.action_relations | actionId、compensatesOperationRefs / supersedesActionRef |

业务幂等键长期关联 Action 身份，Provider key 不等同于该键。Validated 后 Payload 不可原地改；实质变化新建 Action。空目标、空完成规则、无法限定影响的 Action 拒绝验证。

proposedBy/sourceCommandRef 由入口保存；executionPrincipalRef 由受信动作定义与服务绑定解析，客户端不能指定任意 Worker 身份。missionRef/runRef 只从已验证来源链取得。Proposed/Validated 可缺 executionAuthorityRef，T1 必须绑定有效 AuthorityRef：独立 Action 为 ExecutionAuthority，Mission 路径为 MissionAuthority。pinSetRef 在准备阶段由 Release Owner 提交集合后绑定，Plan 和 Snapshot 均须引用同一集合。

## 3. 应用接口

| 接口 | Payload、前置条件 | 提交效果 / 返回 |
|---|---|---|
| ProposeAction | actionType、targetRefs、payloadRef、sourceVersionRefs、completionPolicyRef、resourceRequirements、sourceProposalRef | T0 保存 Proposed、Audit/Outbox；202 actionRef |
| ValidateAction（Internal） | actionRef、domainValidationRef、expectedVersion | 固定 Payload/版本，Validated；ACTION_DOMAIN_INVALID |
| RequestAuthorization | actionRef、authorityRefs?、expectedVersion；引用仅作断言，服务端解析并重验 | 推进版本/Plan 准备；缺责任返回 requestRef；执行依据完整时 T1 绑定 Authority 并授权，返回 snapshotRef |
| RefreshActionAuthorization（Internal） | actionRef、planDigest、existingResourceRefs、authorityRefs、expectedVersion | 不变更意图/生命周期，追加新 Snapshot 轮次；AUTHORIZATION_REFRESH_DENIED |
| CancelAction | actionRef、reason、expectedVersion | 未派发取消；已派发仅请求停止剩余步骤并对账 |
| RegisterOperationPlan（Internal） | actionRef、pinSetRef/digest、planRef/digest、scopeProofRef | 记录唯一计划引用；ACTION_PLAN_SCOPE_EXCEEDED |
| AggregateOutcome（Internal） | actionRef、operationVersionVector、reconciliationRefs | 按完整集合汇总，提交结果/Outbox；ACTION_CHILD_VERSION_CONFLICT |
| ProposeCompensation | operationRefs、reason、newPayloadRef、authorityRefs | 创建新 Action，不改原结果 |

`GET /v1/actions/:id` Strong 返回 lifecycle、outcome、authorizationSummary、operationSummary、unresolvedRefs、availableActions；`GET /v1/actions` 支持 missionId/type/lifecycle/outcome/cursor，默认按 createdAt/id 倒序。无权对象返回 404。公开 HTTP 不暴露内部 Validate/RegisterPlan/Aggregate 接口。

## 4. 主时序与事务

~~~text
Domain Owner validates proposal -> ProposeAction T0
Action Validate -> frozen business intent -> persist/reuse Release pinSet -> compile/register immutable Operation Plan
Human Gateway Decision, if required -> Control service Grant + ExecutionAuthority (or existing MissionAuthority)
T1: control fences + resource fences + all Ledger locks/reservations + Action CAS
    + Snapshot/PolicyEvaluation + Authorized + Audit/Outbox
COMMIT -> Durable wake Operation Controller for the authorized plan digest
Dispatch -> Receipt/Reconciliation
T2: read child versions + aggregate + action result + Outbox
Domain Owner -> execution Result
~~~

T1 的统一锁顺序及签发者见[授权链](03-责任授权与执行链规范.md)。Action Engine 只使用 Resolver 签发的 Snapshot，不自己构造许可。Plan 建立后与原 Payload 摘要绑定，技术拆分不能扩大费用/资源/影响。

Validated 阶段按 [Release 固定协议](30-Capability-Release详细设计.md#41-run-与独立-action-的固定协议)先固定完整能力集合，再无副作用编译/登记 Plan；T1 必须验证非空计划、同一 pinSet、全部 Connection Scope、依赖无环、完成策略和资源上界，并将 planDigest 纳入 Snapshot。任何 Operation 在 Authorized 前不得获得 Permit。层级创建的未来 externalId 用有类型的父节点输出绑定表达，不因尚无平台 ID 跳过范围验证；改变节点/连接/影响须新 Action。

## 5. 失败、取消与资源

T0 已提交而响应丢失，原幂等键返回原 Action；T1 任何预留失败全部回滚。Authorized 但未 Dispatch 时授权失效可退回 Validated 并申请新 Snapshot，按 Resource Ledger 的零派发清理协议处理 Hold 与本轮 Commitment 增量；计划保持固定、旧 Snapshot 保留。Cancelled/Expired 采用相同清理，不能留下无风险的永久额度占用。

固定提交后、Plan 生成前崩溃时先回读原 pinSet；Plan/Decision Effect 已提交时按原引用与 effectKey 查回，不选新 Connector 或重签新权限。零派发重授权可在完整重验、当前责任明确覆盖且 executionPrincipalRef/意图不变时绑定新的 Authority，保存新授权轮次；已经派发后本 Action 只接受原 Authority 下的短时 Snapshot 续签，不通过换主体/委托绕过撤权。需要新权限或版本的剩余工作须作为新 Action 提案。

长计划执行中短期 Snapshot 到期，RefreshActionAuthorization 在公共锁序下重验同一 executionPrincipal/Authority、Plan/语义输入、当前 Policy、批准覆盖与现存资源占用，追加新 Snapshot，不重新预留整份预算或重开 Operation。已核实前序 Receipt 可作为计划声明的输入绑定。权限/批准实质失效或需要扩张计划时拒绝续签，停止剩余派发并转责任/对账；原已派发项的只读查回使用独立 Query Authority。新 Snapshot 不能复活已取消/Closed Action。

已发生效果后取消不得写 Cancelled：提交 cancellationRequestedAt、停止未启动 Operation，剩余查回。父 Action 所有已派发子项均确定后才 Closed；Unknown 不因人类关掉通知变成 Failed。

补偿使用当前授权，无法补偿的事实明示 residualImpactRef。领域 Result 保存执行结果与剩余影响，不能用补偿成功擦去原错误/花费。

## 6. 容量、配置与观测

action.maxOperations=100（1–1000，Action 验证时固定）；action.maxDependencies=32；action.intentExpirySeconds 默认 86400，领域可缩短。真实 Dispatch 数受 Connector 限流；Action API 只提交事实，遵循普通 API SLO。

关键指标：authorization_age、unknown_action_age、partial_success、cancel_after_dispatch、compensation_failure；日志携带 actionRef/planRef/snapshotRef，不带秘密。`abh doctor action --id` 输出最新事实、缺失授权、未决 Operation 与安全处置 Command。

## 7. 验收和实现范围

必测：同意图重复请求；批准后 Payload 被替换；多账本部分失败；空 Plan；Plan 越界；子结果乱序；可选 Operation 已派发但未知；取消竞争；同一补偿重复；Actor 撤权后的旧 Snapshot。断言仅一个业务意图、完整 Audit、无错误终结和无提前释放。

M0 使用模拟 Connector 同样跑完整 Action 合同，M1 才启真实写入。该模块不包含 Provider 重试或领域 Campaign 状态，避免业务意图与传输事实混为一体。

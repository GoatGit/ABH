# Authorization、Policy 与 Autonomy 详细设计

> 版本：1.2 · Owner：Control Maintainer · 内部模块 `authorization`
>
> 原子事务与派发边界：[授权执行链](03-责任授权与执行链规范.md)。

## 1. 单一裁决

Authorization Resolver 是 Snapshot/AuthorizedRequestContext 的唯一签发者。它结合当前身份、责任、Grant、Purpose、对象版本、限额与两类 Policy；OPA-WASM 只计算注册条件，不能创建 Grant。

Autonomy Controller 是本模块的确定性规则组件，effectiveLevel 取部署允许等级、Domain 能力证明、MissionAuthority、Scope 风险与当前熔断状态的最小值。L0–L4 是授权深度，不由模型置信度或历史成功次数自动升级。

## 2. 数据

| 聚合 / 表 | 主要字段 |
|---|---|
| control.grants | principalRef、scopeRefs、actionTypes、conditionsRef、amount/quantityLimits、purposeRefs、validFrom/until、delegationSourceRef、status、version |
| control.mission_authorities | missionRef、principalRefs、grantRefs、scope、autonomyCeiling、resourceEnvelopeRef、stopConditions、status、version |
| control.execution_authorities | executionPrincipalRef、allowedProposerRefs、binding、grantRefs、scopeRefs、purposeRefs、actionTypes、resourceEnvelopeRef、validFrom/until、stopConditions、issuanceEvidenceRef、effectKey、supersedesAuthorityRef?、status、version |
| control.policy_versions | kind=Mandatory/Behavior、digest、artifactRef、inputSchemaRef、ownerRef、releaseEvidenceRef |
| control.policy_evaluations | targetRef、inputDigest、policyVersionRefs、allow、obligations、reasonCodes；不可变 |
| control.authorization_snapshots | actorRef、targetDigest、sourceVector、authorityRefs、grantRefs、pinSetRef/digest、assignmentRefs、policyEvaluationRefs、epochVector、limitRefs、validUntil |
| control.fences | scopeType/scopeId 唯一；epoch、stopFlag、updatedAt；撤权与 Permit 同锁 |
| control.delegations | from/toPrincipal、scope、actionSubset、expiry、sourceGrantRef、status；不得扩权 |

Grant 条件使用闭合 DSL/OPA 输入，不允许任意 JS。Scope 为对象/组织引用集合及已注册维度，不能用自由字符串“all”扩到其他租户。

MissionAuthority 可登记被允许的 Agent Definition/Workflow 与服务 Principal；新 Invocation 身份由 Run Owner 根据已固定 Definition、Task Contract 和 Run 绑定生成。Resolver 验证整条派生链后收窄至该 Task，不能仅凭调用方自报 invocationId 继承权限，也不能要求所有未来 Invocation 在创建 Mission 时已存在。

### 2.1 独立 Action 的 ExecutionAuthority

ExecutionAuthority 是 Control 拥有的持久执行委托记录，引用既有 Grant 并进一步收窄其适用范围；它不另授予权限、不复制额度，也不替代短时 Snapshot。类型为 `abh.execution-authority`，使用公共 EntityRef；生命周期引用状态规范的 Active/Revoked/Expired。独立 Action 与后台查回可使用它，Mission 路径继续使用 MissionAuthority。

Authority 绑定本身不增加 Grant 委托层级；Grant 的委托链继续受 maxDelegationDepth 约束。Action 绑定的 actionRef.version 保存签发时证据，后续用 type/id、payloadDigest 和语义输入判断覆盖，不能因 Action 授权/执行状态增加 version 就使自身委托失效。

| 字段 | 必填约束与服务端来源 |
|---|---|
| executionPrincipalRef / allowedProposerRefs | 前者为一个当前有效的 Service Principal；后者为非空、明确的 Human/Service Principal Ref 集合。均来自本地身份目录，不能以 Worker 部署身份或任意登录用户兜底 |
| binding | 判别联合：`{ kind: "Scope" }` 使用下述 scopeRefs 的预授权；或 `{ kind: "Action", actionRef, payloadDigest }` 只覆盖已存在的 Validated Action 及冻结业务输入。两者不能混用 |
| grantRefs | 非空精确 Grant 引用；执行 Grant 必须适用于 executionPrincipalRef，保留合法委托来源；审批人的审批 Grant 不能直接当作 Service 执行 Grant |
| scopeRefs / actionTypes / purposeRefs | 非空已登记集合；资源归属、Workspace 和范围由服务端回源验证；有效范围取 Grant、Authority、当前 Policy 与 Action 的交集 |
| resourceEnvelopeRef / stopConditions | 引用已有 Ledger 约束与注册的停止 Predicate；空停止条件须显式为空集合，额度无无限默认；多个 Authority 共用同一 Grant/Scope 的 Ledger，不各复制一份额度 |
| validFrom / validUntil | UTC 有限区间，validUntil 不晚于支持本次委托的最早 Grant 到期时间；无用户 Session 依赖 |
| issuanceEvidenceRef / effectKey | 前者引用完整 Request Completion Evidence，或明确证明既有预授权 Grant 允许该派生委托的 Policy Evaluation Record（含 Grant/规则版本）；后者为来源事项内稳定的效果键。服务端同时保存签发 Actor、来源版本向量与摘要 |
| supersedesAuthorityRef | 续期或调整时可引用前项；不复活旧记录、不静默替换运行中的引用 |

Control 在一个事务内按公共锁序锁定 Scope/Principal/来源 Grant fence 与相关记录，验证调用者的 `abh.execution-authority.create` 管理权限、委托上界及完整责任证明，创建记录、Command Receipt、Audit 与 Outbox。Decision Effect 可按固定 effectKey 先幂等创建有限 Service Grant，再创建 Action 绑定的 Authority；任一步崩溃查回已提交 Receipt，未完成 Authority 时 Action 仍为 Validated。两步也可由对应 Owner 在同库 UoW 一次提交。

`(resourceOrganizationId, issuanceEvidenceRef, effectKey)` 是额外的业务去重键；同来源同摘要返回原 Authority，异摘要拒绝。重投已撤销/到期记录的签发请求只返回原历史结果，不能生成新有效记录。续期必须以新的签发证据重新检查上界并创建新 Authority；原 Grant 的扩权、续期或版本更换不自动扩张旧 Authority。

RevokeAuthority 提升该 Authority fence 并与状态、Audit/Outbox 同事务提交；撤销源 Grant、Principal、Scope、Purpose 或命中 stopConditions 同样使委托立即不可用于新授权/Permit。到期按数据库时间检查，不等待后台改 status。已派发项由独立、仅具查询/止损用途的 Service Authority 继续处理，不能继续借用已撤销执行委托。已批准的历史决定和用户 Session 到期均不改变这些规则。

Action Owner 从受信动作定义绑定的执行 Service 及合法提案来源选择 Authority；候选不唯一返回 `EXECUTION_AUTHORITY_AMBIGUOUS`，缺失时进入必要责任流程。客户端可提供 authorityRef 作为匹配断言，不能指定任意 Service 或覆盖范围。一次批准的首次路径先保存 Action，随后通过 Decision Effect 签发 Action 绑定的 Authority，因此不要求提案前已有该 Action 的执行权限。

## 3. 接口

| 接口 | 输入与返回 |
|---|---|
| EvaluateAuthorization | RequestContext Ref、Target、inputVersionRefs、authorityRefs、pinnedAssignmentRef?；返回 Allow/Deny/NeedsResponsibility、Obligations、dependencyVersionVector |
| AuthorizeAction（Internal） | Action Ref + 上项输入 + Ledger Requirements；在 Action T1 中签发 Snapshot Ref，不能独立把 Action 改 Authorized |
| RevalidateDispatch | snapshotRef、operationRef、currentPayloadDigest、fencingToken；返回 Permit 所需的当前检查结果 |
| CreateGrant | principalRef、scope/action/limit/purpose、validUntil、decisionRefs、requestCompletionEvidenceRef、expectedSourceVersion；返回 grantRef；无需新增人类决定的派生权限须引用已有有效 Authority |
| CreateExecutionAuthority（治理 Command，Preview） | 第 2.1 节全部必填业务字段、effectKey、expectedSourceVersions；服务端补身份/组织/摘要/状态；返回 authorityRef、issuanceReceiptRef；EXECUTION_AUTHORITY_INVALID / EXECUTION_AUTHORITY_SCOPE_EXCEEDED |
| RevokeGrant / Authority | ref、reason、expectedVersion；提升 fence epoch、Audit/Outbox |
| ResolveExecutionAuthority（Internal） | actionRef、sourceCommandRef、executionPrincipalRef、authorityRefAssertion?；返回唯一 authorityRef 或 NeedsResponsibility；不创建权限 |
| EvaluateAutonomy | missionRef、capabilityEvidenceRef、riskScope；返回 effectiveLevel、constraints、reasons |
| PublishMandatoryPolicy | signedPolicyArtifactRef、evaluationRef、independentDecisionRef、activationScope；部署治理权限必需 |

Grant Query 默认裁剪条件详情；Authorization Explanation 返回用户可理解的缺责任/预算/用途/版本原因，不暴露他人的权限配置或全套 Policy 代码。

`GetExecutionAuthority` 为 Strong Query；`ListExecutionAuthorities` 支持 executionPrincipalId、bindingKind、status、scopeRef/cursor，按 createdAt/id 排序并裁剪来源证据。创建/撤销分别要求当前 `abh.execution-authority.create/revoke` Grant 与适用治理责任，读取要求 `abh.execution-authority.read`；普通 Agent/Pack 不开放签发入口。创建、撤销和到期标记的事务产生 ExecutionAuthorityCreated/Revoked/Expired，Payload 仅含 authorityRef、sourceGrantRefs 与 epoch，供 Action/Durable/Projection 消费；消费事件不能代替同步有效性检查。

## 4. 裁决算法

解析资源 Owner 与责任链 → 选择/重验固定能力版本 → 构造 canonical Policy Input → Mandatory 与 Behavior 分别求值 → Allow 求交、Obligation 求并 → 验证无冲突且可执行 → Ledger 检查/预留 → Snapshot。

没有附加 Behavior Policy 的槽位使用显式空限制版本。Mandatory Deny、缺输入、WASM 超时、未知 Obligation、用途不匹配均拒绝。必要人类责任缺失返回 NeedsResponsibility，不自动创建全权限 Grant。

Preview 评估用于解释，正式执行在同事务中验证全部输入版本；不能把事务外 OPA 的旧结果直接当成最终结果。使用过的 Policy 版本不可变，但当前 Mandatory Policy 收紧始终在 Dispatch 重验。

依赖清单包含该 Target 继承的组织、Workspace、对象、Principal/Authority、用途和能力撤回 fence，按公共 canonicalLockKey 排序获取。新增 Scope 与父级关系同样由 Control 管理，不能只锁叶节点而漏掉组织级撤权。CreateGrant 由人工责任产生时必须验证 Request Completion Evidence 与全部必需 Decision；幂等键绑定该证明和 effectKey，单个未完成链路的批准不能建 Grant。

Action T1、Snapshot 续签与 T2 均重验 authorityRef 的冻结范围和当前状态、全部源 Grant、executionPrincipalRef、allowedProposerRefs 与原 Command 事实；Snapshot 保存该依赖向量。允许提案不表示允许派发，记录中自报的 sourceCommand/Authority Ref 必须回源核对。后续 Authority 更换仅由 Action Owner 的重新授权协议接受，不能由队列参数替换。

snapshotTtlSeconds 默认 60、范围 5–300 秒，不得超过当前 Context/Grant/Authority 的最早期限；长任务每次调用可基于仍有效的长期 Authority 签发新 Snapshot，不能直接延期旧记录。初始 Invocation 在 Created 阶段仅获上下文/Binding 装配权限，模型和 Tool 调用须在完整合同固定后重验 Running。

## 5. 时序与故障

主路径：Owner 提交请求 → Resolver 加载事实/版本 → WASM 计算 → 授权事务重验/预留/快照 → Owner 提交状态。拒绝记录原因与最小 Audit，不写成功 Snapshot。

Policy 发布失败保持旧有效版本；若紧急规则要求立即冻结，则先提交 scope stopFlag，再处理策略 Artifact。无有效 Policy 时 fail closed。WASM 不允许网络、文件、系统时间或不确定随机数，时间作为冻结输入传入。

Grant 撤销与 Dispatch 竞争依授权链 T2 处理。Delegation 撤销传播至所有下游委托；V1 最多一层显式委托，避免递归授权图。旧 Approved Decision 不因缓存仍可读而重新生成已撤销 Grant。

## 6. 性能与配置

Resolver p95 40 ms 预算；Policy 计算默认 20 ms 上限，输入最多 64 KiB，WASM memory 上限 32 MiB；超限拒绝。缓存只缓存不可变 Policy/Schema 与短时只读投影，Grant/fence 写判定不能从旧缓存放行。

配置 policy.defaultDeny=true（不可关闭）、control.maxDelegationDepth=1、control.snapshotTtlSeconds 按第 4 节、autonomy.globalCeiling 默认 L2（部署/Mission 可更低）。提高等级需对应证据和独立人类责任。

错误 AUTHORITY_REQUIRED、POLICY_DENIED、POLICY_INPUT_MISSING、OBLIGATION_CONFLICT、AUTONOMY_EXCEEDED 在 Registry 映射 Precondition/Authorization；不能回退到仅 RBAC。

ExecutionAuthority 错误映射：EXECUTION_AUTHORITY_INVALID → Validation/400；EXECUTION_AUTHORITY_SCOPE_EXCEEDED → Authorization/403；EXECUTION_AUTHORITY_AMBIGUOUS → Conflict/409；过期/撤销使用 AUTHORITY_REQUIRED 或 EPOCH_REVOKED，并按当前可见性裁剪原因。

## 7. 观测、验收与复用

`abh doctor authorization --target` 输出安全裁剪的决定路径与失效版本。指标授权时延、拒绝原因、Policy 版本漂移、撤权传播；Audit 保存责任、Grant、Purpose、输入摘要与 Policy Ref。

测试：每个 Mandatory Deny；同级多 Assignment；过期委托；上下游组织反置；模型高置信越权；事务外许可但事务内版本变化；未知 Obligation；WASM超时；撤权竞争；同一批准重复建 Grant；L4 仍受预算/用途限制。

独立 Action 必测：无 Authority 时只能提案；完整批准后只签发一次有限 Service Grant/Authority；Effect 两步之间崩溃；错 Service/提案人/Action/Payload 拒绝；Session 到期但合法委托仍可执行；源 Grant 撤销、Authority 到期或撤销先提交则新 Permit 为零；旧签发请求不能复活已撤销权限；多个 Authority 不复制预算。断言包含 Authority、Grant、Ledger、Snapshot 和 Fake Provider 的实际调用。

复用 OIDC 身份输入、OPA-WASM 条件求值与 PostgreSQL 原子事实；不部署独立 OPA/OpenFGA，不建立第二授权服务。规则发布与行为发布保持独立 Owner/身份。

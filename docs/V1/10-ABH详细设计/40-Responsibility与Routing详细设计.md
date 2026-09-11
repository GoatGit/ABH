# Human Responsibility 与 Routing 详细设计

> 版本：1.1 · Owner：Human Gateway Maintainer
>
> Core 只定义 Goal、Authorization、Correction、Exception；品牌/代理商岗位由 Domain Pack 提供模板。

## 1. 人类责任身份

Responsibility Principal = 当前真实用户 + Organization + Responsibility Type + Scope + 有效期。登录 Role 与 Employment Title 仅为组织兼容输入，不直接决定审批资格。

用例：配置责任；按最短有效路径找人；多个责任方独立决定；专项审查按风险触发；无人负责保持 Unresolved；显式委托与到期升级。日常 Agent 生产不变成人工排队节点。

## 2. 模型

| 表 | 字段与约束 |
|---|---|
| human.responsibility_assignments | principalRef、organizationId、responsibilityType、scopeRefs、validFrom/until、templateRef、status、version |
| human.requests | requestType、subjectRef/version、proposalRef、impactEnvelopeRef、evidenceRefs、requiredSlotSpecs、status、expiry、version |
| human.routes | requestRef/revision、policyVersionRefs、slots、dependencies、resolutionEvidenceRef、digest |
| human.route_slots | slotId、responsibilityType、responsibleOrganizationId、scope、candidatePrincipalRefs、selectionMode、requiredSeatRefs、decisionRefs；ALL 每席位独立 Decision |
| human.escalations | request/slotRef、deadline、nextResponsibilityRef、triggerEventRef、deliveryRef |

Assignment Owner 属 Human Gateway；Delegation 的权限约束由 Control 保存与验证。查询人选时同时检查责任资格和必要审批 Grant，不能把所有管理员作为兜底。

## 3. 接口

| 接口 | 必填输入 | 返回 / 错误 |
|---|---|---|
| AssignResponsibility | principal、organization、type、scope、validity、templateRef、authorityRefs | assignmentRef；RESPONSIBILITY_SCOPE_INVALID |
| RevokeResponsibility | assignmentRef、expectedVersion、replacementRef?/reason | epoch/路由重算事件；LAST_REQUIRED_RESPONSIBILITY |
| CreateResponsibilityRequest | kind、subject/version、proposalRef、impact/evidenceRefs、requiredSlots、expiry | requestRef；REQUEST_EVIDENCE_MISSING |
| ResolveRoute（Internal） | requestRef、frozenPolicyRefs、directoryVersion | routeRef 或 Unresolved；RESPONSIBILITY_UNRESOLVED |
| DelegateSlot | slotRef、toPrincipal、limitedScope、expiry、grant/delegationRefs | 新 Route revision；DELEGATION_EXCEEDS_AUTHORITY |
| Escalate（Internal） | requestRef、slotRef、deadlineEvidence | 下一合法责任候选，不自动批准 |

`ListMyResponsibilities`/`ListRequests` 以当前组织、type/status/priority/cursor 筛选；投影只呈现本用户应处理的事项、影响、截止、证据和可操作按钮。代理场景具体责任模板由 Pack 注入，跨组织内容先裁剪。

## 4. 路由算法

校验 Request 类型与对象 → 由冻结 Policy 得到 required Slot Spec → 按组织/Scope/责任资格匹配 → Control 检查当前审批权限/职责分离 → 构造有界 Route → 全部必需槽位可路由才 Open，否则 Unresolved。

默认只有必要槽位；Slot 可配置 ANY 或 ALL，不自动串联所有专家。前置责任仅在结果会改变后续问题时建立依赖；专家按策略触发，生产输出不必逐件经过人工。

ANY 的首个有效决定与 ALL 的逐席位决定按状态规范执行；ALL 席位列表由必需责任确定，不能对“所有搜索到的人”动态计票。责任席位变更生成新 Route revision，只能携带内容、Scope、条件和现行资格仍完全匹配的决定；否则新建 Pending Decision。多个决定条件求交，冲突则保持不可生效并请求修订。

Agent 可提出 requestType/risk，确定性规则根据对象影响验证分类；低报风险或缺少强制槽位拒绝。执行关键请求不能依赖 LLM 分类结果直接短路责任。

## 5. 事务与恢复

T1 Request + 固定 Slot Spec + Audit/Outbox → Resolver 读取责任版本 → T2 Route revision CAS + 通知 Outbox。目录变更后 Pending Slot 重算人选，已批准 Decision 历史不改，但后续执行须重验其责任仍满足策略。

通知失败只重试 Delivery，不创建新 Request；超时从预配置合法责任链升级，无合法人选则 Unresolved；Request 整体到期后 Closed、尚未提交的 Decision 为 Expired，无授权效果。委托撤销提升 epoch，阻断旧被委托人提交；同一用户在不同 Scope 兼任时每次决定明确一个责任组织/类型。

## 6. 配置、观测与验收

routing.maxSlots=8（1–32）、maxDepth=4、resolveDeadlineMs=1000、defaultResponseHours=24；提醒时间由 Request 业务期限配置。路由查询 p95 100 ms，邮箱/消息 Provider 不进入提交事务，默认仅应用内待办。

指标 unresolved_age、route_depth、unnecessary_escalation、candidate_conflict、repeated_intervention；`abh doctor responsibility --request` 显示缺哪种责任/Grant，不推荐绕过策略的管理员。

测试：无合法责任人；同名职位不同组织；同一人兼任被职责分离禁止；委托扩权；目录撤销；专家未触发不入链；通知失败；过期不默认批准；跨组织证据裁剪。通过率不按审批速度单独优化，需同时看错误授权和人工投入。

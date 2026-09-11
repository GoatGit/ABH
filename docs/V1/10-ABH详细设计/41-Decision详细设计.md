# Decision 详细设计

> 版本：1.2 · Owner：Human Gateway Maintainer · 内部模块 `decisions`
>
> 状态唯一来源：[Human Gateway 状态](02-状态与执行契约规范.md#4-human-gateway)。

## 1. 不可混淆的两步

Decision 记录人类对具体事项的正式决定；后续 Grant、领域修改、Action 授权由各 Owner 分别提交。界面需要区分“已批准”和“已生效”，避免批准后误报已经投放或预算已调整。

## 2. 决定包和数据

| 数据 | 必填字段 |
|---|---|
| Decision Package | requestRef/routeRevision/slotId、subjectRef/version、proposalDigest、question、recommendation、alternatives、impactUpperBound、risks、evidenceRefs、validUntil、allowedResponses |
| human.decisions | packageDigest、actorRef、responsibilityRef、decisionGrantRefs、response、conditions、reasonRef、status、decidedAt、version |
| human.decision_effects | requestRef/routeRevision/effectKey 唯一；decisionRefs、completionEvidenceRef、targetOwner、commandRef、receiptRef、statusRef、appliedAt、failureRef |
| human.decision_deliveries | decision/requestRef、recipientRef、channel、deliveryKey、attemptCount、receiptRef |

Package 文案由模板与已验证产物生成；必须展示最大金额/Scope/影响、条件与不确定性。没有证据不能生成貌似完整的推荐；摘要不能隐藏重要风险。

## 3. API

| 接口 | Payload / 条件 | 返回 |
|---|---|---|
| BuildDecision（Internal） | requestRef、routeRef、slotId、proposal/evidenceRefs | packageRef/digest；DECISION_PACKAGE_INCOMPLETE |
| SubmitDecision | decisionRef、packageDigest、expectedVersion、response、conditionRefs、reason、reauthProofRef? | decisionRef + effectTrackingRefs；DECISION_STALE/DECIDER_NOT_ELIGIBLE |
| WithdrawPending | decisionRef、reason、expectedVersion | Withdrawn；已批准不能原地撤写 |
| SupersedePending（Internal） | oldRef、newSubjectVersion、newPackageRef | 旧 Pending → Superseded，新 Pending |
| RevokeDecisionEffect | decisionRef、effectRef、reason、currentAuthorityRefs | 对应 Control/Domain 撤销 Command，不改历史决定 |
| GetDecision / ListInbox | id 或 status/type/expiry/cursor | 按当前责任/权限裁剪的包与 effectStatus |

response 取批准、拒绝或带条件批准；带条件批准以 Approved + 注册 conditionRefs 保存，不能附任意自然语言“以后看着办”充当可执行规则。拒绝/重大例外需理由，批量批准必须逐对象版本显示与记录。

## 4. 提交事务

入口认证/必要 MFA → 回读 Package 与实际对象版本 → T1 按公共锁序锁当前控制 fence 与 Request/Decision，重验责任、Grant、Delegation、职责分离、Purpose、Expiry、冻结 Route 和所见版本 → CAS Pending 并写决定/Audit → 汇总所有必需槽位，只有全部有效批准且条件相容时写唯一 Request Completion Evidence/Effect Outbox → 返回已批准/拒绝及整体待办状态 → 目标 Owner 幂等处理 → T2 保存 Effect Receipt。

Control/Domain 消费 Effect 时再次验证整体完成证明、每项 Decision 和当前对象/责任版本；唯一键绑定 requestRef/routeRevision/effectKey。任一必要拒绝、到期或条件冲突均不能创建 Grant。由一个 Slot 直接生成整个 Request 的执行 Grant 必须被接口拒绝。单人请求沿用同一流程，只有一个席位，无额外人工环节。

独立 Action 的执行 Effect 包含有限 Service Grant 与 Action 绑定 ExecutionAuthority，其签发、来源和幂等按 [Control 第 2.1 节](21-Authorization与Policy详细设计.md#21-独立-action-的-executionauthority)执行。Effect Receipt 必须关联所需 Grant/Authority 的完整结果，只有 Grant 已提交而 Authority 尚缺失时不能标记 Applied。重复 Effect 复用原结果，已撤销的记录不因重放 Approved Decision 而复活。

T1 与人类在页面上看到 Package 相隔可能很久，不能复用打开页面时的授权缓存。任何实质版本变化返回 409 与刷新提示，不自动把旧批准应用到新方案。

## 5. 故障与撤销

批准成功但 Effect 提交失败：Decision 保留 Approved，effectStatus 显示待处理/失败；Worker 以 effectKey 重投 Owner Command。若当前权限/版本已失效，停止并产生新责任事项，不能静默补发新 Grant。

同一用户双击只产生一个决定；两个不同决定并发，CAS 只接受首个有效响应。截止与提交竞争以数据库当前时间/事务顺序判断。通知或浏览器关闭不会回滚已提交决定。

上述首个响应规则用于同一 Decision/ANY 槽位；ALL 不同席位可独立提交，最终汇总在 Request CAS 下串行。旧 Route 的迟到响应拒绝；撤权先提交则 T1 拒绝，Decision 先提交则保留历史、Effect 与派发仍检查当前资格。

撤销影响须撤相关 Grant/Authority 或提交新领域变更；有已派发 Operation 时保持对账/补偿。高风险决定不能仅通过推送消息里的“同意”文字确认，需经受认证的完整 Package 页面/等价签名客户端提交。

## 6. UX、安全与配置

页面结构：事项/责任 → 推荐与备选 → 影响/风险 → 证据 → 明确按钮与理由。Unknown/Stale/版本变化必须可见。盲批风险通过抽样理解测试、批量上限和高风险重新认证降低，不把人类点按钮当作天然安全。

decision.maxBatchItems=20（高风险默认 1）、decision.packageMaxBytes=64 KiB、notification.maxRetry=3；提交 p95 ≤ 200 ms，不含 Effect 最终执行。Metric decision_latency、stale_submit、effect_pending_age、rejection_reason、repeated_approval；Audit 保存所见 Package Digest 和实际责任。

`abh doctor decision --id` 区分 Package、批准与 Effect；修复入口是重验/重投合法 Command，不是数据库改状态。

## 7. 验收

批准后对象变化、权限撤销、委托到期、重复点击、双人竞争、过期边界、条件不可执行、T1 后崩溃、通知失败、Effect 重投和撤销在途效果全部进入集成测试。E2E 断言用户能够区分“已批准、待生效、未知结果、已完成”，且无法通过前端按钮缓存绕过后端权限。

双边/ALL 用例必须断言第一方批准不会创建 Grant，全部必需批准只创建一次 Effect；拒绝、条件冲突、人选变更和撤权竞争均不能漏过。

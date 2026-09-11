# Correction、Exception 与 Takeover 详细设计

> 版本：1.2 · Owner：Human Gateway Maintainer
>
> 纠错与接管沿用正式责任、授权和对象版本；无需另建人工生产系统。

## 1. 三种行为

Correction 是对事实/产物的带依据修改建议，由 Domain/Memory/Run Owner 验证提交。Exception 是无法安全自动收敛的问题及其责任处置。Takeover 是在有限 Scope 内暂停自动生产、由有权人类发相同业务 Command，退出后系统重验恢复。

人类替换产物属于真实人工投入，必须记录；不能标记为 Agent 自动产出。关闭 Exception 只关闭责任事项，不证明外部 Unknown 已消除。

## 2. 数据与接口

| 记录 / Command | 字段、前置条件与返回 |
|---|---|
| human.corrections | subject/version、beforeRef、proposedAfterRef、reason、evidenceRefs、responsibilityRef、targetOwner、receiptRef；保留原版本 |
| human.exceptions | sourceRef、category、severity、impact、blockedScopeRefs、requiredResponsibility、requestRef、resolutionRef；责任状态投影自 Request，技术状态回读源 Owner |
| human.takeovers | scope、principalRef、authorityRef、stopEpoch、startedAt、expiresAt、releaseRef、statusRef |
| ProposeCorrection | subject/version、newArtifactRef、reason/evidence、purpose；返回 correctionRef 与 Owner Command Ref |
| ResolveException | exceptionRef、resolutionKind、evidenceRefs、decisionRef、expectedVersion；返回责任结果与未决技术状态 |
| BeginTakeover | scope、reason、authorityRef、expiresAt、expectedVersion；提升 stopEpoch、返回 takeoverRef |
| EndTakeover | takeoverRef、manualChangeRefs、handoverSummaryRef、expectedVersion；返回恢复验证请求 |
| ExtendTakeover | ref、新 expiry、对应责任/Grant；不能无限自动续期 |

resolutionKind 仅允许 WaitForEvidence、RejectAndStop、ApplyCorrection、RequestCompensation、AuthorizedContinue 等注册类型；强制风险不能以备注覆盖。例外通知不另建执行状态机，引用 Request/Decision 和源 Action/Run 的实际状态。

## 3. 纠错主流程

人类看见当前对象/错误证据 → 创建 Correction → Human Gateway 记录责任 → Domain Owner 用 expectedVersion 验证并提交新版本 → Receipt 更新并保留前后差异/理由/结果 Ref。学习已启用且用途允许时，订阅既有事件执行 CaptureSignal；未启用时纠错正常完成，无学习作业。

事实纠错未通过来源验证时留候选；批准品牌事实的资格由领域责任定义。系统能力纠错（Prompt/Workflow）进入 Capability Candidate，不能直接改当前生产版本。

## 4. 接管与恢复

T1 BeginTakeover 保存 Scope、期限、责任、stopEpoch/Audit → Run 停止新 Invocation/未派发动作 → 已派发动作继续对账 → 有权人类通过相同 Domain/Action API 工作 → T2 EndTakeover 提交交接 → 重读对象/预算/权限/未知效果 → 创建新 Run 或明确 Blocked。

暂停 Agent 不等于暂停外部持续运行资源；接管需要停外部资源时必须另外发安全暂停 Action 并显示确认结果。接管到期先冻结人类接管权限和自动恢复，发责任提醒，不能无人验证就重新启动旧策略。

## 5. 失败与安全

Correction 与 Agent 更新同对象发生冲突，返回 CORRECTION_STALE，保留原建议并展示 Diff；不使用 last-write-wins。接管请求重复由 scope/key 去重；两个接管人争同一 Scope，按独占租约或明确多人策略，V1 默认独占。

异常源已解决但路由事件迟到时回读源 Owner 再关闭，保留解决证据。未知效果人工声称失败不足以触发释放负债，必须引用可信观察或登记的法律处置依据且仍标记技术 Unknown。

## 6. 配置、观测与验收

takeover.defaultTtlMinutes=60、maxTtlMinutes=480、correction.maxEvidenceRefs=50；Scope 外人类操作照常受权限拒绝。普通 API SLO 适用，外部接管/停机完成时延显示独立 Tracking。

`abh doctor exception --id` 返回阻断来源与合法下一步；Metric repeated_correction、takeover_minutes、manual_output_share、exception_recurrence、unsafe_resume_blocked。原始人类修改按用途保留，撤回学习用途不删除仍需审计的决定。

测试：越 Scope 接管；暂停后外部仍运行的正确展示；接管到期；原未知未消除时关闭事项；纠错版本冲突；手工产物不能算自动；EndTakeover 遗漏变更；恢复时 Grant/预算失效。证据来自 Owner 状态、Audit 与实际人工分钟。

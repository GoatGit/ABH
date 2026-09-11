# Verification 详细设计

> 版本：1.1 · Owner：Verification Maintainer · 公共 Port：`VerificationPort`（Preview）
>
> 本模块拥有不可变验证报告，Run/Domain/Release 各自决定状态提交。

## 1. 验证层级

| 顺序 | 检查 | 失败处置 |
|---|---|---|
| 1 Schema | 输出类型、长度、必填、引用格式 | Reject，返回安全错误路径 |
| 2 来源与版本 | 来源存在、用途、时效、对象版本、可追溯引用 | Reject 或 Inconclusive，不猜测事实 |
| 3 确定性规则 | 金额、范围、状态前置条件、计划完整性 | Reject，不交给模型覆盖 |
| 4 领域质量 | 专业 Validator/独立评测；输出局限 | Pass/Reject/NeedsResponsibility |
| 5 风险与责任 | 必需规则适用、证据缺口、独立人类责任 | NeedsResponsibility 或 Reject |

验证器检查产物，不授予执行权限。验证 Pass 后 Action 仍须 Preflight；人类批准也不能绕过强制规则失败。

## 2. 契约与数据

`VerifyCandidate` 必填 verificationRequestId、candidateRef/digest、taskContractRef、inputVersionRefs、scope、AuthorizedContextRef；可携 decisionRefs。profileRef 由 Resolver 根据固定 Task 验收规则和当前 Mandatory Validator 选择；调用方提供的引用只作相等性断言。返回 reportRef、verdict、findings、requiredResponsibilityRefs、validatedSourceVector。

Finding 包含 code、severity、ruleRef/version、subjectPointer、evidenceRefs、messageKey、remediationKind；正文不包含隐藏推理。VerificationProfile 固定验证器顺序、版本、阈值、mandatory 标记和超时。

core.verification_reports 使用独立 reportId，唯一受理键为 resourceOrganizationId/verificationRequestId；同请求异参拒绝。保存 taskContractDigest、candidateDigest、profileDigest、sourceVectorDigest、decisionVectorDigest、scope/purpose、reportDigest、verdict、validatorResultRefs、issuedAt、expiresAt、principalRef。内容摘要用于普通索引和可选缓存匹配，不设成阻止复评的唯一键。Validator Result 不可变，T1 提交报告/Audit/Outbox；创建者不能原地修改 verdict。

Port：Run 和 Learning 调用 Verification；Pack 提供注册的 Validator 实现或声明式规则；宿主固定 Mandatory Validator。`GetReport` 按 Scope 裁剪 Findings；`ListFindings` 支持 severity/ruleRef/cursor。事件 VerificationCompleted 只含 Ref/verdict/sourceVectorDigest，供 Run 与 Learning 消费。

## 3. 主流程

调用方先持久保存 Candidate → Resolver 授权本次验证 → 加载冻结 Profile → 有界执行确定性层 → 按需调用专业 Validator → 汇总所有 required 结果 → 保存报告 → Owner 使用报告与当前版本完成提交。

验证器间独立读取同一候选/输入快照；不把一个 Validator 的未验证输出写成另一个的正式事实。任何 mandatory Reject 汇总为 Reject；mandatory 缺失/超时为 Inconclusive；只有全部 mandatory Pass 且无未解决责任才 Pass。

## 4. 故障与人工路径

某个 Validator 超时，保存已完成子结果与 Inconclusive；相同输入可以复用仍有效的确定性子报告，重新执行未完成项。重新评测生成新 report，不覆盖旧证据。

重发同 verificationRequestId 返回原报告；复评创建新请求并引用 priorReportRef，防止 Inconclusive 永久占住唯一键。缓存匹配包含组织、用途、Scope、Task 合同、Profile、来源和 Decision 版本；命中仍校验当前权限、有效期及 Mandatory 规则。缓存只能复用确定性证据，不能替新请求制造独立评测样本或重新签发更长有效期。

NeedsResponsibility → Human Gateway 冻结 Candidate/输入版本 → 人类决定 → Owner 提交新验证请求，附 Decision Ref。确定性硬失败仍存在时继续 Reject；“有人点批准”不是清除 Findings 的规则。

报告与提交之间来源变化，Owner 返回 VERIFICATION_STALE 并重验；不能把过时 Pass 永久缓存。外部评测供应商失败时停止晋级，不回退到 Producer 自评。

## 5. 安全与性能

Validator 代码遵循 Pack Trust Mode；Declarative 只能运行无 I/O 规则，TrustedCode 静态审查，其他代码走隔离 Port。Evaluator Principal 与 Producer 区分；同一模型可以在隔离评测中提供质量信号，但不能独自证明高影响安全/统计结论。

配置 verification.maxValidators=12（1–32）、verification.deterministicDeadlineMs=1000（100–5000）、verification.externalDeadlineMs=30000（1000–120000）；Profile 可收紧，生产放宽需评测。Schema/简单硬规则内部 p95 30 ms 预算；专业评测异步，不阻塞普通 HTTP。

错误 VERIFIER_UNAVAILABLE 属 Dependency；VERIFICATION_STALE 属 Conflict；PROFILE_UNTRUSTED 属 Authorization。指标 report_verdict、validator_timeout、stale_pass_reject、finding_recurrence；`abh doctor verification --id` 显示第一条 mandatory 未过原因。

## 6. 验收与演进

Golden Cases：合法产物；schema 注入；引用不存在/过期；金额越界；多 Validator 分歧；mandatory 超时；人类批准硬失败；Producer 自选 Profile；报告回放后源版本变化；跨租户 Findings。断言无 stale/partial Pass 被用于 Task 成功或能力发布。

复评验收必须覆盖同输入 Inconclusive → 新请求 Pass、补齐 Decision 后重验、同摘要不同租户/验收规则，以及重复请求只返回原报告。

Schema/来源检查和证据报告是独立职责；领域专业算法由 Pack 实现，统计 Engine 不迁入 Core。初始使用进程内 Validator 与离线 Artifact，只有隔离需求成立时增加执行隔离。

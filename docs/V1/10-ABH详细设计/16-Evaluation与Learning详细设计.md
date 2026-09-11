# Evaluation 与 Learning 详细设计

> 版本：1.2 · Owner：Evaluation Maintainer · 内部模块 `learning`
>
> 发布权见[Capability Release](30-Capability-Release详细设计.md)；领域 Knowledge 由 Domain Owner 提交。

## 1. 双回路与阶段

未启用学习时仅由原业务 Owner 保留必要结果、纠错与 Audit，不启动 Learning 的订阅、队列或采样任务。需要时显式启用 Signal 捕获；M2 支持归因、Candidate 与离线评测，Shadow/Canary/自动发布仅在相应证据具备后启用。业务知识与系统行为分开：

- 业务知识：来源/实验 → Knowledge Candidate Command → Domain Knowledge Owner。
- 系统能力：Signal/根因 → Capability Candidate → 独立 Gate → Release Controller。

强制安全 Policy 和 Evaluation Profile 自身变更进入独立治理，不能与被约束/被测候选同批放行。

## 2. 数据与身份

| 表 / 聚合 | 核心字段 |
|---|---|
| learning.signals | sourceEventId、sourceType、scope、purpose、actorRef、before/afterArtifactRefs、reasonRef、resultRef?、quality、expiresAt；sourceEventId/采样规则版本唯一 |
| learning.cases | signalRefs、clusterKey、rootCauseCode、support/counterEvidenceRefs、domainOwnerRef、version |
| learning.candidates | assetKind、baseVersion、candidateArtifactRef、scope、caseRefs、risk、status、producerPrincipal |
| learning.evaluation_profiles | suite/datasetSnapshot/evaluator/metric/threshold/stoppingRule Refs、approvedByRef；不可变 |
| learning.evaluation_runs | candidateRef、profileRef、assignmentUnit、baselineRef、seed、executionRefs、costRef、statusRef |
| learning.gate_artifacts | evaluationRunRefs、verdict、metricValues、uncertainty、limitations、signerPrincipal、digest |

只有已授权用途的 Signal 可进入 Dataset。Candidate 与 Case 是正式受治理记录，但其主张不自动获得事实资格。Producer、Evaluator、Release Authority 使用独立审计 Principal；Profile 选择由资产类型/风险的登记策略决定。

## 3. 接口

| 接口 | Payload / 条件 | 输出 / 错误 |
|---|---|---|
| CaptureSignal | sourceEventRef、signalType、artifactRefs、scope、purpose、samplingPolicyRef | signalRef；LEARNING_PURPOSE_DENIED |
| BuildCase | signalRefs、rootCauseCode、evidenceRefs、counterEvidenceRefs | caseRef；CASE_EVIDENCE_INCOMPLETE |
| CreateCandidate | caseRef、assetKind、baseVersion、candidateArtifactRef、scope、risk | candidateRef；CANDIDATE_SCOPE_EXCEEDED |
| RequestEvaluation | candidateRef、baselineRef；调用方不可自填 Suite/Threshold | 由策略冻结 profileRef/evaluationRunRef |
| SubmitEvaluationResult（Internal） | runRef、artifactRefs、metricValues、dataDigest、evaluatorPrincipal | 不可变结果；EVALUATOR_IDENTITY_INVALID |
| BuildGate（Internal） | candidateRef、requiredEvaluationRefs | Pass/Fail/Inconclusive Artifact；不创建 Release |
| SubmitKnowledgeCandidate | caseRef、claimArtifactRef、analysis/evidenceGateRefs、scope、ttl | Domain Command Receipt |

Query 支持 Candidate status/assetKind/scope、Case rootCause、Signal sourceType；默认聚合计数，不返回原始用户纠错正文。所有列表 cursor 和水位遵循公共契约。

## 4. 主流程与评测

CaptureSignal 同事务去重/Audit/Outbox → 规则聚类并可由 Agent 提出根因 → 人工或确定性验证根因证据 → Candidate → 根据风险选择冻结 Profile → 隔离执行 baseline/candidate → 验证结果与数据快照 → Gate → Release Controller。

复用 promptfoo 执行 Prompt、Model Route、Tool Schema 和对抗回归；测试 Runner/确定性 Engine 处理硬控制和统计指标。OpenTelemetry 仅提供经授权采样 Ref，Trace 分数不能直接作为 Gate。所有模型评测经 Model Gateway，网络/费用不豁免。

固定 Dataset、baseline、随机种子、模型/Prompt/工具版本、统计方法、样本量与停止规则；训练/调参集和保留测试集分开。多重比较、选择偏差与 Canary 干扰由评测协议处理，不能凭一次分数提高自动晋级。

## 5. 失败恢复与用途撤回

评测队列失败从已提交 evaluationRun/step Ref 恢复，已计费调用不无界重试。缺样本/结果超时是 Inconclusive；不得丢弃失败样本后计算“成功率”。

来源删除/用途撤回 → 标记受影响 Signal/Case/Dataset 不可再用 → 停止候选/评测 → 通知 Release Controller 撤回不再满足用途的分配 → 依合法保留要求清理 Artifact。模型权重未作为本框架在线训练目标，不承诺通过删除样本逆转外部模型训练。

Profile 更新必须由独立冻结黄金/事故/对抗集和新旧双跑验证；不能让 Candidate 带自己的考试题和合格线。高风险规则变化仍需人类责任。

Shadow 执行继承 Release 的硬隔离模式，仅生成评测命名空间产物；Dataset 中的回放指令和候选 Tool Request 不能写生产事实。运行结果、计费和 Source Snapshot 需完整绑定，即使任务表现更好也不能绕过独立 Gate。

## 6. 配置、观测与经济性

配置 learning.captureEnabled=false、learning.autoCandidate=false；启用捕获要求组织允许相应用途，候选自动生成还需门禁与 Audit。学习发布开关统一为 Release Owner 的 release.autoPromote，无第二个 learning.autoRelease。learning.maxSignalsPerCase=100、evaluation.maxParallelRuns=2、evaluation.deadlineMinutes=60。Token/工具/人工成本统一入 Ledger/报告。

启用后可从仍合法保留且用途允许的原业务来源有界回填 Signal，按来源与采样版本去重；没有足够历史证据时从当前开始积累。关闭捕获停止新增 Signal，已有用途撤回、保留期清理和已发布能力的责任处理继续运行，直到满足安全停用条件。

指标：重复人工介入率、候选通过/回滚率、每项有效学习成本、holdout 差异、用途撤回传播、来源缺失率。有效学习须有证据、实际采用和价值门槛，报告分子分母，不能只按 Candidate 数量优化。

`abh doctor learning --candidate` 列出缺 Gate、Profile 来源、用途、发布关联和停止原因。捕获启用后复用现有 Core/DB；大型 Artifact 走 ObjectStorePort；不必部署 MLflow/Langfuse。

## 7. 验收与扩展

测试：弱信号直接晋级拒绝；Producer 替换 Profile 拒绝；跨客户样本泄漏；同一 Signal 去重；丢失失败样本；数据撤回后候选/发布联动；评测中断恢复不重复计费；高分但风险退化 Gate Fail；可复现数据/代码 Hash 校验。

Learning 模块拥有证据归因与评测编排，Release 状态、Domain Knowledge 和强制 Policy 都留给独立 Owner。Evaluation Maintainer 在 M2 前提供离线独立性证据，Release 进入真实 Canary 前提供有对照的评测协议。

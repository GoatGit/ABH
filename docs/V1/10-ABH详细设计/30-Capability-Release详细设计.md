# Capability Release Controller 详细设计

> 版本：1.3 · Owner：Release Maintainer · 内部模块 `capability-release`
>
> Evaluation & Learning 只提交 Candidate/Gate；本模块独占 Release 与 Assignment 写权。

## 1. 行为组合与约束

Release 固定已启用的 Agent、Prompt、Workflow、Tool、Model Route、Domain Behavior Policy 与执行能力精确版本，并引用适用门禁证据。学习候选引用 Gate Artifact/Evaluation Profile；静态基线引用构建/CTK/兼容证据，只有策略要求独立评测时才填写评测 Profile。Mandatory Policy、Evaluation Profile、Grant 和预算额度不作为可灰度行为资产。

初始静态运行由本 Owner 按部署方确认的配置、精确版本和适用 CTK/兼容证据，幂等生成基线 Release/Assignment；作者无需分别编写这两类对象。无学习时不创建 Candidate、实验分桶或评测/灰度维护任务，仅保留必要版本解析与撤回。独立 Action 固定所需执行版本，未使用的 Agent/Model 行为槽位不要求占位配置。代码/Schema 改变必须先通过构建、适用迁移和部署，本模块只选择当前可运行版本。

## 2. 数据

| 表 | 字段 |
|---|---|
| release.releases | id、assetVersionMap、packDigestRefs、candidateRef?、gateRefs、evaluationProfileRefs、compatibilityRef、status、version |
| release.assignments | id/revision、releaseRef；Canary 增加 baselineReleaseRef/candidateReleaseRef；scopeTier/scopeRefs、eligibilityPredicateRef、mode、allocationUnitType、experimentId、saltVersion、percentage、stopRuleRef |
| release.allocations | assignmentExperimentId/allocationUnitRef 唯一；assignedReleaseRef、bucket、assignedAt、sourceRevision |
| release.pin_sets | subjectType/subjectId 唯一；subjectRef、subjectInputDigest、requiredSlotsDigest、digest；完整集合不可变 |
| release.execution_pins | pinSetRef/behaviorSlot 唯一；allocationRef?、assignmentRef、releaseRef、capabilityExactRefs、versionVector；与 pin_set 同事务提交 |
| release.withdrawals | targetRef、scope、reason、effectiveAt、authorityRef、stopEpoch |

Release 没有独立的 authority；Shadow 和生产 Assignment 都必须持有各自有限执行权限。正常生产 ResolveAndPin 只选 Active 或合法 Canary 规则，Shadow 不进入生产选择集合。影子任务固定 executionMode=Shadow，只可读取经授权快照、运行计算并在隔离评测命名空间保存产物；生产 Domain Command、Decision/Grant Effect、Action Dispatch 和生产 Knowledge 写入由 Gateway/Owner 硬拒绝。模型/工具成本仍计入独立评测预算，输出默认不作为用户正式结果。

常规替换的新 Assignment 只影响尚未固定版本的新 Run/独立 Action；旧 pin 的适用性独立于新选择集合继续成立，除非已到期或显式暂停/撤回执行资格。不能把“旧 Assignment 不再用于分配”误写成所有旧 Run/Action 立即失效。

## 3. 接口

| Command | 必填输入 / 前置条件 | 返回 |
|---|---|---|
| CreateRelease | assetVersionMap、gateRefs、profileRefs、compatibilityRef | Draft Ref；RELEASE_ASSET_UNAVAILABLE |
| MarkReady | releaseRef、requiredGateRefs、independentDecisionRefs、expectedVersion | Ready；RELEASE_GATE_INCOMPLETE |
| AssignScope | releaseRef、scope、allocationUnit、mode、percentage、stopRule、authorityRefs | assignmentRef；ASSIGNMENT_AMBIGUOUS |
| ResolveAndPin（Internal） | subjectRef、subjectInputDigest、requiredBehaviorSlots、verifiedScope、RequestContextRef、preparationAuthorityRefs | 完整 pinSetRef/digest 与精确能力映射；RELEASE_SCOPE_MISMATCH / PIN_INPUT_CONFLICT |
| GetPinSet（Internal） | subjectSelector 或 pinSetRef、当前 Context | 原不可变集合或 NotFound；不隐式创建/重新选择 |
| RevalidatePin（Internal） | pinSetRef、固定主体 subjectRef/subjectInputDigest、当前 targetRef、currentScope/epoch/purpose | 有效/停止原因；不重新分桶，不重写集合 |
| Pause / Revoke | assignment/releaseRef、reason、expectedVersion | stopEpoch/Outbox；未派发冻结 |
| Rollback | failedAssignmentRef、previousReleaseRef、currentGate/compatibilityRefs | 新 Assignment；不能恢复已不合法版本 |

`ListReleases` 按 scope/status/assetKind、cursor；详情展示来源、独立评测、适用范围与风险，不展示跨客户训练数据。Grant 仍由 Control 校验。

## 4. 分配算法

按 Mission/Object/Task、Workspace、Organization、Domain default 的优先级分层；在一个行为槽位同层匹配多个候选时拒绝。同层包括不同维度的相交匹配，不能用创建时间消歧。

Canary 是一条同时引用 baselineReleaseRef 与 candidateReleaseRef 的分配规则，不以两个相交 Assignment 竞争选择。以冻结 experimentId + allocationUnitRef 作稳定哈希，持久保存 bucket 和 releaseRef。盐、基线/候选、初始比例与选择规则在实验开始前冻结；扩大流量按预注册规则为新分配单元建新 revision，既有单元不因重试/扩容换组。基线/候选和每个 revision 的纳入时段写入分析快照。

共享资源/同一目标下相互干扰的业务单元必须同组；不能为统计好看将共享预算对象拆组。无法可靠对照时只做 Shadow/配对回放，明确证据限制。

### 4.1 Run 与独立 Action 的固定协议

subjectRef 为 EntityRef 闭合联合，type 仅允许 `abh.run`、`abh.action`；所有唯一键继承 resourceOrganizationId。subjectRef.version 是首次固定时的证据，查回身份按 type/id，不因生命周期 version 增长生成新 pin。subjectInputDigest 对 Run 绑定 goalRevision、Workflow/初始任务能力要求与已核实 Scope；对 Action 绑定冻结 Payload/目标语义版本、动作定义及执行能力要求，不包含尚未生成的 Plan 或最终 Snapshot。

Caller 仅为 Run/Action Owner，实现方为 Release Owner。requiredBehaviorSlots 来自受信 Workflow/Action Definition，不能由客户端删槽位。preparationAuthorityRefs 证明当前主体有权准备该目标和读取相应能力；尚待批准的 Action 可以固定版本，但不能因此获得执行权限。正式 ExecutionAuthority、资源预留与 Action Snapshot 仍在后续授权事务验证，不作为版本固定的循环前置条件。

| 来源 | 固定、引用与事务 |
|---|---|
| 新 Run | StartRun 的 UoW 按公共顺序先锁控制/选择 fence，再建立 Queued Run，由 Release Owner 解析全部所需槽位，写 pin_set/pins、Run 的 assignmentSnapshotRef、Audit/Outbox 后同事务提交；任何槽位失败全部回滚 |
| 无来源 Run 的 Action | Action 已 Validated 后调用 ResolveAndPin；Release Owner 与 Action Owner 在同一 UoW 写完整集合、Action 的 pinSetRef、Audit/Outbox。只选择该动作需要的 Connector、编译/执行能力和 Behavior Policy；不创建 Run/Invocation 或 Agent/Model 占位槽位 |
| 来源 Run 的 Action | 从原 Command/Invocation 回源确认 Run 与租户，引用 Run 已有 pinSetRef 的所需槽位；没有所需能力则拒绝该 Action，不补选当前新版本或复制第二份 pin |

继承 Run 的 Action 调用 RevalidatePin 时以原 Run/固定摘要作为 pin 主体、以当前 Action 作为 target；同时验证来源链、Scope 与所需槽位子集。不能把 Action 的 Payload 摘要与 Run 的 subjectInputDigest 直接比较。各对象后续 version 增长继续按公共语义版本规则回验，取消或撤回的执行资格始终实时适用。

首次固定先锁当前 Scope/Assignment 选择 fence，再锁主体，复用公共锁序；Assignment 新建、替换及撤回使用相同选择 fence。完整集合和 canonical requiredSlotsDigest 一次写入，不能逐槽提交留下混合版本。并发同主体、同 subjectInputDigest/槽位摘要返回原集合；不同摘要返回 PIN_INPUT_CONFLICT（Conflict/409）。固定与选取遵循内部解析 p95 20 ms 预算，失败不留下半个集合。

Operation Controller 只使用该 pinSet 的精确 Connector/编译器版本生成 Plan，Plan 保存 pinSetRef/digest。若固定已提交、编译前进程退出，恢复先 GetPinSet，再使用原能力编译；Plan 已提交则按 actionRef 和摘要查回原 Plan。常规新发布不能使恢复换版本，授权续签也不重新 ResolveAndPin。紧急撤回使 RevalidatePin 失败，Action 留待合法处置；需要更换固定行为/计划时创建新 Action 并引用原项。当前 Mandatory Policy 始终重新求值，不随行为 pin 冻结。

M0 仅使用静态 Active 基线。启用 Canary 时，独立 Action 也必须使用规则声明的业务分配单元和稳定 allocationRef；同资源有干扰的多个 Action 共用该分配单元，不能按重试生成的新请求随机分桶。

## 5. 发布与回滚时序

Candidate/Gate 已提交 → T1 创建 Draft Release + Audit → MarkReady 重验 Gate/兼容性和必需独立责任后 CAS Ready → T2 创建经过授权的 Assignment + Outbox → 新 Run/独立 Action 解析并 pin → 监控版本归因指标 → 达阈值后升级范围或暂停。

静态发布使用同一 CreateRelease/MarkReady/AssignScope 协议，candidateRef 为空，Gate 引用部署类型要求的构建/CTK/兼容与责任证据。其自动装配只减少手写配置，不赋予 Loader 授权或发布写权，也不绕过高风险变更所需独立验证；学习候选和灰度能力继续执行完整评测协议。

发现严重退化先 T3 提交 withdrawal/epoch，阻断新 Invocation/Permit → 通知 Run 安全停点 → 已派发操作独立对账 → 验旧版本当前用途/Policy/兼容性 → 新 Assignment 回滚。无合法旧版则保持暂停。

T2 后响应丢失按 commandKey 回读，不新建相交 Assignment。Gate 来源失效或数据用途撤回会使相关 Release 不再满足条件，触发同一停止路径。

## 6. 配置、观测与验收

release.autoPromote=false、canary.defaultPercent=5（1–20，Scope 冻结）、release.maxBehaviorSlots=32；自动扩大前冻结最小样本、质量/成本门槛和观察期。生产配置无隐式“全部放行”。

指标归因保留 release/assignment Ref，低基数汇总质量/人工/成本/事故；`abh doctor release --id` 检查 Gate、安装状态、pins、用途与回退候选。解析内部 p95 20 ms 预算，缓存只含不可变资产，撤回检查读当前 fence。

测试：Producer 自批；Gate 过期；同级冲突；Run 重试换组；比例更新导致旧组变化；共享资源污染；旧版已撤用途仍回滚；发布取消而在途动作；静态 M0 基线无需自动学习服务。断言单一 Owner、可重放分配和当前授权不被 Release 替代。

Shadow 必测尝试生产提案、授权、Knowledge 写入、Dispatch 和普通生产版本解析均被拒绝；Canary 未命中候选桶时返回冻结基线，不能报同层冲突或任取新版本。

固定协议必测：无 Run 的 Action 得到完整执行 pinSet；同主体并发固定只产生一组；固定提交后发布新版本并重启仍编译原 Connector；继承 Run 的 Action 不重选；缺槽位/摘要冲突全部失败；紧急撤回在编译前或 T1/T2 前提交均阻断后续派发；首次 Run 创建失败不遗留 pin。由数据库集合、Plan/Snapshot 摘要与实际 Fake Connector 版本共同断言。

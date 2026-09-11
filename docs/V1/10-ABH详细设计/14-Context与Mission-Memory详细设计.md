# Context 与 Mission Memory 详细设计

> 版本：1.1 · Owner：Agentic Core Memory Maintainer
>
> 独立语义：本模块提交 Mission Memory；Domain Memory、Knowledge 与正式事实由 Domain Owner 提交。

## 1. 用例与产物

为 Invocation 构建足够且最小的上下文；拒绝跨租户/用途材料；在 Token 受限时保留硬约束；记录候选分歧和已验证摘要；删除/撤权后使派生 Context 失效；恢复时提供有来源的正式输入而非重放聊天。

Context Manifest 是不可变 Artifact，字段为 invocationRef 或 jobRef、taskSpecDigest、sections、modelRouteRef、tokenEstimate、reservedOutputTokens、sourceVersionVector、createdAt、digest。TaskSpec 先于 Manifest 固定，完整运行合同再引用 Manifest 摘要，装配顺序见 Run Orchestrator。

Section 字段：key、kind、sourceRef/version、observedAt、expiresAt、trustClass、dataClass、purpose、contentRef、tokenEstimate、required。trustClass 为 SystemConstraint、VerifiedFact、ValidatedClaim、Candidate、UntrustedExternal；字段由 Owner 元数据生成，不采纳正文自称可信。

## 2. 存储与接口

| 记录 | 字段 / 索引 |
|---|---|
| core.mission_memory_items | id、missionId、kind、sourceRefs、contentRef、validUntil、status、version；索引 missionId/kind/validUntil |
| core.context_manifests | id、subjectRef（Invocation/Job）唯一、digest、artifactRef、sourceVectorRef；保存初始 Manifest，不可变；每轮输入 Manifest 由 Model Call 引用 |
| core.context_dependencies | manifestId/sourceRef/version；支持删除/撤权定位 |

Memory kind 为 WorkingFact、OpenQuestion、Conflict、DecisionSummary、ProgressSummary；状态仅使用 Artifact 可用性和 validUntil，不增设平行知识生命周期。

| Port / Command | 输入 | 输出 / 错误 |
|---|---|---|
| BuildContext | createdInvocationRef 或 jobRef、taskSpecRef、AuthorizedContextRef、sourceSelectors、tokenBudget | manifestRef、omittedRefs、contextGap?；CONTEXT_REQUIRED_SOURCE_MISSING |
| ProposeMemoryUpdate | missionRef、baseVersion、kind、sourceRefs、contentRef、ttl | 验证后 memoryItemRef；MEMORY_SOURCE_INVALID |
| ReadMemory | missionRef、kind、asOf、limit | 已裁剪可用条目与水位 |
| InvalidateSource（Internal） | sourceRef、reason、revocationEventRef | 依赖失效计数、停止通知 |
| CompactMemory（Internal） | itemRefs、summaryCandidateRef、verificationRef | 新摘要及原来源 Ref；不改旧条目 |

BuildContext 使用 Tool/查询 Port 回源，不能直接跨 Domain 表读取。对保留不足导致的历史不可重建返回明确 Gap。

## 3. 组装算法

顺序固定：硬约束/输出 Schema → Task Goal/输入版本 → 必需正式事实 → 已验证 Knowledge → 必需 Evidence → 临时 Memory/候选。先以 Selector 找候选 Ref，再向权威 Owner 批量查询并重验 Tenant、Purpose、删除、版本和时效。

每个 Section 计算 Token；先移除非必需低优先级材料，保留 omittedRefs/reason。硬约束超过预算直接 CONTEXT_BUDGET_INSUFFICIENT。压缩只处理允许摘要的区域，数字、否定、日期、风险条件和来源须通过验证；候选摘要不能提升原材料信任等级。

检索索引只生成候选，不决定读权；pgvector 按需开启，初期以结构化 Ref/关键词查找。外部文档指令包装为数据区，不能进入系统指令或 Tool Binding。

## 4. 主流程与恢复

T1 Memory Owner 提交经验证条目及 Outbox → Run 准备 Created Invocation/TaskSpec/受限身份 → Builder 批量回源并冻结版本 → 生成 Manifest Artifact → T2 记录 Context/依赖 → Run 完成合同并启动 Invocation。

在 T2 后来源撤权：Data Lifecycle 提交 sourceEpoch/墓碑 → Context 依赖标失效 → 当前 Invocation 在安全点取消 → 新 Context 按当前可见事实重建。旧 Manifest 仅按合法保留用途存档，普通读和模型再用均拒绝。

每轮模型输入另外保存 callInputManifest，引用初始 Manifest 与新增 Tool Observation/消息 Ref，并冻结实际输入摘要。Model Gateway 在每次出口前回验所有输入依赖的当前用途/epoch；不能只检查初始 Task 授权。异步失效通知用于停止和清理，不能作为唯一读权判断。已发给 Provider 的数据按在途处理，撤权不承诺召回已发送内容。

来源查询部分失败时，required 项使构建失败；可选项明确 omission。调用重试不增加 Memory 副本，ProposeMemoryUpdate 幂等键绑定 sourceRefs/kind/候选摘要。

## 5. 安全、保留与资源

跨 Mission 的客户经验必须由 Domain Memory Port 返回；Core 不自动从其他 Mission Transcript 检索。域内知识也需验证适用 Scope，过期/冲突结论显示其限制。Memory 更新只接受证据、当前 Goal 和合法 TTL，不能写 Grant、预算或已批准品牌事实。

配置 context.defaultInputTokens 继承 NFR；context.maxSections=100（1–256，Run 创建时固定）；memory.workingTtlHours=72（1–720）；Mission 结束后生成经验证摘要，原工作资料按数据策略清理。默认保留不是覆盖客户更严格删除要求的理由。

Context 组装不含模型摘要时内部 p95 100 ms 预算，摘要作为独立 Model Job；回源查询限并发 8。记录 section_count、omission_count、context_gap、invalidated_context_age 和 token_utilization；不记录正文。`abh doctor context --id` 显示缺失/失效来源链。

## 6. 验收与抽象边界

测试包括：索引返回别的租户 Ref；来源已删但缓存命中；摘要丢否定/货币；硬约束超 Token；候选被错误提升为事实；同一纠错重复写；运行期间 Purpose 撤回；部分可选源失败；恢复时丢 Transcript。断言模型实际收到的 Context 与每轮 Manifest 一致，撤权先于出口检查的来源不得再次发送。

撤权测试分别控制“撤权先提交”和“出口先通过”顺序：前者拒绝新发送，后者标记在途并禁止下一轮复用。逐轮工具结果也必须出现在输入依赖中。

本模块合并组装和 Mission Memory，因为二者共享上下文血缘与失效协议；领域长期记忆/Knowledge 保持独立 Owner。向量数据库、图数据库和自动全历史检索不成为初始依赖。

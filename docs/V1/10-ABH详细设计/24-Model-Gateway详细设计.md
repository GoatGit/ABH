# Model Gateway 与 Structured Model Job 详细设计

> 版本：1.1 · Owner：Model Runtime Maintainer · ModelInvocationPort / ModelAdapterPort（Preview）

## 1. 两条调用路径

Pi Adapter 的 streamFn 与固定无工具 Structured Model Job 都通过 ModelInvocationPort 进入 Gateway。Job 只是有界输入/输出 Schema、预算和调度，不意味着模型确定性。分类、抽取、摘要无需包一层 Pi Loop。

业务代码不导入供应商 SDK；Model Adapter 是唯一供应商传输实现。图像/视频专用生成可由 Domain Connector 注册为 Tool，但同样受用途、费用和 Artifact 管理。

## 2. 调用契约与数据

`InvokeModel`：callId、invocationRef 或 jobRef、routeExactRef、inputManifestRef、outputSchemaRef?、generationParameters、maxInput/outputTokens、maxCost、AuthorizedContextRef、AbortSignal。调用身份由宿主签发，不能把任意 Prompt 字符串和客户自报允许模型直接透传。

`ModelResponse`：contentArtifactRef、finishReason、modelExactRef、usage{input/outputTokens,billedAmount?,estimated}、providerRequestRef、safetyFlags、sourceDigest；流式事件包含 sequence/kind/delta，最终响应需持久保存。

| 数据 | 字段 |
|---|---|
| model.routes | id/version、allowedModels、purpose/dataClass/region、providerRetention/trainingTerms、cost/latencyPolicy、fallbackRefs、digest |
| model.calls | callId 唯一、callerRef、routeRef、selectedModelRef、callInputManifestRef、inputDigest、requestDigest、reservationRefs、requestRef、statusRef、usageRef、attemptBudget |
| model.usage_observations | callId/sourceVersion 唯一；estimated/confirmed、cost、currency、sourceRef |
| model.job_results | jobRef/version、input/outputSchemaRefs、resultArtifactRef、verificationRef |

Route 由 Capability Release 固定；供应商候选与 fallback 顺序在版本内声明，不在执行中让 Agent 自选未评测模型。Job 的持久调度状态复用 Run Task 或 Durable Job，Gateway 不建第二队列。

## 3. 路由与主时序

1. 校验调用身份、Target、Schema 和当前用途/地域/保留约束。
2. 从固定 Route 中筛除不合规/不可用模型，按声明的质量/成本/延迟优先级选择。
3. 使用受控 Token 估算和价格版本预留最大费用；无可靠上界时拒绝调用或使用明确硬上限的 Provider。
4. Secret Broker 提供当前 Model Adapter 的最小访问许可；Adapter 发起请求。
5. 流结束后保存原始必要响应 Artifact、Usage 与调用结果；验证输出 Schema，交调用 Owner。
6. Ledger 结算实际费用；缺最终账单时保留估算来源与待核实标记。

每次调用的 Manifest 引用初始 Context 与新增消息/Tool 结果；Gateway 校验实际序列化输入摘要及全部来源，不能只登记第一轮 Prompt。generationParameters 与 Token/费用上限取请求、固定 Task/Job、Route、当前 Policy 的交集，调用方不能用参数覆盖固定包络。

短事务锁控制 fence/必要 Ledger，保存 Prepared Call、预留与当前授权；派发前在同一出站记录上 CAS InFlight，固定至多 5 秒的出口资格与 Worker fencing。Provider 请求在事务外，出口再次检查调用/Scope/数据用途；Context 或 Snapshot 到期须重新从长期合法 Authority 签发，绝不直接延期旧快照。并发同 callId 仅一个工作者可进入出站；requestDigest 不同返回冲突，相同则返回既有结果或 trackingRef。

不将 PII/敏感正文写日志；Provider data residency 不只看 endpoint 域名，需登记训练/保留/子处理条件。合规 Route 为空时返回 MODEL_ROUTE_UNAVAILABLE，不静默发送到其他地区/供应商。

## 4. 失败与费用未知

首字节前失败且证明 Provider 未受理，可在同一 Route 内按剩余预算重试。首字节后断流、Provider timeout 或无回执时，可能已计费；保留费用预留/估算并查询 usage，返回 MODEL_OUTCOME_INCOMPLETE。业务产物不得标记完整。

新一次计费调用使用新 callId，保留 retryOfCallRef；同 callId 重试 API 只回读已持久结果，不重复调用 Provider。供应商自身自动重试在 Adapter 中关闭，或明确纳入唯一 Gateway retry budget。

调用输出的终态与成本核实独立：完整输出但账单未成熟可 Completed，保留未结费用；无完整输出则 Incomplete/Failed 并按真实证据结算。Worker 崩溃或出口响应丢失后不把 InFlight 自动重置 Prepared；先核实费用/既有响应，新调用须新预留且计入同一 Task/Run 累计预算。Model Gateway 作为实际计费 Owner 负责费用，外层 Tool/评测只能引用，不能重复扣费。

fallback 只能选同一冻结 Route 中已评测且满足相同约束的模型；中途发生模型切换要记录新调用与模型 Ref，不能拼接为仿佛一个模型完整输出。

## 5. 安全、配置与性能

model.firstTokenTimeoutMs=30000、model.totalTimeoutMs=120000（均受 Task 更短 Deadline 约束）；model.maxParallelPerOrganization=4；model.responseMaxBytes=1 MiB；model.retryMax=1（仅证明安全的调用）。价格/费用上限无静默默认，缺价格版本拒绝付费请求。

离线 Fake Adapter 声明固定的零价格版本，仍记录 Token/调用配额与零成本 Usage，不能跳过整个 Ledger 合同；它在生产 Profile 无法注册。真实本地模型也须明确资源/计价策略，而非用缺价格隐式视为免费。

Model Gateway 本地路由/预留开销 p95 30 ms；TTFT、生成速度和总时长作为模型专属指标，不混入普通 API SLO。公平调度优先交互和控制解释，评测使用独立配额避免饿死生产。

`abh doctor model --route` 检查协议、模型名/版本、用途、地域、价格、Secret 与 allowlist；默认无测试内容出站，显式诊断调用使用人工批准的无敏感 Fixture。

## 6. CTK 与演进

测试：所有模型路径均经过同一 Gateway；不合规 fallback 拒绝；route 固定；价格缺失；输出 Schema 错误；断流后已计费；Token 超限；同 callId 重发；撤权；代理/自签 CA；Provider 升级改变 finishReason。M0 使用 Fake Model Adapter 和真实 Pi Loop 跑公开 Fixture，质量评测使用明确许可的数据与模型配置。

Model Adapter 版本、数据条款、价格和兼容性分别记录，升级经 CTK 与离线回归；不为批量摘要引入第二 Harness 或独立模型平台。

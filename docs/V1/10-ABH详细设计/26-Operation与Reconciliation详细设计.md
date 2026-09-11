# Operation、Reconciliation 与 Connector 详细设计

> 版本：1.2 · Owner：Execution / Connector Maintainers
>
> 状态规范：[Operation](02-状态与执行契约规范.md#7-operationattempt-与对账)；派发竞争：[授权链](03-责任授权与执行链规范.md#4-dispatch-边界与撤权竞争)。

## 1. 层级与单一写入

Operation Controller 拥有不可变 Plan、Operation、Attempt 与 Receipt。Connector 只提供能力描述、请求编码、外部传输、查询与观察归一化。Reconciliation Service 拥有比较报告，由 Controller 消费报告提交 Operation 状态。

每个 Operation 对应单一 Connection/账户与一个可独立判断的原生变更。跨平台与多个资源拆节点。不可拆分的 Provider 原子操作允许成为一个节点，但必须有单一完成判据；批量 API 若每项可独立失败，V1 逐项调用，暂不做批量合并优化。

## 2. 数据与字段

| 记录 | 字段 / 约束 |
|---|---|
| execution.operation_plans | actionRef、planVersion、pinSetRef/digest、nodes/edgesArtifactRef、compiler/connectorRefs、scopeProofRef、digest；Plan 不可变；actionRef 唯一登记一份 Plan |
| execution.operations | planRef/nodeKey 唯一；connectionRef、accountRef、resourceKey、operationType、payloadRef/digest、expectedExternalVersion?、providerIdempotencyKey、lifecycle/outcome、version |
| execution.dispatch_permits | operationRef/ordinal、snapshotRef、fencingToken、workerRef、issuedAt/expiresAt、payloadDigest；仅单 Attempt |
| execution.attempts | operationRef/ordinal 唯一；permitRef、providerKey、sentAt、transportStatus、providerRequestRef |
| execution.receipts | operationRef/receiptKey 唯一；externalId、sourceVersion、observedAt、rawArtifactRef、normalizedObservationRef |
| execution.reconciliations | operationRef、inputObservationRefs、comparisonRuleRef、verdict、reason、nextObservationAt、digest |

并发锁键由 Connection + 外部账户 + 注册 resourceKey 构成；名称唯一规则与 Creation Marker 都来自 Connector Capability。原生幂等 key 稳定派生于 Operation 身份，Attempt ordinal 不进入该 key。

## 3. Connector Capability 与 Port

Capability 必填 provider/version、operationTypes、authScope、rateLimitPolicy、idempotencyMode、markerRule?、readAfterWriteConsistency、queryMethods、finalityRule、reconciliationWindows、compensationSupport、rawRetentionPolicy。

| Port / Command | 输入 | 输出 |
|---|---|---|
| CompileOperationPlan | validatedActionRef、pinSetRef/digest、targetVersions、受限规划 Context；compiler/connectorExactRefs 从已固定集合取得 | 无副作用 planRef、scopeProof、dependencies；同 Action 同输入查回原 Plan，异摘要拒绝；不能扩大原意图 |
| Dispatch（Worker Internal） | operationRef、permitRef、credentialsHandle、AbortSignal | Attempt Observation/Receipt；不决定业务成功 |
| QueryOperation | operationRef、externalId?/marker、watermark、queryAuthorityRef | Observation 集及完整性/一致性水位 |
| NormalizeReceipt | rawArtifactRef、capabilityRef | schema-valid Observation；RAW_RECEIPT_UNSUPPORTED |
| Reconcile | operationRef、observationRefs、ruleRef | ConfirmedSuccess/ConfirmedNoEffect/Pending/Ambiguous/Conflicting |
| RecordReconciliation | reportRef、expectedOperationVersion | 迁移/再查/Exception；OPERATION_FACT_CONFLICT |

查回返回零匹配不自动证明未发生，必须满足 Provider 的可见性窗口、查询覆盖与唯一规则。多匹配必须隔离并产生 Duplicate Exception，不任选一个绑定。

## 4. 正常执行

Action Validated → Release Owner 固定/回读 pinSet → 使用原精确能力编译并证明 Plan 范围 → 保存 Plan/Pending Operation/Outbox → Action T1 针对该 pinSet/planDigest 授权和预留 → 依赖满足 → Dispatch 事务锁控制 fence/资源键、授权重验、Permit/Attempt，并由 Action Engine 提交首次 Executing → 提交 → 受信 Worker 出口调用 → 保存原始回执 → Reconciliation 判定 → Controller CAS 提交结果 → Action 汇总。

创建层级资源时，子节点只使用已确认父 externalId。父节点未知阻断依赖。预注册完成策略可允许独立分支继续，但不能跨过共享预算或授权前置条件。

节点预条件区分外部基线版本与经声明依赖的前序结果。前序已确认变更通过 Receipt/version 绑定解析后续输入，不能把自己的合法更新误判成第三方版本冲突；未声明的外部变化仍拒绝。解析后的 payloadDigest 在 Permit 中固定，受 Plan 模板和原影响上界限制。

## 5. 超时与崩溃恢复

~~~text
Provider may have accepted -> transport timeout / Worker crash
-> operation Observing + outcome Unknown
-> retain resource key and resource responsibility
-> Query by native operation ID / stable marker / external unique key
-> exactly one verified match: bind and reconcile
-> no match with conclusive no-effect evidence: retry eligibility check
-> ambiguous / multiple / query unavailable: Exception, no redispatch
~~~

外部 HTTP 不能接受 PostgreSQL fencing 时，旧 Worker 仍可能发出请求；新 Worker 不因 lease 失效即重发。持久 Permit 是“可能在途”证据，只读查回先行。Provider 无幂等、唯一性或可靠查回时，高影响创建不启用自动执行。

最大观察窗达到只发 Exception，保留 Unknown 与预算责任；后续低频查询需独立 Service Authority。确定无效果且允许重试才新 Attempt，仍复用 Provider key。SDK 自动重试关闭，Owner 累计次数/截止时间。

迟到 Receipt 不要求已失效的 Worker 仍持有状态写权：受认证观察入口校验原 Attempt/Connection/来源并幂等追加证据，由当前 Controller 重验后迁移。未知/冲突证据不丢弃，也不由旧 Worker 直接改 Outcome。已 Closed 的终态不回退；新证据推翻既有结果时追加纠正报告和 Exception，冻结相关 Scope，并让 Domain Result 新版本引用纠正证据。

## 6. 补偿与版本退出

补偿由 Domain 提案为新 Action，引用具体 Operation。Operation Controller 不直接在 catch 中执行删除、退款或暂停。紧急止损使用预配置独立安全 Action/Service Authority，同样保留 Permit、Receipt 与 Audit。

safetyStop 与未知普通操作并存的唯一例外遵循授权链第 4 节，Capability 必须声明可定位目标、单调降险条件和确认规则；它不取消原 Unknown 的查询义务。父 Action 进入 Reconciling 后禁止该父计划的重试派发，止损始终另建 Action。

Connector 撤回后禁新 Dispatch；旧版本如仅能安全查询则保留只读实现至未决项结束。若版本本身有漏洞且不能加载，保持冻结并使用通过 CTK 的兼容查询实现；不为完成对账继续运行已知危险代码。

## 7. 配置、指标与验收

operation.maxAttempts 默认 1，只有 Capability 明确安全时可配置至初次后 3 次；reconcile.initialDelaySeconds=5、maxDelaySeconds=300；最终窗口必须按 Connector 具体登记。配置随 Capability 版本固定，不能由 Agent 参数放宽。内部首次查回调度 p95 ≤ 5 s，外部完成时限单独报告。

`abh doctor operation --id` 展示原意图/许可、最后外部水位、是否可安全重试及剩余责任。指标 permit_age、unknown_age、duplicate_match、query_gap、receipt_lag、connector_429；原始回执保存在用途受控 Artifact，不进普通日志。

CTK：Provider 已成功但响应丢失；零匹配因最终一致延迟；多匹配；同 key 重发；旧 Worker 迟发；部分成功；层级父未决；撤权；暂停尾差；Provider 版本漂移；超过观察窗。通过实际 Fake Provider 状态断言，而非只断言本地 status。

必须包含 Unknown 占位时安全暂停、旧在途请求覆盖暂停后的再次确认、失租约后的真实 Receipt、零派发重授权、父子资源自己的版本递进和取消后禁止重试。

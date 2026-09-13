# Internal execution Owners

Action preparation, Control snapshots, Dispatch Permits and transport exits, receipts,
reconciliation, result settlement and waiting are internal components. The public Core
entry point exports only its version. Installation, Domain admission and source-governance
callbacks must be supplied by trusted composition; integration fixtures do not constitute
production admission.

## Independent read-only queries

`QueryExitOwner` requires an existing dispatched Operation, current WorkLease, a separate
ExecutionAuthority, current Service/Grant/fences, active Purpose and Connection, an exact
Connector and an installed query policy. Action bindings must match the parent intent;
Scope issuance uses `ScopeAuthorityOwner` for the current same-organization profile with explicitly covered purposes. `assertScopeRuntimePolicy` rechecks persisted issuance evidence, actual current sources and the current Mandatory policy. Nonempty stop predicates still require a registered evaluator and currently fail closed. Original dispatch Grant revocation does not revoke a separately
authorized query. Organization stop, query Grant/Authority, Purpose, Connection, envelope
or identity revocation still prevents a new exit.

The policy defines a positive cumulative resource cost, timeout (at most 30 seconds), and
minimum interval between queries for the same Operation. ResourceEnvelope resolves the
cost to actual ledgers. Reservation, consumption, immutable QueryExit, Audit and Outbox
commit together before transport. Cost means **committed query exits**, not successful
HTTP responses: process loss after commit consumes the slot even if no request was sent.
This prevents crash loops from bypassing the budget. It is not provider monetary billing.

`queryOnce` supplies only persisted operation/connection/account/Connector/key facts to an
installed read-only `QueryTransport`. It has no dispatch method and accepts no caller URL,
body, secret or remote identifier. Implementations must disable SDK retries and honor the
abort signal. The wrapper also bounds waiting if an implementation ignores cancellation;
a late result cannot create an observation or initiate another request. Each new request
requires another authorized, rate-limited, budgeted command. Command replay rechecks current
admission and cannot invoke the Connector twice.

`QueryCaptureOwner` verifies the process-local observation origin and immutable database
exit, then uses a fresh independent observation-ingress permission. Query-authority expiry
or revocation does not discard already obtained evidence. Raw bytes, normalized Receipt,
QueryCapture, Audit and Outbox commit atomically. Unsupported parsing preserves raw bytes;
transport failure records no invented response. One capture per exit survives command and
consumer replay. The installed pure parser owns query coverage, provider watermark and
no-effect evidence; zero matches alone never prove no effect.

`queryAndCapture` obtains a fresh capture context after transport. If persistence fails,
its opaque `PendingQueryCapture` handle permits only capture retry; it never resends. The
handle is process-local. After process loss, durable exit/cost remain, and recovery requires
another independently admitted query. Raw evidence currently uses the existing inline
profile (48,000 bytes); ObjectStore staging for larger receipts remains to be implemented.

Queries and captures do not mutate Operation outcome, Attempt history, resource fences or
original execution reservations. Existing Receipt/Reconciliation and current Controller
admission still decide finality; OperationReconciliationWaitOwner observes that committed
finality through the Wait Port.

## 租户内恢复循环

`runRecoveryWorker` 接收数据库、当前 Service Context 提供者、独立 recovery Grant、workerId 和 AbortSignal。循环每页至多扫描 100 个 Dispatching/Observing 引用，按 UUID 游标推进，完整扫描后从头开始。逐项重新取得 Context，组织、工作区和主体必须保持一致；宿主负责可信租户配置与 Context 的有界签发。

`recoverPendingOperation` 先以数据库时钟检查 Permit 过期，再以 30 秒 WorkLease 认领，并通过 `recoverOperation` 重新验证当前 Grant、资源栅栏及租约后提交 Unknown。它只做短事务，无网络调用；租约竞争和版本变化等待后续扫描，权限/完整性故障抛给宿主。Observing 由独立查询和对账链继续处理。退出时传播 AbortSignal，未完成工作依靠数据库事实与租约到期恢复。

该组件尚未接入生产进程托管、全局租户发现、持久扫描水位或 Observing 调度；它不代表完整恢复服务已验收。


## 终态矛盾报告与资源冻结

ReconciliationOwner.compare 对 Closed Operation 仍从实际完整 Receipt 向量、固定 Connector/rule 与当前独立 admission 生成不可变报告。比较前取得同一 connection/account/resourceKey 的资源锁，再锁父 Action；Conflicting、Ambiguous 或与既有终态相反的确定结论，会在同一事务将报告 Ref 写入 ResourceFenceRecord.blockedByReportRef，并追加 abh.resource-fence.blocked Audit/Outbox。原 Operation 版本/Outcome/reconciliationRef 不回退，当前未决 Operation 占位和 fencingToken 均保留。

T2 与一次性出站授权同步检查冻结标记，ResourceFenceOwner.occupy 也拒绝冻结资源。冻结只针对实际资源键，不停整个组织。已经派发的任务仍可使用独立观察/查询权限对账；普通 clear 仅清除未决占位，保留冻结标记，不允许后续成功报告自动解冻。事务回滚同时撤销矛盾报告和冻结，Command 重放不重复冻结。

当前冻结依据是技术对账报告，可通过 Human Exception 入口创建绑定的 Responsibility Request；尚未自动路由，也未实现 Correction/Domain Result 新版本或治理解冻 Command。报告比较可由安装的终态对账 Worker 周期扫描触发；Receipt 写事务不直接执行比较。本节不是完整 Exception/Correction 验收。


## 终态回执持续比较

runTerminalReconciliationWorker 使用新鲜 Service/abh.operation.reconcile Context 扫描 Closed Operation，每页最多 100 项。只有存在回执且没有当前 Operation 版本的报告完整覆盖实际回执向量时才入选；完成一轮后重置 UUID 游标，捕获后来提交的回执。默认 500 ms，32 号迁移为终态扫描和按 Operation 版本查报告建立索引。

compareClosedOperation 独立验证当前 Grant、安装的 fence/admission、固定 Connector/rule 和 Artifact 权限，使用 Operation 版本与完整回执向量摘要作为 Command 幂等键。取得资源/父 Action 锁后回执变化视为版本竞争，下轮重试；完整性及权限错误传给宿主。Command 重放仍检查当前 Grant，已撤销授权不能查询既有结果。规则解析函数由安装宿主提供，不动态下载代码。

租户宿主通过 terminalReconciliation 可选配置安装该循环，身份刷新有期限并响应停机信号，租户/工作区/主体不能漂移。Worker 不查询 Provider、不创建 Attempt、不应用对账结果或释放预算；终态矛盾走既有资源冻结，Human Exception 可由独立入口绑定责任请求，自动路由与治理处置仍待实现。扫描是发现机制，不是连续保留水位或删除许可。

## 公开 Action 提案装配

`proposeAction` 将现有 ActionOwner 提案接入当前 Grant 和 CommandReceipt。HTTP `actionProposal` 必须安装 Grant 解析、完整来源 fence、当前准入、可信定义以及 Artifact/领域影响校验；这些策略没有默认放行实现。定义提供执行 Service、完成策略、影响约束和期限，HTTP Payload 不能覆盖它们。admit 必须验证提案人、目标及来源版本、当前证据可见性/策略，包含回执重放；fenceRefs 必须覆盖相关来源和定义的当前治理记录。

摘要包含组织 ID 与规范提案 Payload，在异步工作前复制输入。治理回调接收副本，不能修改本次命令的已摘要数据。当前独立 `abh.actions.propose` Grant 与实际持久 Artifact 读取覆盖首次调用及重放；组织不匹配直接拒绝。新建时解析服务端定义，Action/不可变 Intent/CommandReceipt/Audit/Outbox 同事务；失败可保留原键重新提交。

202 响应返回原 commandId、v1 objectRef/trackingRef 和 Location；Action 后续升级、取消不改写原受理响应。重放仍查当前准入和 Artifact/Action 可见性，不重新解析定义、不产生新 Intent 或 Authority。提案受理本身不产生 Reservation、Operation 或派发资格。

真实 HTTP/Identity/Grant/PG/客户端测试在 `test/actions.test.ts` 中，覆盖并发、异参、撤权、输入隐藏、领域拒绝、Intent 写入失败回滚、回调副本隔离与后续取消后的稳定重放。Action 查询/取消/请求授权 HTTP、生产策略和 StoreArtifact 上传路径仍待装配。

## Action Strong 单对象查询

`getActionQuery` 通过当前独立 `abh.actions.read` Grant 与必需 ActionViewAdmission 读取公开 ActionView。来源/策略 fence 全量取得后锁定父 Action，Operation 变更使用同一父锁；DTO 只包含 actionRef、类型、position、授权摘要、可见 Operation position、未决引用和可用操作。Action 内部 proposer、Service、payload、Provider 幂等键、Grant/资源明细不直接返回。

对象不可见或当前读权无效统一 RESOURCE_NOT_FOUND。canReadRelated 独立裁剪 Authority/Snapshot、Operation、Responsibility Request、资源占位等关联信息。Snapshot 读取验证实际摘要及 Action/Payload/Plan/PinSet/Authority 绑定，只展示持久引用和期限，不表示委托现在仍有效。当前 Open/Unresolved Request 从 Human Owner 读取；恰好一个可见、相同提案摘要的 Authorization Request 才设置单值 requestRef，所有可见未决责任进入 unresolvedRefs。

Unknown Operation 和与其相关的当前资源占位/技术冻结进入未决引用；技术冻结根据实际 ResourceFence/报告关系读取，不依赖可能滞后的 Wait 通知，也不把责任请求关闭当作技术解冻。无权关联信息被省略。ResourceFence 查询额外校验数据库行 ID 与正文引用一致性。

availableActions 只考虑当前生命周期允许的 cancel/request-authorization，并分别核验命令 Grant 和 canAct 前置条件。按钮不授予命令权限，后续命令仍重新验证。数据过量不静默截断为完整视图。

QueryMeta.asOf 来自数据库，watermark 为 `action-source/sha256:...`，绑定当前调用者范围和可见 DTO；它是对象来源指纹，不是连续事件水位、订阅游标或 GC 权限。当前仅 Default/Strong，Projection 明确 SCHEMA_UNSUPPORTED。Action 列表分页及跨页一致性仍未实现。

## Action 列表分页

`listActionQuery` 支持 missionId/type/lifecycle/outcome，默认 HTTP 每页 25、最多 100，按 createdAt/id 倒序扫描。数据库时间保留六位微秒，经文本参数转换回 timestamptz，避免驱动 Date 序列化损失微秒造成漏页。同时间以 UUID 倒序确定稳定位置。

每页最多扫描 limit 行，权限过滤行仍占扫描位置，空页也可能继续；先声明整页来源 fence 并排序锁定父 Action，再复用单对象读权/关联信息/按钮校验。列表准入和读 Grant 覆盖空结果。锁定后再次核对筛选条件，避免返回并发变更后不再符合条件的对象。每页独立当前读取，不承诺跨页快照，筛选字段变化的对象可能在后续页出现或不再出现。

HTTP `actionList` 必须安装列表准入、可见性、候选 Grant 和 ActionCursorCodec。`ac1` 游标用明确 32 字节密钥 AES-256-GCM 加密时间/UUID，绑定当前组织、acting organization、Workspace、actor、用途、session/scope epoch 及全部筛选；页大小可变，筛选不变。默认 15 分钟、上限 1 小时；多实例/重启共享同一 Secret 密钥，换钥使旧令牌失效。令牌不授予权限，不暴露被过滤对象位置。

## Run 列表分页

`abh.runs.list` 使用同一 Strong 读取边界支持 `missionStatus`、`missionId`、`limit` 和 opaque cursor，按 `(updated_at,id)` 倒序返回完整 Run 页。HTTP `mission.runList` 必须显式提供 RunCursorCodec 和当前 `abh.runs.read` Grant resolver；事务先锁定身份、组织、Grant fence，再执行租户、Workspace、用途、删除、筛选和 keyset 过滤。`rc1` 游标绑定同一身份/用途/epoch 与全部筛选，换筛选、换身份、篡改或过期都失败关闭。令牌只是续读位置，不是授权或跨页快照承诺。

元数据为页级来源指纹，不是连续水位。Projection/SSE、跨页快照和生产安装仍未完成。

## 统一 Action 取消

`cancelAction` 以独立当前 abh.actions.cancel Grant 和必需 ActionCancellationChecks 接入三条已有 Owner 路径。Proposed/Validated 取消准备步骤；Authorized 通过 ActionCleanupOwner 证明零 Permit/零 Attempt 后原子释放有限预留、取消子操作并追加清理凭证；Executing 或已有取消请求的 Reconciling 停止剩余步骤，保留已派发子状态、资源占位和对账责任。

取消不要求仍有效的执行 Grant，但必须有当前取消权限、身份和来源/政策准入。Authorized 分支在聚合锁之前统一声明 Snapshot epoch fences、取消 Grant 和安装来源 fences，再按资源/账本/父 Action 顺序锁定。Snapshot/计划和零派发证明沿用实际 Owner，不允许通过 HTTP 直接选清理模式。

回执、状态变化、资源清理和 Audit/Outbox 同事务。重放重新验证当前取消准入和对象可见性，返回持久回执原 commandId 和当时的结果版本；新键旧版本拒绝，同键异参拒绝。202 仅表示受理，已派发取消不证明外部效果消失。取消期限结束后仍须查回原命令/对象，不盲重发。

真实测试覆盖 HTTP/client 准备取消、并发/重放/版本/撤权；已派发 Provider 响应丢失后保留责任和预算；已授权清理中途失败整组回滚、执行撤权后的独立取消及与 Permit 竞争。生产来源/政策安装、复杂持续义务清理和请求授权 HTTP 仍待完成。

## 首次 T1 执行身份

ActionAuthorizationResolver.authorizeOneShot 与刷新路径一致，要求 action.execute 用途、Service 主体，且当前 actor 精确匹配受信定义绑定的 executionPrincipalRef。取得完整执行来源 fences 后重新读取当前身份，验证凭据 epoch、Active 成员关系、当前 Scope epoch 与 Principal 精确版本，再运行审批证明、策略评估和预算预留。Human 提案人不因持有有效 Action 委托而成为执行 Service。

真实 PG 测试覆盖 Human、错误 Service、旧凭据 epoch、撤销成员关系和错误 Scope epoch，失败时 Snapshot/PolicyEvaluation/Reservation 数量不变，Action 保持 Validated、子操作无 Attempt。现有合法 Service T1/刷新/Permit 测试继续通过。公开 request-authorization 仍需持久业务推进装配，不能直接拿 Human HTTP 上下文调用执行授权 Resolver。

## 已准备 Action 的 Service T1 事务入口

`authorizePreparedAction` 组合当前执行来源/Service 身份、CommandReceipt 与实际 ActionAuthorizationResolver/ActionOwner。输入为已有 Action 精确版本、RequestAuthorizationPayload 与服务端命令身份；摘要包含 actionRef/payload，输入在异步处理前复制。仅 action.execute 下的配置 Service 可调用，必须已有 Validated/PinSet/Plan、完整批准及合法 Action Authority。此入口不是 Human HTTP 请求授权，也不会自动补建计划或责任请求。

候选 Authority 由 Owner 从当前目录独立选择，authorityRefs 仅作单一匹配断言；多引用拒绝。首次和回执重放都锁定完整当前来源 fence、检查 Service/成员/epoch 和安装准入。首次调用实际 T1，将 Snapshot、策略评估、Reservation、Action CAS 和 CommandReceipt 一起提交。安装回调接收副本，不能修改本次已摘要输入或 Resolver 的内部事实。

重放返回持久回执原 commandId 和受理结果版本，不重复预留、不刷新旧 Snapshot。新会话/新数据库连接仍查回同一回执；当前来源撤销或安装准入拒绝时重放也拒绝。返回历史受理不表示 Snapshot 仍可执行，T2 继续当前验权；已不再符合来源读取状态的终态 Action 不通过此入口复活。

真实测试覆盖并发单次 T1、Snapshot INSERT 故障导致策略/预留/状态/回执回滚、重连重放、Human 拒绝、Authority 断言不匹配、当前准入及源 Grant 撤销。Human 请求到 Service 的持久推进、准备/责任分支与公开 RequestAuthorization HTTP 仍待实现。

## 内部领域验证事务入口

`validateAction` 以 ValidateActionPayload 和独立 `abh.actions.validate` 当前 Grant 推进 Proposed→Validated。该内部权限登记为 action.prepare 用途，不开放公开 HTTP。来源/证据 fences、当前准入和实际 Artifact 内容摘要覆盖首次与回执重放；证据 Ref 本身不构成验证通过，必需领域回调验证正式证据和冻结输入。

输入及回调数据均复制。领域拒绝保持 Proposed，无成功回执；重试复用原键。首次成功时 Action CAS/Audit/Outbox/CommandReceipt 同事务；重放返回原 commandId/结果版本，不再次调用领域 Validator，不把后续取消/执行状态改回 Validated。当前来源或 Grant 撤销后重放拒绝。生产 Validator 证据实现、计划准备与完整请求授权推进仍需装配。

## 独立准备 Grant 固定版本

`pinAction` 是内部同组织准备入口，要求实际当前 abh.actions.pin Grant，不能拿不存在的执行委托引用作准备证明。ResolveAndPinRequest 的 preparationAuthorityRefs 现允许明确 abh.grant 引用，保留原 AuthorityRef 合同以支持现有内部调用；Schema 接受引用不等于授权。pinAction 仅接受 Grant，由当前身份/用途/Scope 和安装的来源/能力读取准入验证。

已 Validated、尚无执行 Authority 的 Action 可固定全部必需槽位。ActionOwner 与 ReleaseOwner 原子保存 PinSet、Action 绑定、事件和命令回执；Action CAS 失败时 PinSet 一并回滚。重放重新检查当前准备 Grant、Artifact 和已固定 Assignment/Release 的可用性，返回原 pinSetRef/commandId，不重新选择版本，不产生执行授权、计划或预算预留。

生产能力读取策略、后续 Compiler/计划注册准入及完整请求授权持久推进仍待完成。

## 计划注册事务入口

`registerOperationPlan` 接受既有 RegisterOperationPlanPayload 与受信编译产物，核对实际计划摘要、Action、PinSet、scopeProof 引用和命令摘要。独立当前 abh.actions.register-plan/action.prepare Grant、来源/能力读取/范围证明准入、当前 PinSet/Assignment/Release 和原始/每节点 Artifact 读取覆盖首次及重放。

实际 ActionOwner 再检查不可变意图上界、固定 Compiler/Connector、节点资源累计、期限和领域 Plan proof，OperationOwner 创建完整计划与子操作。Action 绑定/Plan/Operations/回执/Audit/Outbox 同事务，Action 更新失败全部回滚。回调使用副本；重放不再次编译、不改子操作键，不新增 Operation，重连仍返回原 commandId/planRef。计划注册不创建 Snapshot、预算或派发权限。

此入口消费编译结果，不自带生产 Compiler 或公开 HTTP。Compiler 安装/调用、责任分支和完整请求授权持久推进仍待实施。

## 固定 Compiler 调用宿主

`ActionCompilerHost` 显式安装精确 Compiler CapabilityRef 与可信只读函数，拒绝重复安装；调用要求该精确版本已在输入 PinSet 中固定。输入为已验证 Action、不可变 Intent 和 PinSet，核对实际摘要、租户、主体、必需槽位、payload 和完成策略绑定。编译器收到副本与有界 deadline/signal，不收到数据库事务、身份凭据或派发接口。它是受信代码调用，不是恶意代码沙箱。

默认沿用最多 30 秒 boundedCallback，取消/期限结束即停止等待，迟到结果不注册。返回 OperationPlan 必须绑定原 Action 版本、PinSet/输入摘要、选中 Compiler、固定 Connector 和完成策略，并具有有效计划摘要；宿主复制输出。产物仍是候选，必须进入 registerOperationPlan 的当前 Grant、范围/资源与 Artifact 验证后才能持久化，不授予执行权限。

真实准备 Fixture 测试覆盖精确版本选择、输入输出副本、跨 PinSet 输出拒绝、取消与不合作回调期限；计划注册测试使用宿主产物进入实际 Owner 事务。生产 Compiler 实现、已授权输入获取/安装治理、公共编译 Port/专业 SDK、持久推进与进程隔离仍待实现。

### 当前权限下的编译输入装配

`compilePreparedAction` 从真实 Action/Intent/PinSet 读取输入，要求当前 `abh.actions.register-plan` 准备 Grant，并调用安装方的来源/能力读取准入及 Artifact 校验。编译前后均重验 Release、Grant、来源、Action 精确版本及输入有效期；父 Action 锁只在短事务内持有。Compiler 在事务外运行，取消可独立提交；取消后的候选结果被拒绝。返回候选计划后仍须调用 `registerOperationPlan`，由其关闭编译后到注册之间的撤权竞态。

此入口不持久化编译任务、不自动重试、不装配输入正文读取能力，也不接收 Human RequestAuthorization。安装回调是可信服务端代码，不能视作隔离不可信插件的沙箱。

## 请求授权的持久接收

`requestActionAuthorization` 使用调用者当前 `abh.actions.request-authorization` / `abh.action.prepare` Grant 和安装方来源准入，接受 Proposed/Validated Action 的精确版本，原子写入不可变 `ActionAuthorizationRequestRecord`、Command 回执、Audit 和 `abh.action-authorization-request.accepted` Outbox 事件。第 43 号迁移新增 `execution.authorization_requests`，运行角色仅有 SELECT/INSERT 权限，按租户、Workspace 和显式生命周期用途读取。

记录保存原 Action 版本、原 Command、调用者、Action 定义固定的执行主体、Authority 断言和请求摘要。它不是批准、授权或运行任务凭据；后续 Service 不得使用保存的 Human 身份执行 T1。首次接收检查版本、生命周期和期限，重放仍检查当前 Grant/来源，但返回原请求，不因 Action 取消或阶段推进再次创建任务。Outbox 写入失败会连同请求和回执回滚，连接重建和并发调用返回同一请求。

当前仅有内部接收入口及可供安装处理链读取的 Owner，尚未开放 RequestAuthorization HTTP。恢复扫描、准备阶段衔接、必要责任分支和 Service T1 的自动推进仍需完成。Worker 必须使用独立稳定阶段幂等子键，不能重用此接收命令的幂等键调用内部 `authorizePreparedAction`。

### 授权请求恢复发现

`discoverAuthorizationRequests` 提供固定执行 Service 在 `abh.action.prepare` 下的有界分页扫描。候选来自持久请求与当前 Proposed/Validated Action，按请求 UUID 扫描，限定租户、Workspace、双方用途和执行主体；每页要求当前组织级 `abh.actions.read` Grant 与安装级准入，包括空页。全页来源 fence 先于按序父 Action 锁；锁后重读当前版本、主体、期限及可见性。返回当前 Validate/Pin/Compile/Authorize 阶段，Authorize 仍包含必要责任检查，不能直接视为 T1 已具备条件。

隐藏或过期项占扫描位置，空页可能仍有 next；完成一轮后必须从头扫描，以发现并发插入在游标之前的请求。不同请求可以指向同一 Action，处理链须使用实际 Owner 幂等/CAS，不能将扫描结果视为租约或执行授权。请求保持不可变，Action 取消后不再被发现；准备推进后仍返回原请求及最新 Action。当前尚未装配运行循环、阶段命令子键、编译候选持久恢复和责任/T1 自动推进。

### 原请求驱动的验证与 Pin

`validateRequestedAction` 和 `pinRequestedAction` 将持久请求接入实际 `validateAction`/`pinAction` 事务入口。仅当前固定执行 Service 可在准备用途下调用；阶段独立验证实际 Grant、请求/Action/执行主体绑定、主体精确版本和安装方当前请求来源准入。请求不携带 Worker 权限，Human 原调用者不参与 Service 身份签发。所有请求来源 fence 合并在阶段锁前，首次与重放均回查。

内部幂等键为 `authorization/{requestId}/{inputActionVersion}/validate|pin`，每次运行生成新的传输 Command ID，但重放返回原持久 Command ID。重试必须使用原输入版本、原验证证据或原 Pin 参数；修改阶段输入会产生幂等冲突，不以新 Command ID 绕过。已经推进的 Action 由恢复发现返回下一阶段；不同请求之间仍由 Owner CAS 和不可变 PinSet 约束。未来版本拒绝；取消后的已提交阶段只返回原回执，不恢复 Action、不重新验证领域或重新选版本。

这两个入口不编译、不打开责任请求、不执行 T1。编译候选持久恢复、阶段运行宿主、必要责任与授权衔接仍需装配；不存在用任意 callback 宣告整个请求完成的替代路径。

`pinAction` 新命令在父锁内要求 Validated；已有 PinSet 不使取消/终态对象接受新准备命令。原 Command 回执重放继续支持取消后查回，两条路径由实际 Command 去重事务区分。

### 请求驱动的编译、注册与恢复

`compileRequestedAction` 从持久请求读取当前 Action，复用固定 Service 请求绑定。无计划时调用 `compilePreparedAction`，再用稳定 `authorization/{requestId}/{planInputActionVersion}/register-plan` 子键进入真实 `registerOperationPlan`，一次提交 Plan、全部 Operation、Action 绑定及回执。存在计划时直接以原 Plan 的精确输入版本/摘要重验注册准入并查回，重新连接不会再次调用 Compiler。原请求需覆盖该准备阶段输入版本。

编译是无副作用的候选计算，注册提交是其持久输出边界：提交前崩溃可重新计算，提交后必读原计划。并发候选允许不同临时 ID，输掉 CAS/幂等竞争的一方丢弃自身候选，读取已提交计划并独立重验后返回。只处理版本、幂等和前置条件竞争；权限、摘要、范围、超时错误不被吞掉。改变指定 Compiler 精确版本不会替换已提交计划。这里不额外建立一套候选 Workflow/任务状态，也不把未提交计算视为已完成阶段。

真实测试覆盖注册拒绝不留 Plan/Operation、两个不同候选并发收敛于一个计划和回执、连接重建不重新编译、取消后原回执查回不复活，以及当前请求准入/Grant 撤销后重放拒绝。运行宿主、生产 Compiler/输入正文读取治理、必要责任和 T1 自动装配仍未完成。

### 持久请求绑定的 Service T1

`authorizeRequestedAction` 在 `abh.action.execute` 下绑定持久请求、原 T1 输入 Action 版本和固定执行 Service，读取保存的 Authority 断言后进入实际 `authorizePreparedAction` / `ActionAuthorizationResolver`。当前请求来源 fence/准入与原有执行来源、身份 epoch、批准、Policy、资源与 Action CAS 在同一授权事务内组合，Human 请求身份不会成为执行身份。

阶段子键为 `authorization/{requestId}/{preT1ActionVersion}/authorize`，与接收命令及准备阶段分离。并发或连接重建用原输入版本重放会返回原 Command/Action 回执，不能重复预留预算；断言仍由 Resolver 独立解析验证。重放继续查当前请求准入和执行来源，撤权不释放已存在的 Hold，也不签发新 Snapshot。调用方不能用 Action 的最新版本冒充原阶段重试；新授权轮次仍需走独立的清理/重新授权协议。

真实 PostgreSQL 测试覆盖 Human/错误 Action 拒绝、保存的错误 Authority 断言拒绝、请求准入撤回、Snapshot 写入失败整体回滚、并发唯一 Snapshot/两份策略评价/一份预留、重连原回执和执行 Grant 撤销。必要批准在测试中由真实 Decision/Authority Owner 事先完成；自动打开责任请求、等待恢复、运行宿主和公开 HTTP 仍需装配。

### 授权准备恢复宿主

`runAuthorizationWorker` 在租户内分页扫描持久请求，每轮根据实际 Action 阶段调用 `validateRequestedAction`、`pinRequestedAction`、`compileRequestedAction`，可显式安装 `authorizeRequestedAction` 的独立执行上下文/Resolver。每步重新认证当前 Service，准备和执行上下文必须保持同租户、Workspace、acting organization 和主体；不从请求 JSON 派生执行身份。安装的验证证据选择必须在中断重试时保持原参数，且有 deadline/signal 边界。

游标仅用于扫描，完成一轮重置，进程重启由持久事实恢复。版本竞争留待下一轮；权限、批准、策略、幂等冲突等失败不被吞掉。未安装 T1 时 `authorizationReady` 仅报告准备就绪，Action 保持 Validated。观察回调有界，取消后停止新阶段。`runTenantRuntime.actionAuthorization` 可加入既有并行循环，沿用租户绑定、失败取消兄弟循环和统一收尾。

当前测试覆盖真实准备自动推进、重启无重复编译/验证、跨步骤身份变化拒绝和观察回调超时。宿主 T1 分支已通过真实数据库测试，包括切换执行用途、提交后通知失败及重启不重复预留；租户宿主集成仍缺专门端到端测试；显式首次责任策略与等待恢复见下文；生产默认装配仍未完成。缺批准不会被自动解释为需要任意责任请求，仍须安装明确业务责任策略。

### 原授权请求的责任创建

`openRequestedResponsibility` 在固定 Service 准备用途下，要求独立当前 `abh.responsibility-requests.open` Grant 和请求来源准入，绑定已登记计划的 Validated Action、payload 摘要及意图期限。按原授权请求 ID 固定责任创建幂等键；原路由输入必须保持一致，改变请求 ID/席位/Package 不会创建第二套责任而是冲突。实际 Decision Owner 原子保存 ResponsibilityRequest、冻结路由提案、候选席位 Decision、Audit/Outbox 和命令回执。

首次创建在父 Action 锁内检查当前状态；取消后的原命令重放只查回原责任及当前状态，不复活 Action。重放仍查当前开单 Grant、请求来源和 eligibility 锁。业务安装必须在来源准入中证明必要席位、证据和范围要求，候选资格由真实责任记录及安装检查共同决定。该入口不批准、不签发 Authority、不注册 Wait；显式责任策略、宿主与 Wait Port 衔接见后文。

`recoverRequestedResponsibility` 通过固定原请求级 Command 回执查找首次冻结的开单提案，验证提案摘要与回执绑定，再通过 `openRequestedResponsibility` 重验当前 Grant、请求来源和 eligibility 锁。恢复不依赖调用方保存随机 Request/Package ID，也不使用只允许 Unresolved 的路由重试读取 API。已 Open 或 Closed 的责任请求均可恢复到原创建回执及当前状态；不会重开审批、替换路由或产生批准。无原回执返回 RESOURCE_NOT_FOUND，调用方必须按明确的创建策略处理，不能将任意恢复错误解释为“可以新建”。

### 原责任请求到 Wait Port

`waitRequestedResponsibility` 先在准备上下文恢复原开单提案并重验权限，再取得同一 Service/租户/Workspace 的当前 `abh.runtime.deliver` 上下文，调用真实 ActionApprovalWaitOwner 与 DurableWaitPort。固定等待键使用原授权请求 ID；owner/cause/dueAt 来自首次开单输入和回执，不能用当前路由状态重新计算。临时 ContextRef 在调用完成或失败后释放，Grant/来源仍由 Wait Port 每次回查。

并发及重连返回同一 Wait，责任 Closed 后注册重放保持原等待引用。真实责任关闭事件通过 signal 触发回源校验并持久生成唤醒；责任关闭只表示可重新检查执行依据，不代表 Authority Effect 已完成。此装配入口已接入下述责任策略/授权宿主分支，Effect→T1 联合场景仍待验证。

`requestedResponsibilityProgress` 在原请求恢复和当前开单/来源准入之后，回源读取指定 Control effectKey 的进度，区分 AwaitingCompletion、ClosedWithoutApproval、AwaitingEffect、EffectApplied。请求精确版本、目标、完成证据、效果意图及实际效果回执必须匹配；不可见的已存在回执不会被误报为 Pending。该结果仅用于调度，EffectApplied 即使在 Authority 随后撤销时仍是历史事实，必须由 T1 独立验证当前执行依据。内部 `readRequestControlEffect` 只能在调用者已完成准入后使用。

### 宿主的必需责任分支

`AuthorizationWorkerOptions.responsibility` 显式声明该安装下所有待授权请求必须有原责任路由与指定 Control effectKey。宿主先在当前准备 Service 下调用 `requestedResponsibilityProgress`：AwaitingCompletion 调用实际 Wait 装配并保持等待，AwaitingEffect 保持等待，ClosedWithoutApproval 不进入 T1；EffectApplied 才允许后续独立执行上下文/T1。缺失路由或当前准入失败直接报错，不将恢复失败解释为预授权。配置中的 Grant 和投递引用在循环启动时复制。

onPage 新增 responsibilityWaiting/responsibilityClosed，均为本页观察计数，不是 Action 状态或命令成功回执。真实宿主测试覆盖 Open 时复用同一 Wait，以及 Approved/Closed 但未应用 Effect 时不获取执行上下文。效果已应用后的宿主 T1 联合场景仍待测试，首次路由可由下述受信策略回调自动创建，生产业务策略和默认安装仍待完成。此分支只适用于明确要求责任批准的安装，预授权仍是单独的已授权路径。

### 首次责任策略与持久路由恢复

`responsibility.policy` 可显式安装受信、确定性的业务责任策略。`ensureRequestedResponsibility` 优先恢复首次冻结提案；仅原开单回执确实不存在时，在固定 Service、当前组织级开单 Grant、请求来源准入和 Action 锁下读取持久 Request/Action/Intent/Plan，再在事务外有界调用策略。策略可以依据实际动作和计划选择必要席位与 Package；返回值仍由真实开单入口重验对象、期限、Grant、当前准入及 eligibility。安装的 eligibility.lock 必须验证策略所需席位、证据、范围与职责分离，不可只依赖提案输出。

并发策略可生成不同尚未提交的提案；仅开单幂等冲突允许查回已提交赢家，并对赢家重新走准入。冻结输入不可见或损坏、缺权、取消和其他错误都不能触发新建兜底。策略已提交后重启不再调用，未提交策略输出可重新计算，因此策略不得承担外部副作用。未安装 policy 仍要求责任路由事先存在。宿主已可首次创建→实际 Wait；完整 Effect→T1 联合验证、生产业务策略和默认部署仍未完成。

### 必需责任到 T1 的联合证据

实际 PostgreSQL 集成现已覆盖宿主首次策略开单→Wait→Human submitDecision 生成 Pending Effect→冻结 Control 输入→applyControlDecisionEffect 原子签发→同一必需责任宿主执行 T1。Open、批准后 Pending 和仅冻结输入均不获取执行上下文。T1 Snapshot 插入失败时不留下策略评价/预算占用，重试只提交一组；提交后观察回调失败，新连接重启不重复授权或重新选择路由。另一路在 Applied 后通过真实撤销 Owner 撤销 Authority，历史进度仍是 EffectApplied，但当前 T1 拒绝且 Action 保持 Validated。

此证据使用实际身份/Grant/责任/效果/策略/资源/Action Owners；业务资格、来源/范围治理及有限输入构建仍由测试安装提供，不能代表生产业务策略或多循环租户运行时验收。

### 提案时原子接收自动授权请求

`proposeAction` 可显式安装 AutomaticProposalAuthorization，要求当前组织级 request-authorization Grant 与独立自动推进治理。所有来源 fence 在创建前获取；新 Action/Intent 与空断言的持久授权请求共享原提案 Command 和事务，任何请求/事件写失败均回滚提案。请求记录另计算实际 actionRef/payload 摘要，不把提案摘要误作授权输入摘要；执行 Service 仍来自真实受信定义。

原提案回执重放不再创建请求，仍检查当前提案和自动推进权限，并回源确认原请求存在。历史提案没有自动请求时不能靠重放静默补造，显式 RequestAuthorization 仍可使用独立入口。已有授权宿主可扫描这些同格式请求并继续真实验证/Pin/编译/责任/T1；原子受理不代表执行授权。

自动提案请求已通过实际高层 HTTP 客户端→同事务请求→Service discovery→validateRequestedAction 联合验证，验证后发现阶段为 Pin，重连重放不重复领域验证。accept 同时约束原提案 Command、初始 Action 版本、真实提案人及空 Authority 断言；用途必须来自已登记目录。独立请求仍校验自身摘要，受理不赋予当前执行权限。

## 2026-09-09：查回策略与实现绑定

`queryOnce` 在首次异步边界前复制查回输入、Command、事务选项和策略数据，固定 Connector 身份并绑定原查询／授权方法，保留方法接收者。等待摘要或事务时替换调用对象不再改变本次计费、超时、权限回调或实际查询实现。Connector 仅收到出口副本，篡改副本不影响已提交出口和观察来源校验；原有取消收尾、独立预算和禁止重放调用语义保持有效。

Action 回归 63 项通过，包含调用启动后同时替换输入／策略／Command／Connector 的验证。生产 Gateway／Pack resolver 默认装配、每次调用的当前治理门禁和真实签名非空包端到端验收仍未完成。方法绑定固定函数身份，不冻结受信实现对象的内部状态。

## 2026-09-09：派发业务准入方法绑定

`dispatchOnce` 在首次异步边界前绑定本次业务 source fences、来源检查、制品准入、策略 obligations、目标检查及可选 payload outputs／validate 方法，保留各自接收者。这补齐了仅固定 Connector／Resolver 方法时，调用方仍可在等待事务期间替换业务校验的缺口。方法绑定不冻结受信实现内部状态，当前身份、Grant、Scope、Pin、Permit 校验仍在派发事务中执行。

新增真实数据库回归：启动派发后将拒绝目标检查替换为允许，原拒绝仍生效，Connector 零调用且一次性出口无记录；随后独立调用使用有效准入，可以正常消费出口并发送一次。此变更不代表生产 Gateway／Pack resolver 默认装配或全部调用治理完成。

## 2026-09-09：Pack 派发事务装配入口

新增内部 `dispatchPackOnce`，固定部署绑定的 Connector 方法／身份、读取 Grant 与解析准入方法。业务 source fence 阶段创建同事务解析准备并合并 fences；目标检查阶段先验证 Connector 精确身份并获取 Deployment 锁；一次性出口写入和 payload 读取之后、提交之前完成实际 Pack 精确解析。解析失败回滚出口和该事务全部记录，Connector 仅在提交后调用。

原 T1 Snapshot 必须已经包含同一组能力读取／治理 fences；派发不能给既有 Snapshot 静默增加授权。独立 capabilities.read Grant 不从执行 Authority 推导。新增 `dispatchOnce` 内部最终准入回调，接收实际 Permit 副本，只能拒绝或完成当前事务准入，不提供外部发送机会；它不是公共客户端 API。

当前新增出口最终准入失败回滚与 Pack 装配缺少独立读取权限的拒绝验收。完整非空 Pack／真实签名／T1／Permit／解析／派发成功的端到端验收尚未完成，查询出口尚未接入同类装配，生产默认治理也仍未完成。

## 2026-09-09：查回出口提交前最终准入

`queryOnce` 新增内部最终准入回调，在独立预算消费、QueryExit 写入后且 Command 事务提交前运行，接收实际出口副本。回调拒绝时出口、预算与命令记录一同回滚，Connector 不调用；同一 Command 可以在后续有效准入下重新执行。回调身份在函数调用时固定，出口证据不由回调副本替换。

回归在最终准入中确认出口已写入且预算已计费，再拒绝；事务外确认出口为零、计费回到零、Connector 零调用，随后复用原 Command 成功。此入口提供后续 Pack 查回装配所需的提交边界，尚未实现 Pack 查回的完整 fences／Pin／兼容能力选择装配。

## 2026-09-09：精确 Enabled 能力查回装配

新增内部 `queryPackOnce`，固定安装的只读 Connector 方法、精确身份、能力读取 Grant 和治理方法。`InstalledQueryPolicy.fenceRefs` 在独立查询 Authority 的完整 Control fence 集合锁定前声明附加范围；同一 Command 的 admission／claim 复用同事务解析准备。出口写入和独立预算消费后、提交前执行实际 Pin／Enabled／治理／Schema／实现解析，拒绝则整体回滚且不查询远端。

历史 Action 执行 Authority Ref 仅参与原 Pin 输入重建；当前查询仍要求独立查询 Authority、当前政策、预算、Lease 与 capabilities.read Grant。此装配只支持当前 Enabled 原精确 Connector；原能力暂停／撤回后的受信兼容查回尚未实现，不能以此入口阻断未决责任的后续恢复设计。真实签名非空包成功查回联合验收和生产默认治理仍待完成。

查回政策新增内部 aggregate lock 阶段，位于 Action 锁之后、DurableExecution Lease 锁之前；Pack 装配在此获取 Deployment 锁，最终解析不再补拿较早部署锁。缺权拒绝回归不能代替完整非空能力成功查回验收。

## 2026-09-09：Pack 传输与 Capture 装配

新增内部 `dispatchPackAndCapture`／`queryPackAndCapture`，先执行 Pack 出口准入与一次性传输，再使用新观察 Context 持久化原始证据；失败返回现有 Pending Capture 句柄，由原 retryTransportCapture／retryQueryCapture 恢复。句柄只保留原 Database 和观察，不保留发送函数，持久化重试不会重新解析／发送／查回。

普通与 Pack 入口共用同一 Capture 句柄实现，并在传输前固定 Database 引用，避免可变参数数组在等待传输期间改变证据目标。Pack 准入拒绝直接传播，不创建 Capture Pending。现有 Action 回归覆盖捕获失败后恢复；Pack 的缺权拒绝测试已通过新组合入口运行。完整真实签名非空包成功传输与 Capture 联合验收仍待完成。

## 2026-09-09：Capture 身份刷新期限

传输和查回 Capture 重试在刷新身份之前固定本次事务选项，将同一期限与取消信号交给 Context 获取器，并以有界调用等待。刷新超时或取消返回原 CapturePending 句柄；迟到的身份结果不会继续启动捕获事务。成功刷新后的数据库持久化沿用原期限，不因刷新耗时重新获得完整预算。普通与 Pack Capture 入口共用该行为。

回归覆盖身份获取器永不返回、超时后迟到返回和后续同句柄成功恢复，持续验证 Provider 调用次数不增加。身份获取器应使用传入信号停止自身工作；有界等待不代表强制终止不合作的实现。完整 Pack 成功传输／Capture 联合验收仍待完成。

## 2026-09-09：扫描页到 Action 的恢复投递

新增内部 deliverActionSuspensionPage：从持久 Artifact 回读并核验完整扫描页，为每个 Action 或 Run 刷新独立 Service 身份，在相同组织/Workspace 中调用对应实际暂停消费者。页面读取权限与业务通知权限分别检查；消费者额外核对页内 pinSetDigest 与实际 Pin。未知 Owner 类型或缺 Run admission 整页失败，不能静默跳过。

每个效果以原暂停事件和原 Action 消费者为 Inbox 去重依据，分页边界、重新扫描与既有队列投递共享相同回执。当前目标失败只回滚它自己的事务；已完成目标仍可在新数据库连接中回放。可选 onHandled 在效果提交后有界执行，确认丢失不会重复写入观察。输入、回调及策略配置在等待前固定，整页共用调用方截止时间和取消信号。

真实签名链联测覆盖：第一条已完成而第二条写入失败、第二条成功后确认丢失、新连接恢复、重复消费、真实扫描从一页拆为两页后仍返回原回执、跨 Workspace 身份拒绝、伪造 Pin 摘要拒绝、取消与撤权后重放拒绝。scanPackSuspension 的 accept 已在联测中组合实际 storeSuspensionPage 与该投递入口，只有全页返回后推进扫描。

此入口完成一页中实际 Action/Run 的效果，不写入原事件的冻结路由或全局消费完成凭证。dispatch worker 现在为显式 scope 保存数据库时钟高水位和持久页 cursor；自动跨范围发现、生产 scope 目录和托管调度仍待实现。Run 效果只保存观察，不改 Run 状态。Retire、兼容查回和其余 V1 范围不变。验证见 [分页投递记录](../../../../docs/development/verification-2026-09-09-suspension-page-delivery.json)。

## Safety Stop 提案

`abh.actions.start-safety-stop` 把有界候选发现接到公开业务编排：调用者选择候选，Owner 在提案事务内复核当前 fence、token、未决 Operation 和专用用途后创建 safety intent。它不授权、不派发，也不代替安全 Action 的 T1/T2 或事后 reconciliation。

## 2026-09-09：Action 暂停扫描、保存与投递的正式组合

processActionSuspension 为单个已提交事件/能力/业务范围串联实际目标查询、storeSuspensionPage 和 deliverActionSuspensionPage。每页刷新管理和业务读取身份，分别校验管理 Grant、业务读取、Artifact 存储、通知 Service 与业务 Owner 权限；固定整个调用的身份范围、参数、回调及截止时间。注册类型映射必须与投递安装一致。

整页实际消费后才推进游标；到达页数上限返回可续跑游标，失败不返回虚假进度。重启可从头扫描，持久页面及原事件 Inbox 保证幂等。签名联测覆盖单页暂停续跑、完整两页重放、缺失存储 Grant、映射冲突、确认丢失及新连接恢复后仍只有两条 Inbox。

该入口关闭此前由测试 accept 回调串联的生产内部装配缺口；自动枚举全部业务范围、事件到多范围任务调度、Run Owner、Retire/兼容查回仍待实现。本次未重跑全量 Core。验证见 [暂停处理组合记录](../../../../docs/development/verification-2026-09-09-suspension-processing.json)。

## 2026-09-09：暂停事件到已安装业务范围的自动调度

runSuspensionDispatchWorker 自动发现管理侧暂停事件，从真实历史能力集合取得 id/version/registrationDigest，经显式注册类型到公共类型映射，为每个匹配的已安装业务范围执行 processActionSuspension。逐页处理直至该范围扫描完成；整批成功后推进事件游标，最后一批后重扫。每页刷新权限和身份，业务范围绑定跨处理调用保留，不能在换页或重扫时切换组织/Workspace/主体。

范围列表与策略回调在运行前固定；重启以实际页面/Inbox 事实恢复。未映射的注册类型拒绝而非静默完成。该循环不产生原事件的全局消费水位或退休证明，范围列表仍由宿主治理显式安装，不能据此宣称已经枚举所有业务范围。

签名联测不再向 Worker 传 eventRef 或 capability exactRef，只配置类型映射与两条重叠业务订阅；它自动发现事件、构造能力引用、完成每条订阅的两页扫描，连续两轮仍只有两条真实 Inbox。另验证未映射类型拒绝、业务身份跨页漂移拒绝与卡住的管理身份源停机取消。此测试是同范围重叠订阅，不是异质多 Workspace 业务联合验收。

仍缺生产宿主自动安装、范围目录、任务失败隔离、Run Owner、Retire/兼容查回。本批未重跑全量 Core。见 [暂停自动调度记录](../../../../docs/development/verification-2026-09-09-suspension-dispatch.json)。

## 2026-09-09：暂停调度按业务范围隔离失败

SuspensionDispatchWorker 可显式安装 onScopeFailure 持久记录回调。某范围处理失败后，只有回调成功返回才继续其他范围；没有安装回调或记录失败仍终止循环。失败记录只包含 eventRef、精确能力、scopeId 和结构化错误码，未知异常归为 INTERNAL_ERROR，不传播原始异常正文。管理事件发现失败及未映射能力仍终止循环。

onPage 新增 blockedScopes，与成功 scopeSweeps 分开。事件扫描完成不表示业务效果全完成；失败范围在下一次完整重扫时从头重试，已提交页面/Inbox 继续去重。没有新增绕过授权或释放责任的路径。

签名联测注入第一范围存储失败，实际保存脱敏诊断 Artifact 后第二范围正常处理；下一轮修复第一范围，两范围都完成。失败记录回调不可用则立即失败。诊断存储为显式测试安装，生产宿主仍需自己的授权持久接收器；本批未重跑全量 Core。见 [暂停故障隔离记录](../../../../docs/development/verification-2026-09-09-suspension-isolation.json)。

## 2026-09-09：暂停失败诊断的正式存储

storeSuspensionFailure 通过正式 storeInlineArtifact 命令保存 PackSuspensionScopeFailure，要求当前存储 Grant、用途、来源与保留策略。事务中重新读取真实暂停事件，Enable 等其他事件拒绝；只选取事件/精确能力/scopeId/注册错误码，输入附带 message/stack 不进入正文。诊断 Artifact 归组织所有，来源引用原事件。

相同诊断按摘要幂等复用 Artifact，重放仍重新授权并校验来源。重复记录不表示发生次数，不会自动随成功消失，也不构成业务通知、责任释放或远端无效果证据。存储回调受统一截止时间及取消约束。

故障隔离联测已替换直接 Owner 写入，使用该入口。覆盖缺 Grant、伪造事件来源、重复写入、新连接重放、额外异常正文剔除以及当前策略拒绝重放。宿主仍需提供可信身份、存储政策和授权；本批未重跑全量 Core。验证见 [失败诊断存储记录](../../../../docs/development/verification-2026-09-09-suspension-failure-store.json)。

## 2026-09-09：兼容查询出口的双 Connector 证据

QueryExitRecord 新增可选 queryConnectorRef、compatibilityEvidenceRef、compatibilityEvidenceDigest，三者必须一起出现，替代能力必须区别于原 connectorRef；三字段纳入出口摘要。原 connectorRef 始终来自原 Permit，继续保留 Provider 幂等键、payloadDigest、Connection、Account 与原计划身份。

InstalledQueryPolicy 可显式安装 compatibility。不同 Connector 查询必须读取实际 Artifact，核验其 owner 为当前 Operation，正文绑定原/替代能力、Operation、Connection、Account 和有效期，再由当前可信策略授权。证据有效期参与出口截止计算；原独立 Scope Authority、Grant、Purpose、Connection、预算、限流、Lease 检查不变。queryOnce 在等待前固定兼容配置和回调，成功出口仍先提交后调用 transport。

Actions 联测将第二次预算查询改为实际替代 transport；无兼容证据、当前策略拒绝、错误替代绑定或过期证据均零调用且不收费。成功后原 Connector 和替代 Connector 同时记录，费用累计正确、Operation 保持未决。Contracts 验证证据字段成组、不能伪装同一能力及替换证据摘要会改变出口摘要。

这里只补齐通用可信 Query 出口，queryPackOnce 仍只解析原 Enabled 精确能力。暂停/退役后从另一实际签名 Enabled Pack 解析替代实现、治理发布兼容证明及实际兼容归一化端到端仍需继续实现，不得将本批当作完整 Pack 兼容查回验收。验证见 [兼容查询出口记录](../../../../docs/development/verification-2026-09-09-compatible-query.json)。

## 2026-09-09：兼容查询证据正式 Schema

CompatibleQueryEvidence 纳入生成契约，封闭字段集合，要求当前 Operation、Connection、Account、有效期和两个不同的 Connector 精确引用。QueryExitOwner 读取实际 Artifact 后先使用正式契约验证，再检查绑定及可信兼容策略。额外 approved/URL、错误能力类型及缺少字段拒绝；本批不改变原查询权限与计费。

Contracts 全量 308 通过；Actions 回归包含新增错误能力类型和额外批准字段的零调用拒绝验证。实际签名替代 Pack 解析、兼容证明发行治理和归一化端到端仍未完成。验证见 [兼容证据契约记录](../../../../docs/development/verification-2026-09-09-compatible-evidence.json)。

## 2026-09-09：兼容查询证据的事务稳定性

QueryExitOwner 在 Action/Lease 等业务锁之后对兼容 Artifact 获取共享行锁，重新读取版本/内容摘要、重新执行当前兼容授权，并在回调后再次回读。证据作废或版本变化拒绝本次查询并回滚计费；并发作废必须等待当前出口事务完成。有效期仍由回读后的数据库时钟约束。

Actions 联测覆盖后续锁回调在同事务作废证据、最终兼容策略拒绝、拒绝后证据修改回滚与零额外调用/计费，以及独立数据库连接 FOR UPDATE NOWAIT 被最终证据共享锁拒绝。此改动补齐通用兼容出口一致性，实际签名替代 Pack 解析仍待实现；未重跑全量 Core。见 [兼容证据锁验证](../../../../docs/development/verification-2026-09-09-compatible-query-evidence-lock.json)。

## 2026-09-09：替代 Pack 查询解析装配

queryPackOnce 现在根据显式 compatibility 安装选择替代查询解析路径。预备令牌在原事务内收集替代能力的完整 fences，业务锁之后、出口提交之前消费一次；保留原 Action 的真实 Pin 输入，不为替代能力生成或改写 Pin。resolveEnabledPackCapability 复用原解析器的当前 Enabled/注册摘要/implementationRef、内容完整性、Schema、信任和健康复核；普通派发解析仍要求当前可执行的 Assignment。

替代路径读取实际 QueryExit、兼容 Artifact 和原 Pin，核对 Action/Operation、两个 Connector、Connection、Account、摘要及数据库时间。原 Pin 仅证明历史绑定，暂停的 Assignment 不妨碍独立授权的对账。证据共享锁持续到提交，Pack 回调之后再次验证，拒绝解析期间作废证据。发送仍发生在出口与预算消费提交之后。

真实 PostgreSQL Actions 回归覆盖缺少独立能力读取 Grant、错误实现引用、当前策略拒绝、Schema 内容损坏、解析期间证据作废的零额外调用和预算回滚；成功场景已撤销派发 Grant，替代查询保留原 Pin/Permit 幂等键及未决 Operation。另在独立回滚事务内暂停原 Assignment，验证历史查询 Pin 仍可读取、普通执行 Pin 拒绝；事务回滚保持共享 fixture 隔离。普通能力解析回归及原有真实 Cosign 签名 Connector 链路也通过。

替代 Pack 使用明确的管理元数据 fixture，不能作为两个实际签名 Pack 在 Suspend/Retire 后联合恢复的验收。兼容证据发行治理、兼容归一化及签名替代 Pack 的最终对账联测仍待实现；未重跑全量 Core，V1 总体尚未完成。验证见 [替代 Pack 查询解析记录](../../../../docs/development/verification-2026-09-09-compatible-pack.json)。

## 2026-09-09：双签名 Pack 退役后查回与最终收敛

安装 fixture 提取为 installSignedConnectorFixture，读取组织当前部署修订，复用真实签名治理发布、Validation、Stage、Capability 注册、签名数据影响报告、迁移不适用证明、CTK、Human 决策和 Enable；身份及管理 Grant 仍是显式管理 fixture。第二个 Pack 使用独立生成的 release/builder/CTK 签名密钥和不同包身份，部署修订沿同一组织继续推进。

原 Connector 完成一次派发，只返回 Pending 接受事实；随后原包经 Suspend、Retire，原 Assignment 暂停。替代包在同一组织真实安装并 Enabled，以独立 Scope 查询 Authority、能力读取 Grant、兼容 Artifact 和预算完成查询。原包源读取次数为零，替代字节通过两次内容验证；出口先提交，保留原 Connector/幂等键并记录替代身份。Capture 故障后只重试持久化，替代 Provider 查询共一次，查询累计费用为两次。

原派发 Pending 与第一次空查询不足以证明成功。替代查询提供同一外部身份的更高版本 Applied 事实，经全部三条真实 Receipt 参与 Reconciliation 得到 ConfirmedSuccess。独立当前 Controller Grant 和 Lease 下应用结果，错误授权及最终写入故障整体回滚；成功后 Operation Closed/Succeeded、资源占用清除。ActionResult 按完整子版本与报告集合汇总至 Closed/Succeeded，重放不重复写入；本 Action 未声明计量资源，资源结算集合为空，查询费用单独保留。

该链路为真实 PostgreSQL/Cosign/Owner 联测，Provider、兼容证明授权、归一化、比较规则及结算政策仍是可信测试安装，不代表生产治理或独立 CTK 验收。兼容证据正式发行治理、生产宿主与 V1 其他模块仍有缺口。未重跑全量 Core。验证见 [双签名恢复验证](../../../../docs/development/verification-2026-09-09-signed-recovery.json)。

## 2026-09-09：兼容查询证据正式发布入口

新增内部 RecordCompatibleQueryEvidenceCommand、封闭 Payload 和独立 abh.operations.record-compatible-query-evidence 权限，仅允许 abh.operation.reconcile 用途。证据、实际审查 Artifact 和保留策略均纳入命令摘要；不接受调用方批准标记或出站 URL。Contracts、目录和 API 报告同步生成。

recordCompatibleQueryEvidence 在命令幂等锁、完整 Control fences 和 Action 锁下核对真实未决 Operation 精确版本、已派发 Attempt、原 Permit/Connector、Connection/Account；读取以当前 Operation 为 owner 的 JSON 审查 Artifact，锁定源行，并由必填可信策略核验适用 CTK、只读语义、隔离和当前治理。存储策略负责正文用途、引用可见性及区域/保留准入。回调有界，写入前后复核审查版本、Operation、Connection、Grant 和数据库有效期；Artifact 与审计/Outbox/命令回执同事务提交。

成功返回实际 ArtifactRef，可直接供 QueryExit 读取。重放重新执行当前审查和授权，核验已存证据正文及元数据；审查作废、撤权或过期拒绝，不能重新发布。证据不替代独立 Query Authority、Lease、预算、当前兼容授权和 Enabled Pack 解析，也不自动改变 Operation 或调用 Provider。

双签名恢复 fixture 已替换直接兼容 Artifact 写入，覆盖缺 Grant、误用 Capture Grant、用途错误、原绑定/版本错误、审查拒绝、回调撤权/作废证据、最终复核失败导致新 Artifact 回滚、过期拒绝、并发作废被共享行锁阻挡、成功重放去重和撤权后拒绝重放，随后仍完成替代查询与最终业务收敛。

此入口落实治理执行边界，审查材料发行与实际 CTK/隔离/只读语义的生产核验策略仍须可信安装；当前联测使用显式 fixture 审查，不宣称生产兼容治理完成。V1 其他模块仍按总表保留。验证见 [兼容证据发布验证](../../../../docs/development/verification-2026-09-09-compatible-issuance.json)。

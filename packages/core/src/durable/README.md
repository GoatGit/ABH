# Durable Execution 内部装配

`DurableWaitPort` 提供 `scheduleWakeup`、`cancelWakeup`、`signal` 和 Wait `inspect`。使用 `composeDurableExecutionPort(delivery, waits)` 与真实 pg-boss 交付适配器组合后，所有 DurableExecutionPort 方法都有实现；队列排空仍由交付适配器处理，服务器关闭前须先停止 Command Ingress 并等待已进入的数据库事务。

服务器验证身份后，将内部签发的 `VerifiedContext` 和当前 Grant Ref 注册到 `WaitContextDirectory`。目录只接受真实签发对象，最多保留 1000 个活跃句柄，句柄随 Context 到期或 revoke 失效。Context JSON 或外部传入的组织字段不能创建可信上下文。目录是进程内入口句柄，不承担持久业务状态；重启后由 Ingress 重新签发句柄。

Wait Port 在事务中解析安装的 Owner 条件，重验 Service 身份、credential epoch、Grant 和控制 fence。调用方只能提交公共 ownerRef/waitKey/dueAt/causeRef；Authority、条件和源由安装模块解析。包括 Command 重放在内，当前权限检查始终执行。

第 25 号迁移的 `runtime.wait_port_receipts` 保存调度、取消和信号的不可变结果。取消重放返回原 disposition/receiptRef。signal 返回的 `wakeupRef` 指向信号接收凭据 `abh.wait-port-receipt`，只表示已可靠接收并检查源；实际条件/期限唤醒另存为 `abh.durable-wakeup`。源未满足时不伪造唤醒。Wait 尚未注册时 signal 返回 RESOURCE_NOT_FOUND；源事件本身仍持久存在，后续注册立即回读源事实。

数据库写入后的超时、取消或连接不确定性返回 Tracked/WaitRef。用相同入参重试获得原结果，或 inspect 查询当前等待事实。调用前取消返回 Cancelled/None。原生 pg-boss Job 不能替代 Wait 或业务状态。

恢复 Worker 调用 `recoverPending(context, options, afterId?)`：一次读取最多 100 条当前租户、当前安装条件的 Pending Wait，逐项进入新事务和当前权限检查，回读真实源与数据库期限。完整扫描后重置游标，新的进程可从头扫描。该方法可由有界轮询/定时交付调用；跨组织调度与常驻生产 Worker 生命周期仍由运行服务装配。

## Action 等待授权请求结束

`ActionApprovalWaitOwner.install(preparationGrantRef)` 安装实际 Action/Decision 条件，不使用可替换的 readSource/enterWaiting fixture：

- 要求当前 Action 为 Validated，授权请求属于该 Action，proposalDigest 与 payloadDigest 一致，期限不超过请求期限。
- `execution.action_waits` 与 Durable Wait 同事务保存 Action Owner 的等待意图；不修改 Action 的生命周期或生成执行 Authority。
- 只从 DecisionOwner 的持久 ResponsibilityRequest 读取 Closed 状态。新建请求的生命周期元数据允许 `abh.runtime.deliver` 读取；DecisionPackage/Artifact 内容仍保留独立权限。
- `consumer(grantRefs)` 将真实唤醒或取消事件经 Inbox 交给 Action Owner。当前权限、Wait/Authority/Owner 绑定和源状态再次校验；通知结果与 Inbox、Audit、Outbox 同事务。
- 结果为 SourceClosed、Deadline 或 Cancelled。SourceClosed 包含“请求被拒绝而结束”的情况，必须由后续 T1 重验完整批准证明；它不表示获得授权。

该装配目前覆盖 Action 授权请求等待。Mission/Run、公开 HTTP Ingress、跨组织恢复调度、生产保留/水位清理及独立验收仍待相应模块实现。

## Operation 对账完成等待

`OperationReconciliationWaitOwner.install(notificationGrantRef)` 安装 Operation 源条件。ownerRef 与 causeRef 必须绑定同一已派发 Operation 版本；实际读取 OperationOwner，Closed 才满足。它将等待意图保存到 `execution.operation_waits`，以父 Action 锁与 Controller 协调。恢复扫描、Timer 和已提交 Operation 事件共用 Wait CAS。

其独立 consumer 接收真实 Wakeup/取消事件，经 Inbox 原子登记 SourceClosed、Deadline 或 Cancelled。超时与取消不会创建 Attempt、重发 Provider、释放资源槽或预算。Closed/Failed 与 Closed/Succeeded 都结束等待，但其业务 Outcome 只由既有 Controller 决定。

该装配处理对账结束的通知，不执行外部查询。查询调用仍须独立 Query ExecutionAuthority、只读出口和当前预算，不能使用等待通知 Grant 代替。

## Outbox Publisher

`publishCommittedEvent` 将当前租户的真实事件交给安装的路由器，冻结消费者集合，再认领路由的 30 秒 WorkLease。它读取持久 delivery 事实，只向未确认消费者调用已安装的 DurableExecutionPort。每次出站前重新验证当前权限并续租；每次调用最多等待 10 秒，受 Context deadline、租约期限和停止信号共同约束。队列 Completed 才能产生进程内确认凭证，再由 OutboxOwner 原子保存 delivery 和最终 publication；Tracked/Cancelled/Rejected 不计为成功。

`runOutboxPublisher` 默认每页 100 项、间隔 500 ms，重新签发各阶段 Context，固定组织、工作区和 Service 身份。扫描同时包括安装订阅匹配的新事件和已有未完成路由，因此订阅变更不会漏掉旧扇出；完整扫描后重置 UUID 游标。权限或完整性故障上报宿主，租约竞争留待下轮。部分成功或入队后崩溃允许重投尚未确认项，使用冻结 job/dedupeKey；全部确认的重放仍检查当前权限，但不会再次入队。

该组件可由宿主长期运行；生产 Context/Port admission、路由治理、跨组织最小字段发现、队列背压/指标和各消费者保留水位仍待装配。测试采用安装路由与 admission Fixture 和真实隔离 pg-boss，不能据此声称生产发布门禁完成。

## 消费者处理完成凭证

`recordOutboxConsumption` 使用独立当前 Grant `abh.runtime.record-outbox-consumption`，从冻结路由、publication 和实际 Inbox 证明每个消费者均已提交业务处理结果，再保存不可变 `OutboxConsumptionRecord` 与 Audit/Outbox。队列入队成功、部分消费者完成、无关消费者完成都不能替代完整集合。重放读取 CommandReceipt 前重验当前权限。

`OutboxConsumptionOwner.pending` 提供最多 100 项租户内已发布但未记录消费完成的路由引用；扫描到尾后须重置 UUID 游标。它只发现候选，不证明处理完成，写入时必须重新核对全部源事实。处理完成凭证是逐事件的恢复/保留证据，不是跨事件连续水位；新增消费者回填、保留期限、法律保留、幂等墓碑和独立 Maintenance Authority 尚需一并验证后才能清理，当前没有删除入口。

## 租户运行装配

`runConsumptionWorker` 持续扫描已发布但未记录全消费者完成的候选，每页至多 100 项，默认间隔 500 ms。每项重新取得当前 Service Context 并调用独立 Grant ingress；缺失处理结果留待下次扫描，权限或完整性错误交给宿主，扫完重置游标。它不执行 Consumer、不修改队列，也不删除数据。

`runTenantRuntime` 将 Operation 恢复、Outbox 发布和消费者完成三个循环装配在同一租户范围，允许各用途使用各自 Service 与 Grant，但组织/工作区/acting organization 必须一致。任一循环抛错会取消其余循环，等待所有循环及数据库事务返回后向调用者报告错误；外部停止信号走相同收尾流程。调用者应在此返回之后 drain/关闭队列和数据库。Context 签发、SIGTERM 接线、生产重启策略和队列消费者执行仍由实际服务负责，不能据此宣称生产运行服务完整。

## 原生队列事件消费者

`runDeliveryWorker` 从安装的队列 Adapter 获取 Job，并由服务端解析器为每次交付签发当前 Service Context。它根据安装消费者 ID 选择处理器，核对 Context 组织与队列最小租户字段，再调用 `consumeOutboxDelivery`。后者回读真实事件与冻结路由，比较消费者、完整 Job 和事件摘要，然后走当前授权的 Inbox ingress。Owner 变化、Inbox、CommandReceipt、Audit/Outbox 在同一事务完成，结果也在该事务内读取。

事务成功后才调用队列 complete，确认丢失时保留已提交 Inbox，由原生重投和 Inbox 幂等恢复。停止信号阻止新处理并取消未提交事务；已提交的结果会先尝试完成确认。没有匹配消费者、Job 被替换或授权失败时，不确认队列成功，错误交给宿主。该组件只处理冻结 Outbox 事件路由；业务定时 Job、跨组织 Context 签发、租约/权限生产装配和进程信号仍需相应服务实现。

## 服务退出顺序

`runRuntimeService` 管理已安装循环和依赖的生命周期：等待全部循环停止，取得独立当前 drain Context，调用队列排空，交给 `recordDrain` 保存实际报告，再关闭队列和数据库。工作 AbortSignal 不复用于 drain。排空 deadline 最长 60 秒，额外最多 250 ms 用于返回到期报告；不配合的 Port 被超时中止，不能伪造 drained=true。剩余 Job Ref 保存在真实报告中，未完成 Job 交给持久恢复。

循环故障、报告保存失败、依赖关闭失败均汇总上报；即使前一步失败也尝试关闭两个依赖。报告保存回调必须由宿主提供持久实现，当前并未替代审计/日志生产装配。`joinRuntimeLoops` 将未收到停止信号的正常退出视为故障，防止运行服务悄然失去某个循环。关闭 ingress、drainRequest、报告保存及关闭方法自身的有界性仍由安装宿主保证。

`runProcessService` 在服务生命周期内安装 SIGTERM/SIGINT 监听器，将它们与外部 AbortSignal 汇合为一次退出请求，并在返回或失败时移除监听器。它不调用 process.exit，也不覆盖全局异常处理。`runRuntimeService.stopIngress` 由实际服务器提供：调用时同步停止接收新命令，返回的 Promise 等待已接收请求完成。宿主先调用此钩子，再取消 Worker；请求收尾与 Worker 收尾都结束后才执行 drain 和关闭依赖。入口停止失败仍取消 Worker、尝试关闭依赖并报告错误。没有配置入口的纯 Worker 服务可省略该钩子；实际 HTTP 安装可使用 `stopIngress: () => stopHttpIngress(app)`，其中 stopHttpIngress 来自 @abh/adapter-fastify；该钩子会等待实际认证/Owner Promise，HTTP 超时或断连响应不代表业务已经结束。

## 本地排空证据日志

`LocalDrainJournal` 可接为 `recordDrain: async report => { await journal.save(report); }`，适用于部署提供本地持久卷的服务。部署预先创建并保护根目录；日志按组织/实例 UUID 隔离，canonical JSON 的摘要作为文件名。写入独占临时文件、fsync 后以硬链接原子发布，最后同步目录；同摘要重试验证原内容，不覆盖既有证据。`read(digest)` 校验租户、实例、格式、摘要和 DrainReport 契约，重启后可查回未排空 Ref。

报告文件权限 0600，组织/实例目录 0700，拒绝最终目录/文件符号链接。根路径及祖先目录必须由可信部署控制，不用于多租户任意路径输入。本地日志要求持久文件系统支持硬链接和目录 fsync；临时容器层不能满足重启保留。它是运行证据存储，不替代业务 Audit、法律保留、共享 ObjectStore 或任务重放授权。崩溃留下的临时文件目前保留，后续维护清理须另行实现。

`ActionApprovalWaitOwner.router(ruleRef, consumerRef, deliveryWindowMs)` 提供 Action 授权等待的实际通知路由。它从持久 Wakeup/Cancelled Wait 读取 ActionWait 绑定，推导 Action 目标、固定消费者 ID 和事件幂等键；仅创建 action.advance 通知 Job，不签发执行 Authority。默认投递窗口为路由准备起 24 小时，安装者可设置 1 秒至 7 天；冻结后的 Job 不随重试重新计时。其他 Owner 类型的 Wait 不进入此路由，Operation/Mission 等需要各自安装路由。路由发布仍需独立当前 Grant 和正式规则/消费者安装治理。

`OperationReconciliationWaitOwner.router` 为超时、取消、最终完成通知创建 `abh.operation.notify-wait` Job，使用实际 OperationWait 绑定推导目标。该独立 Job 类型进入 control 队列，通知消费者重新验证当前通知 Grant；`abh.operation.reconcile` 仍要求查询 Authority，不能互相替代。通知不查询 Provider、不创建 Attempt、不释放预算。

`composeWaitNotificationRouter` 将已安装的 Action/Operation 路由按持久 Wait.ownerRef.type 分派。统一路由先回读 Wakeup/Wait，再调用对应 Owner 路由；未安装 Owner 类型拒绝处理。路由集合与 ruleRef 由部署治理提供，新消费者回填与路由保留水位仍待实现。

## Wait 持续恢复

`runWaitRecoveryWorker` 为一个已安装条件持续调用 Wait Port 恢复入口，默认 500 ms 间隔，每页至多 100 项，扫完重置游标。每页签发当前 Service Context 的进程内句柄，并在页结束后立即撤销句柄，避免长时间运行积累目录项。组织、工作区、acting organization 和主体不能在循环中漂移。源条件与期限仍由 DurableWaitOwner 在各项事务中验证。

`recoverPending` 在候选扫描之外，还会为每项锁定和检查入口 Grant 的当前 fence；安装条件的授权独立保留。扫描后入口授权撤销会阻断该项，不生成唤醒。`runTenantRuntime.waits` 可安装多个条件恢复循环，并与其他 Worker 共同停止/收尾；跨组织调度、生产 Context 签发及持久扫描水位仍待实现。

## Queue Port 当前身份目录

`QueueAdmissionDirectory` 可直接作为 PgBossDeliveryAdapter 的 admission。构造时固定安装消费者 ID 集合；register 只接受真实 VerifiedContext、Service/runtime.deliver 用途和 Grant Ref，返回随机进程内 ContextRef。每次 enqueue/inspect/drain resolve 在当前租户事务中验证实际 Grant、身份 epoch、scope、用途及控制 fence，再返回绑定的组织/消费者。无效、撤销、过期或伪造句柄不能选择租户；句柄可显式 revoke，过期项在注册时回收，目录最多 1000 项。

此目录提供真实当前权限解析，但消费者安装目录和 VerifiedContext 签发仍由可信宿主提供。Queue 角色继续只访问原生队列，权限读取通过 Core runtime 事务完成；入队授权不替代消费者的业务 Owner admission。

`QueueAdmissionDirectory.publisherContexts(grantRefs)` 返回 Publisher 可直接安装的 enqueueContext/releaseEnqueueContext。它校验冻结路由摘要与组织，按消费者的实际 Job 推导 target，绑定当前 Grant 后创建独立句柄。Publisher 在调用完成、失败、超时和出站前取消时均释放该句柄；队列已接受但未确认的任务仍按原有持久重投恢复。释放句柄不会删除 Job 或撤销已经提交的业务事实。冻结路由发布本身仍由独立 Outbox admission 校验。

`QueueAdmissionDirectory.drainContexts` 可直接装配 RuntimeService 的 drainRequest/releaseDrainRequest。每次退出时重新取得 Service Context，目标固定为该组织，复制已安装队列类别和 Grant，期限不超过 Context 剩余时间及配置上限（最多 60 秒）。宿主保存报告后释放句柄，再关闭依赖；排空/验证/报告保存失败也走相同释放路径，释放错误一并上报。这里的 drain 停止当前 Adapter 实例的接收，并不代表撤销组织内所有服务的业务授权。


## Worker 身份刷新期限

Wait、Operation 恢复、Publisher、消费完成与队列消费 Worker 的 Context 提供者接收 `TransactionOptions`，可直接传给 IdentityIngress.authenticate。每次刷新默认最多 10 秒，Operation 恢复使用配置的 transactionTimeoutMs（最多 30 秒），并合并宿主取消信号。runTenantRuntime 的租户绑定包装保留这些参数。不配合取消的提供者不会阻塞 Worker 返回；迟到结果不会进入 Owner 事务或触发队列确认，提供者自身仍应响应传入 signal 释放资源。

身份入口将同一请求期限传递到部署身份映射查询；查询在等待连接池或表锁时均可取消，并等待查询清理后返回。身份映射结果之后仍需验证当前组织、主体、membership 和 credential epoch。本能力不替代真实 IdP、凭据保管或服务启动治理。

`runTenantRuntime.responsibilityExpiry` 可安装责任请求整体到期扫描，与其余循环共享组织/Workspace 绑定和失败取消/收尾。该循环使用独立 Service/abh.runtime.deliver Grant，关闭到期 Request 并使 Pending Decision 失效；不创建批准凭证。注册与范围说明见 [Human Owner](../human/README.md)。


runTenantRuntime.controlEffects 可装配 Control 效果恢复循环，使用固定 Service 的 ContextSource、独立 create 管理 Grant 和治理检查，扫描已冻结且尚无回执的效果。失败会取消同宿主循环并保留可恢复持久输入，不隐式忽略权限错误。

宿主各分页循环的 onPage 统一使用有界回调：Outbox Publisher/Consumption、Wait recovery、Operation recovery/terminal comparison、Responsibility routing/expiry 和 Exception recovery 与 Control Effect 一样传入 deadline/AbortSignal，最多等待 10 秒。外部停机或兄弟循环失败可以释放不合作的观测回调；回调错误仍向宿主传播，已提交业务事实不因观测失败而回滚。只有回调完成后才开始下一页，不会因回调超时并发启动新的业务批次。

Wait Port 安装可提供 `recoveryAuthorityRef`，恢复扫描在分页前按精确 conditionRef 与 authorityRef（含版本）筛选。Action Approval 与 Operation Reconciliation Owner 自动绑定安装 Grant，并复制引用；同一条件的其他安装不再成为本循环候选。此筛选不是准入，每个候选仍调用真实 Owner 检查当前 Grant、来源与身份，撤权错误仍传播。

### 授权与恢复循环的联合停止验证

真实数据库场景将必需责任授权宿主、Operation 恢复、Outbox Publisher、消费覆盖恢复和 Action Wait 恢复同时装入 runTenantRuntime。各恢复循环实际完成一页并停留在不合作的观察回调；授权循环完成 T1 后观察失败，宿主取消所有兄弟回调并等待循环返回。已经提交的授权只保留一组 Snapshot/Policy/预算预留，重连不会重复授权。Publisher 仍恢复旧冻结投递；该场景的队列 Port 明确返回 Cancelled/None，未将队列未接收记作发布成功。

此测试覆盖多循环取消和业务事实保留，生产原生队列接收→消费→效果→执行全链路、启动目录及运行托管验收仍待完成。

HTTP 托管应使用 runHttpService.tenant 或 createTenantRuntimeLoops 返回的独立循环集合。集合内仍共享组织/Workspace/acting organization 绑定，但失败直接交给最外层生命周期处理，立即停止入口；不要依赖包在单个循环中的内层 join 来传达首次故障。runTenantRuntime 保留独立 Worker 宿主用法。

RuntimeService 在接管时复制生命周期配置和循环列表，并绑定原 queue.drain/close、database.close 到原实例。调用方后续替换配置对象的 signal、回调或适配器方法，不会把当前实例的排空与关闭转移到新资源；类私有字段仍使用原接收者。此快照不冻结外部服务自身的可变业务状态。

`TenantRuntimeOptions.deliveries` 可安装实际 EventDeliveryQueue 与冻结 Outbox 消费者，循环由 createTenantRuntimeLoops/runTenantRuntime 及 HTTP tenant 宿主直接监督。每次从投递提示解析的当前身份同样经过共享组织/Workspace/acting organization 绑定，队列数据本身不赋权。onHandled 现在收到有界 TransactionOptions，最多等待 10 秒并传播取消；它在 Owner 提交与队列确认后执行，副本通知不能修改原回执，停机不会等待不合作观察 Promise。队列确认本身仍须由 Adapter 完成后才能关闭依赖。

实际 pg-boss 重投场景已用宿主生成的 delivery 循环验证原 Inbox 复用与确认；其余租户循环在该子场景未同时运行。完整 HTTP 提案到业务执行的联合链路仍未验收。

Delivery Worker 接管时复制消费者 ID/事件类型，并绑定原 fenceRefs/admit/handle、身份解析、队列 fetch/complete 和观察方法。调用方在等待投递时改写安装对象，不会替换本次消费的准入或 Owner 实现；逐次真实身份和 Grant 校验不变。绑定保留方法接收者，但不冻结回调闭包及外部业务状态。独立 Worker 的受信身份解析仍可处理明确安装的租户提示，租户宿主另加共享租户绑定。

原生重投恢复场景现由 runHttpService 承接：Owner 已提交但确认丢失后，新建数据库连接与 pg-boss Adapter，通过宿主生成的 delivery 循环恢复原 Inbox；实际 HTTP 响应后 SIGTERM 触发当前 QueueAdmissionDirectory/Grant 下的排空，报告保存期间数据库仍可用，随后依赖和进程监听器释放。测试实际消费 Ledger Owner 效果，只有 delivery 循环运行，不能代替完整 Action 或全部租户循环联合验收。

QueueAdmissionDirectory.drainContexts 的 context 现在使用 ContextSource，接收独立的 deadline、AbortSignal 和 readOnly=true。identityTimeoutMs 默认 10 秒、范围 1–30000 ms；先完成有界当前身份解析，再开始原队列 timeoutMs 排空窗口，工作取消信号不复用。身份不合作时拒绝超时，不注册句柄、不调用 drain，RuntimeService 仍关闭依赖。实际 IdentityIngress 安装应直接转交收到的 options；不能在回调里重新扩大期限。报告存储和依赖关闭回调自身的有界性仍是安装责任。


## 2026-09-09：安装检查的租户宿主装配

TenantRuntimeOptions 新增显式可选 packInspection。createTenantRuntimeLoops 将检查 Worker 纳入与其他循环相同的组织/Workspace/acting organization 绑定及 joinRuntimeLoops 取消监督；未配置时不创建 Pack 检查循环。检查身份仍要求同组织管理用途 Service，不从其他用途的 Worker 身份推导权限。

宿主/服务关闭测试验证可选安装、无响应身份源被取消、错误用途/主体在调用准备前拒绝，并保留既有同伴失败、HTTP 停入站、排空和依赖关闭顺序回归。真实安装场景改为通过租户宿主生成的 Pack 循环完成联合观察恢复并退出。该集成只启动实际 Pack 循环，其他循环各有既有测试，不能据此证明全部生产 Worker 同时运行。长集成上下文有效期从 60 秒调整至 180 秒，独立超时/到期拒绝用例保留。

宿主/服务回归 12 项和真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复全量。生产默认配置、真实 Secret/身份提供器和所有 Worker 联合运行仍待完成；本装配不执行迁移 SQL，不产生租约或 Enable。完整领域/回填/投影验证、ObjectStore 和正式结构/联合观察契约继续保留为缺口。验证记录：[安装检查宿主](../../../../docs/development/verification-2026-09-09-pack-inspection-host.json)。


## 2026-09-09：Pack 检查宿主配置固定

createTenantRuntimeLoops 在生成循环时固定 Pack 检查配置，而非等循环启动后重新读取 input.packInspection。Grant 列表深复制，身份源、发现准入、准备和通知方法保存原方法并绑定接收者，页大小、周期与期限也固定。运行期间依旧通过原治理回调查询当前权威状态；配置快照不冻结真实 Grant 或治理有效性，也不隔离回调内部可变状态。

新增方法私有字段接收者及配置替换回归；真实安装场景在循环创建后替换身份源、准备、可见性、Grant 列表和页大小，验证已安装循环仍走原始签名/治理与观察恢复流程。宿主/服务测试 13 项和真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。该修改只覆盖 Pack 检查配置，其他循环的配置生命周期需要分别核对。

生产默认配置、完整领域/回填/投影验证、迁移执行租约、ObjectStore、结构与联合观察正式契约、Enable 及 ABH 其他模块的整体缺口仍待完成。验证记录：[宿主配置固定](../../../../docs/development/verification-2026-09-09-pack-host-snapshot.json)。


## 2026-09-09：逐 Pack 安装阻塞诊断

PackInspectionWorker 新增可选 onBlocked(candidate, reason, options)，逐项报告 Missing 或 Ambiguous，保留原有分页计数；Ready 的检查结果和证据 Ref 继续通过 onObservation 返回。通知只提供恢复诊断，不是持久验证证据。宿主在创建循环时固定回调并保留原接收者；Worker 传入候选副本，并限制通知的期限和取消。通知失败仍让循环失败并交由宿主管理，不吞掉诊断故障。

新增真实 Service/数据库回归覆盖两种阻塞、分页计数、禁止产生观察、装配后替换回调无效，以及通知挂起时取消退出。验证结果见[逐项诊断](../../../../docs/development/verification-2026-09-09-pack-inspection-diagnostics.json)。

持久安装 Job、doctor 查询、完整执行 Worker/租约、领域/回填/投影验证及 Enable 尚未完成。


## 2026-09-09：有界观察选择与自动恢复装配

新增 selectMigrationState：完整有界页中的唯一结果才返回 Selected，无匹配返回 Missing；已发现多个匹配返回 Ambiguous，仍有未扫描内容且匹配数不足两个则返回 Incomplete。单页最多读取 100 个候选，零个或一个匹配不能在扫描截断时证明不存在或唯一。选择仅为当前发现时刻的恢复提示，不是持久租约；后续仍执行真实证据与目标状态复查。

preparePackInspection 新增显式 recoveryDiscovery 配置，与手动 recovery Ref 互斥。唯一观察进入原 Ref 恢复，完整扫描无观察进入新的实际检查；多观察和截断分别返回 ObservationAmbiguous、ObservationSearchIncomplete，均在创建目标连接前返回。Worker 将这两类阻塞传给 onBlocked，并在 onPage 独立计数。配置在准备入口固定。

真实安装用例的首次观察与宿主重启恢复均使用此装配；重复真实 Artifact 场景验证两类阻塞不会打开无效目标 URL，截断且没有当前环境匹配也不会误报 Missing。证据见[观察选择与自动恢复](../../../../docs/development/verification-2026-09-09-migration-state-selection.json)。严格恢复中发现旧证据与当前状态不一致仍拒绝，不自动替旧证据生成新事实。

生产默认配置/配额、持久 Job/doctor、观察索引、执行租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：Pack 检查租约 Owner 装配

新增 claimPackInspectionLease、renewPackInspectionLease、releasePackInspectionLease 和 requirePackInspectionLease，复用 runtime.work_leases 唯一租约来源及现有 Command/Receipt/Audit 事务。管理 Service 必须拥有当前组织的 data-impact Grant，实际 Staged 安装记录须与候选完整一致；各次租约变更前后重新验证。工作占用不授予 SQL 执行、迁移完成或 Enable 权限。

同 Worker 的重复有效认领不续期、不增加 token；其他 Worker 竞争被拒绝。续约更新 Ref 版本且保持 fencing token，释放后接管增加 token。require 检查按当前 token 识别所有权，旧 Worker 迟到操作不能借旧 Ref 或队列回执继续。调用提交前检查时，调用者须先获取其余 control/deployment 锁，再获取租约聚合锁；租约上限仍是 30 秒。

实际安装记录/Service/Grant 测试覆盖重复与竞争认领、失效候选、缺 Grant、Human 拒绝、续约 CAS、释放和接管后旧 token 拒绝；并回归通用租约的真实数据库时间过期和身份撤回。证据见[Pack 检查租约验证](../../../../docs/development/verification-2026-09-09-pack-inspection-leases.json)。

本批完成租约 Owner 操作及检查入口，尚未把周期心跳、失租取消、结果事务 fencing 和退出释放装入 PackInspectionWorker。持久 Job/doctor、生产调度、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：检查与观察结果事务 fencing

InstalledMigrationInspectionRun 新增显式 lease 绑定，经 preparePackInspection 和 Worker 固定传递。真实检查/恢复完成且专用目标已关闭后，在管理事务提交前验证当前租约；新观察的独立 Artifact 事务在 Command 准入和最终读回后再次检查。检查使用实际 producer 的 ownerRef 与包摘要约束租约目标，不能借其他 Pack 的有效租约提交。租约 Ref 版本可因续约变化，所有权仍由实际 fencing token 判断。

真实集成发现 Pack 治理锁先于原 DurableExecution 租约锁会违反全局锁顺序，因此 WorkLeaseOwner 对 installed-pack 目标统一使用后置 WorkLease 聚合命名空间；所有认领/续约/释放/检查使用同一键，其他目标维持既有顺序。没有放宽锁顺序检查。

实际 Service 宿主恢复使用显式租约，并验证准备期间更换 token 配置不会重定向检查。另验证释放后旧租约恢复拒绝、实际 Artifact 写入期间租约到期导致事务回滚、合法新 token 重试只保留一份观察、旧 token 即使重放已有 Artifact 仍拒绝，以及错误 Pack 绑定拒绝。证据见[检查结果 fencing](../../../../docs/development/verification-2026-09-09-pack-inspection-fencing.json)。

本批只在显式提供 lease 时启用这些检查；Pack Worker 的自动认领、周期心跳、失租取消和退出释放仍待装配。Control fences 当前使用排他行锁，后续心跳调度必须考虑检查事务的锁占用及租约期限，不能假设可以在持锁期间无限续约。持久 Job/doctor、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：Pack Worker 租约生命周期

PackInspectionWorker 新增可选 lease 配置，workerId 标识运行实例，默认每 10 秒续约 30 秒租约。每个候选先认领，再进入准备、真实检查和观察事务；实际租约绑定由 Worker 注入并使用既有提交 fencing。竞争认领通过明确的 WorkLeaseBusyError 区分，不吞掉其他权限/存储错误；仅认领竞争转为 LeaseBusy 诊断与分页计数，已进入工作后的错误仍传播。宿主创建循环时固定租约配置。

新增 withPackInspectionLease 生命周期：续约失败或本地租约期限到达会取消 scoped signal；操作期限取单次预算与已知租约期限的较早者，不因心跳无限延长。退出时停止并等待续约，再用独立的 10 秒清理期限取得同一 token 的最新 Ref 版本并释放，避免续约提交/取消竞态。已过期或被接管的旧 token 不释放新所有者；其他清理失败保留错误，未能释放的租约仍由数据库期限回收。

真实测试覆盖续约 Ref 版本增长、双实例竞争、实际接管后的旧任务取消且新租约保留、Worker 准备取消后释放、宿主配置替换无效，以及自动认领后恢复原观察并释放。手动 run.lease 与 Worker 自动 lease 不可混用。证据见[Worker 租约生命周期](../../../../docs/development/verification-2026-09-09-pack-inspection-lifecycle.json)。

此能力由显式配置启用，不是持久安装 Job 或默认生产服务。Control fences 的排他锁可能延迟续约，工作仍受既有租约和事务期限限制；生产心跳容量/延迟 SLO 尚未验证。持久 Job/doctor、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。

本批最终 Core 全量 463 项通过，无失败或跳过；类型、构建与 API 检查通过。清理只忽略 WorkLeaseNotCurrentError 这一明确失去所有权的结果，其他权限/完整性/上下文错误继续传播；非 Error 的抛出值也保留。专项日志在最终清理错误分类前生成，最终源代码以本批全量日志为准。

## 2026-09-09：共享运行时的数据库冲突恢复

Publisher 的单事件发布、DeliveryWorker 的同一已领取消息消费、ConsumptionWorker 的单路由覆盖记录加入显式 retryDatabaseConflict。仅 PostgreSQL 锁不可用、死锁和串行化冲突（55P03／40P01／40001）允许恢复，初次之后最多三次，1／2／4 秒退避并加入 ±20% 抖动。发布与消费总期限为 30 秒，覆盖记录为 10 秒；上下文与单事务期限仍按原规则约束。恢复依靠原事件、冻结路由和 Inbox／Command 幂等事实，每次重新验证当前权限。

该机制不装配在 Database.transaction 通用入口，不重试任意外部副作用、巡检尝试、队列 fetch 或 complete。权限、完整性、普通语句超时和连接不确定错误直接传播；取消中止退避并保持原生未确认消息的恢复责任。运行时关闭仍按真实未完成工作记录 drain，不将取消视为已排空。

## 2026-09-09：暂停通知恢复 Worker 与 Runtime 宿主

新增 runSuspensionRecoveryWorker，持续分页发现指定事件/能力/业务范围的持久页面，并执行实际 Action 暂停消费。整轮完成后重置 UUID 游标进行重扫；每页的所有效果及 onPage 确认成功后才推进游标。失败向宿主抛出，重启重扫仍复用已提交 Inbox。不同页面分别有界，停机取消可中断身份源、读写和观察回调。

TenantRuntimeOptions.suspensionRecovery 可显式安装多个范围的恢复循环，加入现有共同租户绑定及监督收尾。安装配置、引用和回调在 createTenantRuntimeLoops 时固定，业务 Service 身份与页面发现身份分别刷新，组织/Workspace 漂移拒绝。

真实签名链联测验证连续两轮扫描只保留两条 Inbox、每轮重新获取身份、身份范围漂移拒绝、卡住的身份源被停机取消，以及实际 Runtime 生成的恢复循环在安装对象被修改后仍处理原事件。已有队列投递与扫描重放共同使用原事件 Inbox。

当前仍要求宿主明确安装 eventRef/capability；全局暂停事件/业务范围发现、故障任务隔离、Run Owner、Retire/兼容查回及生产治理尚未完成。验证见 [暂停恢复 Worker 记录](../../../../docs/development/verification-2026-09-09-suspension-worker.json)。

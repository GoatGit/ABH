# Human Exception 内部装配

ExceptionOwner 为已 Closed Operation 的当前矛盾报告建立不可变责任绑定。proposal 从实际报告、Operation/Plan 和 ResourceFence 推导 source、影响上限、冻结 Ref 与 proposalDigest。openTerminalException 要求独立 Service/abh.operation.reconcile Grant，作用对象是实际 reportRef；不能借原执行 Grant 创建事项。

安装方提供 Exception 类型的 Request、DecisionPackage、责任席位与资格检查。Owner 验证 subject/version、proposalDigest、报告证据、影响上限及责任类型，再调用现有 DecisionOwner；异常记录、Request/Decision、CommandReceipt、Audit/Outbox 同事务写入。每个报告与 Request 各只绑定一个 Exception，不同 Command 创建同一报告会冲突，同 Command 重放先重新验证权限。

没有当前合格责任人时 Request 保持 Unresolved，异常证据不会丢弃；有责任人时使用既有冻结席位、候选资格与 Decision 流程。责任状态从 requestRef 回读，技术状态从 sourceRef 对应的 Operation 和 ResourceFence 回读，ExceptionRecord 不复制技术 Outcome。批准/关闭责任事项不触发解冻、外部补偿、预算释放或终态回退。

当前只实现 TerminalContradiction 类别的创建与责任绑定；ResolveException 注册处置类型、Correction/Domain Result 新版本、治理解冻仍未实现。资格检查和路由配置是宿主安装接口，Fixture 的回调不能充当正式生产治理。调用者在任何资源锁之前声明所有资格检查使用的控制 fence。


ExceptionOwner.inspect 提供内部诊断读取，必须传入安装的当前查询 admission。权限检查后按资源锁、父 Action、Human Request 的顺序锁定，回读实际 Request 版本/状态、Operation position、当前资源冻结报告与未决占位。验证 Request 的 kind/subject/proposalDigest/原报告证据和持久 Exception 一致，不能通过替换责任请求将异常解释成已处理。返回的是当前技术状态与当前责任状态，不从创建时 Request Ref 的版本推断当前状态。该方法需要可取得行锁的事务，尚非公开 HTTP/CLI 查询接口；正式查询动作/用途治理仍须宿主装配。


DecisionOwner 在响应前验证候选仍属于 Request 的冻结席位、subject/proposal/routeRevision 绑定一致，并回读实际 Assignment 的有效期、状态、责任类型、范围及当前 Human 成员身份。ALL 汇总创建完成凭证前，对每个已批准 Decision 再次回读同一组事实；先前审批人已撤销时拒绝完成并回滚最后一次响应。安装的 submit/revalidate 仍负责当前 Grant、职责分离及领域条件，lock 回调仍须锁定相关控制 fence，不能以这些结构校验替代生产授权装配。


runExceptionWorker 周期扫描当前 ResourceFence.blockedByReportRef 指向且尚未有 human.exceptions 的报告，每页 1—100 项，默认每 500 ms 扫描，扫完重置游标。安装 route 提供当前责任提案，10 秒期限与停机信号共同约束；替换 reportRef 的路由结果拒绝。每项刷新当前 Service Context 后经 openTerminalException 验权，按报告 ID 使用稳定 Command key 与实际 payload digest 创建事项。

并发路由可能产生不同 Request UUID；冲突后必须再次验证当前权限并确认已有持久事项，或旧报告已经不是当前冻结原因，才允许略过。当前冻结仍存在且提案错误时向宿主报错，不能静默丢弃。事项创建失败不撤销技术冻结。没有候选人的 Unresolved Request 视为已建立事项，不反复创建；候选补充后的责任重路由尚未实现。

runTenantRuntime.exceptions 可安装该循环。安装 route/eligibility 仍需可信治理实现；该扫描不订阅外部系统、不执行 ResolveException、不解冻，也不构成连续保留水位或生产容量验收。

34 号迁移为资源组织与当前 blockedByReportRef.id 建立表达式索引，服务于异常发现和冲突后的当前冻结核验。该索引改善访问路径，不代表扫描容量或 SLO 已通过生产验收。


retryResponsibilityRoute 提供 Unresolved 的原席位重试入口，使用独立 abh.responsibility-requests.retry-route Grant，Command 重放前仍检验当前权限。DecisionOwner.retryUnresolved 对传入 Request 与当前持久 Request 做完整一致性校验；席位、提案、证据、期限和路由版本均不能在该入口改写。候选仍不齐时返回原 Unresolved Ref；资格恢复后，Decision 创建与 Request 版本推进/转 Open 在同一事务完成，不创建新 Request、不生成完成凭证。后续仍需实际 Human Decision。

同一 Command 重放保持原结果，尚未可路由的请求后续再次尝试须使用新 Command key。并发重试以 Request 行锁与版本 CAS 竞争；旧版本不能重复创建 Decisions。资格目录/frozenPolicyRefs 的正式治理、替换席位与新 Route revision、委派/升级及自动重试调度仍未实现。本入口只恢复同一冻结配置的当前资格，不代表完整责任重路由。


Workspace 范围在责任链中持久继承：新 Assignment/Request 使用当前 Context 的 Workspace；初始路由和重试创建的 Decision、完成凭证从原 Request 继承；批准效果生成的 Grant/Authority 从完成凭证继承。组织级来源在 Workspace 内处理时仍保持组织级范围。资格读取、完成凭证核验、批准 Grant 回验和 Authority 效果重放拒绝其他 Workspace 或缺少对应 Workspace 的 Context。跨生命周期的凭证读取保持专用用途核验，不将审批用途机械替换为执行用途。

这不替代安装方对当前 Grant、管理权限、影响范围和对象绑定的校验；旧数据中 workspace_id 为 NULL 的行无法仅凭现有记录可靠归属，不做猜测回填。生产迁移已有历史数据时须提供来源证明。

Control 的通用 Grant 准入、执行 Authority 候选选择与加锁后回读、Service Grant/Scope 委托来源及 Grant/Authority 撤销也校验 Workspace。Scope Authority 创建的历史重放不会返回其他 Workspace 的记录。

通用 CommandReceipt 同样保存创建 Workspace，重放时先当前准入再校验范围；错误 Workspace 不返回历史 resultRef，也不再次执行 Owner。该检查不改变原组织/主体/Command/幂等键唯一性。


责任请求整体到期由 DecisionOwner.expire 持久化处理：在组织 fence 和 Request 行锁下核对版本、数据库时间及当前 Open/Unresolved 状态。Pending Decision 转为 Expired，已有 Approved/Rejected 等历史记录保持原样；Request 转 Closed 并记录最新 Decision Ref。全部 CAS、Audit、Outbox 同事务，不创建完成凭证、Grant 或 Authority，也不修改关联 Operation/资源冻结。

expireResponsibilityRequest 是内部 Service/abh.runtime.deliver 入口，使用独立 abh.responsibility-requests.expire Grant，重放前仍验证当前权限。runResponsibilityExpiryWorker 以数据库到期时间扫描、每页最多 100 项、默认每 500 ms 重扫；每条刷新 Context 后处理，固定组织/Workspace/Service 身份，版本竞争留到下轮回读。35 号迁移提供待到期 Request 的部分索引；runTenantRuntime.responsibilityExpiry 可装配循环。Request 关闭事件沿现有 Wait 通知链传播，等待结束本身不代表审批通过。

当前处理 Request 整体期限；独立 DecisionPackage 提前到期后的重提问、预配置升级链、自动重路由和正式部署治理仍须实现。

Action 集成已覆盖到期关闭 → Wait Port signal → 固定 Outbox 路由 → Inbox/Action 消费者，以及 Wait Deadline 先到、关闭事件后到两种顺序。重复 signal/并发消费只保留一个 Wakeup 和一次业务绑定版本推进；Action 仍为 Validated/NotStarted，没有完成凭证或执行 Authority。


责任资格撤销使用内部 abh.responsibilities.revoke Command。revokeResponsibilityAssignment 先统一锁定安装方声明的管理/候选/目录 fence，并验证当前独立 Grant；命令重放仍验证准入。revokeResponsibility 在组织 fence 下核对来源版本与 Workspace，检查仍在期限内 Open/Unresolved 请求中引用该 Assignment 的必需冻结席位。每个受影响席位必须已有同责任类型、范围匹配、当前有效且安装 candidate 检查通过的剩余候选，否则 LAST_REQUIRED_RESPONSIBILITY。两个并发撤销不能各自以对方为剩余候选同时成功。

replacementRef 仅表示治理依据，须当前有效、类型/范围/期限覆盖来源，且不能将组织级责任替换为 Workspace 级责任；不会直接改写冻结席位。隐藏 Workspace/用途的必需依赖保守拒绝，治理应先通过合法路由变更处理。安装 continuity 必须检查管理权限、证据和未体现于当前 Request 的必需岗位，fenceRefs 必须包含这些检查和候选资格依赖；Fixture 回调不是生产治理实现。

撤销将 Assignment 置 Revoked，并原子提升对应控制 fence epoch/stopFlag；旧审批主体后续提交和批准回验失败。36 号迁移保存不可变 responsibility_revocations（原 Ref、reason、evidence、replacement）并增加冻结候选查询索引。Assignment revoked 与 fence advanced 事件随 Audit/Outbox 同事务提交；当前尚无自动路由重算消费者，现有冻结候选会在下一次提交时回验，不宣称已经实现新 Route revision/委派/升级。


WithdrawPending 由 withdrawDecision 内部装配既有 abh.decisions.withdraw 契约。入口验证 abh.decision.review 下的当前独立 Grant，并在重放时继续执行管理 admission。安装方声明全部 fence、按公共顺序锁定原事项，再由 source 回读实际取消/替换证据。Owner 锁定 Request 后回验版本/期限/源绑定，拒绝撤写 Approved 等历史决定；目标必须仍是 Pending。

原事项撤回时，Request 转 Withdrawn，其当前路由中全部 Pending Decision 转 Withdrawn；已批准/拒绝历史保留。37 号迁移新增不可变 decision_withdrawals，保存目标原版本、请求原版本、理由及实际源证据，和 Owner CAS/Audit/Outbox 同事务提交，无批准凭证、授权或预算变更。新 Request/Decision 明确登记 abh.decision.review 用途，Decision 继承 Request 的用途与 Workspace；旧记录不猜测回填用途。

Action 审批 Wait 订阅 Request.withdraw，回读 Withdrawn 后可通知 SourceClosed。已 Cancelled Action 仅在 Request 确实 Withdrawn 时接受该结束通知，保留取消状态。真实集成验证未取消时拒绝、实际取消版本证据、Wait signal、冻结 Outbox 路由与业务消费者；withdrawal 与最后批准竞争只允许一个终态提交。SourceClosed 表示责任事项终止，不表示批准。

该实现尚未挂载公开 HTTP/SDK，也不提供自动撤回原 Action、已生效 Grant 撤销或跨域通用 source 实现；安装方必须提供当前主体管理与事实验证，不得使用 permissive Fixture 作为生产安装。

责任资格还必须覆盖原 Request 的 Workspace 范围，而不只是当前调用者可访问的 Workspace。组织级请求不能使用仅限工作区的候选作为必要席位替代人；原席位重试、提交/完成回验、批准凭证核验、授权效果签发和撤销连续性检查共享这一约束。currentResponsibility 的 requiredWorkspace 为 NULL 表示要求组织级覆盖，省略则按调用上下文范围读取。


reviseResponsibilityRoute 提供内部 abh.responsibility-requests.revise-route 入口，使用当前独立 Grant 和安装 admit（包括历史重放）。fenceRefs 收集全部政策、目录、委派和候选资格依赖；govern 必须在这些锁下核对实际 frozenPolicyRefs/directoryRef/证据及席位变更合法性。传入 Ref 本身不是政策已核验的证明。

DecisionOwner.reviseRoute 要求当前 Open/Unresolved 的精确版本、新 requestRef.version 与 routeRevision 各递增一；原 subject/version、proposalDigest、evidenceRefs、kind 和整体 expiry 均不可改变。原必要槽位不能删掉、降为可选、改变责任类型/组织/ANY-ALL/依赖关系或减少席位。合法替换使旧 Pending Decision 进入 Superseded，已批准历史保留，新路由全部使用 fresh Pending；当前版本不携带旧批准，后续必须重新响应。

38 号迁移的不可变 route_revisions 同时保存旧 Request 和完整新提案、政策/目录/变更依据。原 Open 先写 Unresolved（unroute），同一版本的 route-revised 使用 eventOrdinal=1；新席位全部有资格后再经原子 route CAS 进入 Open，否则新配置保持 Unresolved，可用 retry-route 恢复。旧路由迟到响应拒绝，不生成批准效果。事件、历史、新 Decisions 与 Request CAS 同事务。Action Wait 识别 unroute/route-revised 事件并回读实际请求，路由变化本身不会满足等待条件。

该入口实现新路由版本的持久化与治理安装边界；初始 ResolveRoute 政策目录生产实现、专用 DelegateSlot/Escalate、自动目录变更消费者、旧批准携带优化和跨组织路由仍未完成。

ActionApprovalWaitOwner 的来源游标包含当前 Request 版本已提交的最大 eventOrdinal；因此同版本 unroute/route-revised 顺序可以被 Wait signal 正确消费，Unresolved 仅更新观察结果，不创建 Wakeup。

ExecutionAuthorityOwner.issueEffect 在执行安装检查前，独立核对完成凭证的身份/组织、当前 Authorization Request 的版本/期限、Decision 行版本/状态、冻结席位和候选、实际 Human 响应人与当前 Assignment 绑定，以及 Package 的 Request/routeRevision/subject/proposalDigest/提交摘要。当前 Grant、条件和管理权限仍由安装检查负责；结构绑定不能由安装回调放宽。


runResponsibilityRoutingWorker 自动扫描当前用途/Workspace 内尚未到期的 Unresolved Request，固定 Service 身份、组织、Workspace 与用途（action.prepare 或 operation.reconcile），每页最多 100，默认每 30 秒扫描。每条在加载提案前验证独立 retry-route Grant，提案加载最多 10 秒且受停机信号约束；即使加载器不配合取消，也不继续进入事务。加载结果必须精确绑定扫描的 Request Ref，随后刷新 Context 并通过 retryResponsibilityRoute 再次验权和完整比对冻结请求。

每次扫描尝试用新 Command key，避免历史 no-op receipt 阻止资格恢复；失败资格仍提交原 Unresolved Ref 的 receipt，因此部署需评估扫描频率与 CommandReceipt 保留容量。版本竞争或加载期间整体到期留给后续扫描/到期 Owner；权限、提案或其他错误向宿主报告。runTenantRuntime.responsibilityRouting 可装配循环。

可选安装 proposal 仍须返回与持久冻结记录完全一致的提案，不能提供新席位提案；默认读取 Owner 保存的不可变提案。全局租户发现和新路由/委派/升级调度仍未实现。测试覆盖资格恢复、并发 Worker 只分派一次、错 Ref、缺 Grant、加载中撤权以及不配合回调的停机。


39 号迁移新增 human.routing_proposals，按 request_id/route_revision 唯一并仅授予 SELECT/INSERT。DecisionOwner.open/reviseRoute 在同一事务保存完整 OpenResponsibilityRequestPayload，继承原 Request 的 Workspace 与用途。getRoutingProposal 只返回当前精确版本的 Unresolved 原提案，核对请求正文、包摘要、事项/路由/槽位/期限绑定；记录缺失或损坏直接拒绝，不从最新目录猜测原问题。

恢复 Worker 未安装 proposal 时默认读取该表，加载阶段的版本竞争留待后续扫描。可选外部加载器保留既有期限/取消约束，但不能替代缺失的持久冻结包；历史缺失包须经有来源证明的单独维护流程恢复，不能直接重试。测试包含新连接恢复、默认 Worker 资格恢复、新路由快照、不可变权限、Workspace、损坏拒绝及创建/改路由回滚。

retryUnresolved 在 Request 锁下比对完整持久 OpenResponsibilityRequestPayload，包括所有 DecisionPackage 内容。重新计算合法 packageDigest 也不能替换原问题、风险、影响上限或期限；自定义加载器与直接内部调用受同一检查。需要修改问题时必须使用受治理的新路由路径。


DecisionInboxOwner 提供内部当前待办 get/list 读取。安装 admit 必须验证当前身份、查询权限和所需控制 fence，空页也执行；每个实际 Decision 还通过独立 abh.decisions.read Grant 校验。Pending 仅返回当前 Human 在当前冻结席位上仍具有效资格、且 Request/Package 未过期的事项；已提交历史仅向实际响应人开放。安装 canRead 负责证据可见性与领域限制，不能以登录或角色直接替代。

列表按状态、Request kind、截止上界与 UUID 游标过滤，每次最多扫描 100 条，按扫描末行返回 nextCursor；经权限过滤的空页也可能有后续游标。调用者必须继续到 nextCursor 缺失，不能用 data.length 判断结束。组织、Workspace、用途与软删除在扫描和逐项回读都验证。该接口不是管理员全局查询，尚未为未响应者提供终止事项历史列表。

当前返回内部 DecisionRecord 页，不伪造 EffectSummary、availableActions 或连续投影 watermark；公开 DecisionView/QueryMeta、HTTP/SDK 与字段裁剪响应仍待正式装配。查询 admit/canRead 是必需安装接口，列表容量与查询 SLO 尚未验收。


服务装配层 `server/http.ts` 已将 withdrawDecision 接到显式安装的 HTTP 撤回命令。身份经实际 IdentityIngress 核验，私有证据绑定到单次传输调用；Grant 和治理检查仍在 Owner 当前事务内执行。withdrawDecision 现在返回持久回执的原 commandId，保证 HTTP 并发/重放响应稳定。生产来源治理与凭据解析必须另行安装，Decision 查询/提交和完整 Server 尚未装配。

submitDecision 提供独立的公开提交业务入口：事务内检查当前 submit Grant、冻结席位与当前 Human Assignment，安装准入负责来源/MFA/证据/职责分离并在重放时执行；资格回调返回的 decisionGrantRefs 必须来自已独立验证的 Grant 集合。响应返回持久回执原 commandId；旧 route 或责任撤销后不凭历史命令绕过当前资格。

最终 ALL 批准时，安装 effects 必须返回非空、effectKey 唯一且目标精确匹配原 subjectRef 的效果计划。40 号迁移的 human.decision_effects 保存不可变 DecisionEffectIntentRecord：整体完成凭证、全部必要 Decision、Request/routeRevision/effectKey、目标 Control/Domain、预分配的目标命令引用及来源提交命令。效果意图与最后一项批准、完成凭证、Audit/Outbox/CommandReceipt 同事务；缺计划/错目标/重复键全部回滚。未完成 ALL 或拒绝不创建效果。

效果记录继承原 Request Workspace 和用途，只表达 Pending，不是目标 Owner Receipt。HTTP SubmitDecision 返回此命令实际创建的稳定 effectTrackingRefs，前一席位重放不会因为后来完成而改变响应。目标 Owner 消费、应用/阻塞/放弃回执、重投 Worker 和公开 EffectSummary 查询仍需实现；不能把效果意图称为 Applied，也不能将预分配 commandRef 视为已执行命令。

applyControlDecisionEffect 已将 Control 类型的 Pending 意图接到实际 ExecutionAuthorityOwner。意图绑定的 commandRef 作为固定命令 ID，幂等键由 effectRef 派生，输入摘要包含意图 Ref 与完整签发参数。内部 issue-effect 命令独立检查 V1 指定的 abh.execution-authority.create 管理 Grant；目录允许 Action 准备用途，仍须明确 Grant，不能把 submit Grant 当成管理权限。

首次执行在同一事务创建有限 Service Grant、Action Authority、各自的 Audit/Outbox、41 号迁移的不可变 DecisionEffectReceiptRecord 和命令回执。记录 Applied 前回读真实 Authority/Grant，并核对两个创建事件的来源命令；旧的部分签发或其他命令结果不能冒充本次效果完成。Applied 事件使用效果版本 2，原 Pending 意图保留不可变版本 1。

getDecisionEffectReceipt 校验对应的实际 CommandReceipt、输入摘要及 Authority 结果 Ref；调用者仍需当前查询权限。Applied 表示历史完整提交，不承诺 Authority 目前仍有效。执行重放会重新检查管理 Grant/治理，然后返回原历史回执，不重新签发或激活撤销记录。范围/来源资格由既有 AuthorityEffectChecks 在首次执行时复验；所有相关 fence 必须在安装的 fenceRefs 中提前声明。

当前只实现同库 Control 效果，Domain 效果、Blocked/Abandoned 处理、新责任事项、冻结参数装配、Outbox/Worker 重投和公开 EffectSummary 查询仍待完成。

42 号迁移新增不可变 control_effect_inputs，复用 IssueExecutionAuthorityPayload。prepareControlDecisionEffect 在独立事务检查当前 create 管理 Grant/治理，以效果专用 advisory lock 串行冻结完整签发参数，继承意图 Workspace/用途。相同输入复用原记录，任何 ID、范围、额度引用或期限变化均拒绝。冻结不是授权/效果回执；实际 Apply 仍完整复验。Apply 现在要求存在持久原参数并逐字段一致，执行事务回滚不删除原参数，不能在恢复时重新生成期限或 Ref。历史未冻结记录必须通过同一受权准备流程，不能猜测补填。

runControlEffectWorker 扫描当前 Service、Action 准备用途、组织/Workspace 下已冻结且尚无回执的 Control 意图。扫描空页也检查当前管理 Grant，每项加载前重新检查权限/治理，Apply 前再次刷新身份并进入完整 Owner 准入。刷新不能更换组织、Workspace、主体或用途；上下文加载有界且可取消。每页最多 100 条、默认间隔 1 秒，使用 UUID 游标；多 Worker 用同一意图命令 ID/幂等键竞争，回执提交后不再扫描。runTenantRuntime.controlEffects 可安装此循环。

Worker 不重新构造签发参数，不自动延长过期授权，不将权限/治理失败当作成功或生成新 Grant。错误向宿主传播并保留待处理意图；恢复合法条件后重启可查回原参数/回执。Blocked/Abandoned、新责任事项、按错误类别退避、全局扫描、容量/SLO 与队列事件驱动路径仍需完成。生产冻结参数的策略构建与治理必须明确安装，测试只证明显式 Fixture 链路。

Control Effect Worker 的 onPage 回调现在接收本次 TransactionOptions（deadline/AbortSignal），最多等待 10 秒；外部停机立即取消。回调不合作时 Worker 也会退出，迟到完成/拒绝不触发新页或未处理异常。回调超时/失败向宿主传播；已经提交的效果仍是已提交事实，不因观测回调失败而回滚或重新签发。

queryDecisionEffects 提供内部受权效果摘要读取。先经 DecisionInboxOwner 检查当前读取 Grant、本人资格/历史和 Package 可见性，再按当前 Decision 精确版本、Request/routeRevision 查找效果；逐项验证持久完成凭证及实际命令回执。canReadEffect 必须检查效果证据/回执当前可见性，不可见项不返回跟踪引用；回执存在但当前用途不可读时不降级为 Pending。

返回既有 DecisionEffectSummary 契约：无回执的意图为 Pending，实际完整回执为 Applied。Applied 是历史提交，即使 Authority 后来撤销也不改写为 Pending，更不表示当前可执行。每个 Decision 最多 100 项，超过上限拒绝而非静默截断。当前尚无 Blocked/Abandoned 事实路径；此函数不伪造 availableActions 或 QueryMeta，也尚未装配完整公开 Decision 查询响应。

readDecisionView 将既有内部查询装配为公开 DecisionView DTO：完整 package、status、effectSummaries 与 availableActions。读取前按公共顺序取得组织/Principal/读取及候选命令 Grant/安装声明 fence；读取权和命令权独立检查。只有 Pending 记录、实际当前 submit/withdraw Grant 和 canAct 的当前来源/MFA/职责条件都满足时才显示对应操作；命令权限撤销只隐藏操作，读取 Grant 撤销仍拒绝查询。历史 Approved/Rejected 等记录不显示这些命令。

canAct 不是授权凭证，实际命令仍完整重验；fenceRefs 必须提前声明全部来源/策略 fence。DTO 按现有契约校验，不泄漏内部 respondedBy、Grant 或候选责任字段，也不省略完整决定包中的风险/影响。该函数不生成 QueryMeta；连续查询水位、公开 HTTP get/list-inbox 和 SDK 仍需装配。

DecisionView 的提交操作在 canAct 返回允许后，还通过 DecisionOwner.assertSubmissionReady 检查当前冻结 Request/route、Human 席位、数据库期限、包摘要与依赖槽位。安装回调不能让缺少前置批准的事项显示提交操作；实际 SubmitDecision 仍执行事务内完整校验。权限和前置条件均只是查询时的提示，不是可缓存的授权。

提交事务与 DecisionView 的依赖判断现在复用同一规则：按冻结前置 Slot 的全部 seats 核对实际路由记录，每席恰好一项且属于 Request，必须 Approved 并匹配提交摘要、原事项/提案。路由读取核对行/正文的版本、状态、Slot/Seat/Request/routeRevision；软删除和当前 Workspace/用途不可见记录不计入有效席位。不能用“当前查到的记录都批准了”代替完整前置槽位。

getDecisionQuery 将单对象 Strong 视图封装为 DecisionQueryResponse。读取在当前组织/来源 fence 下完成，asOf 使用数据库 clock_timestamp，stale=false 表示当前内部 Owner 事实。watermark 以 decision-source/sha256 标记，对调用者组织/Workspace/主体/用途、Request 版本/routeRevision 和实际可见视图生成稳定摘要；相同来源与可见状态稳定，决定/效果/动作变化时改变。此水位是单对象源版本指纹，不能比较大小、驱动全局增量订阅、证明消费连续或授权清理 Outbox。

Core server 的 decisionQuery 安装已开放 GET /v1/queries/abh.decisions.get。IdentityIngress 核验身份后，一次性私有绑定进入查询；读权/动作 Grant 与证据/来源准入为必需安装，缺少安装不挂载路由。支持默认/Strong，Projection 明确返回 SCHEMA_UNSUPPORTED；ListInbox 分页响应和连续投影水位仍未完成。

listDecisionQuery 和 Core decisionInbox 安装已提供 Strong ListInbox HTTP。先锁整个页面声明的 fence 集合，独立校验当前读取 Grant（空页也执行），然后按已扫描 UUID 游标分页并逐项装配 DecisionView。默认 25、最多 100；权限过滤后的空页仍可能带 nextCursor。内部位置为扫描末行 UUID，HTTP cursor 为绑定身份/范围/筛选的加密续页令牌，不是权限凭证；使用游标仍检查当前租户/Workspace/用途和逐项读权。不同页是各自的当前读取，不承诺跨页冻结快照。

公开 type 为 RegisteredName，由必需 types 安装表明确映射 Goal/Authorization/Correction/Exception；未知类型拒绝，不将任意字符串猜成内部枚举。expiry 映射期限上界，status/limit/cursor 均验证。QueryMeta 使用数据库 asOf 与 decision-page 来源/可见结果指纹，不能用于事件消费或清理。Projection 仍返回 SCHEMA_UNSUPPORTED。

内部扫描仍使用 UUID keyset；公开 HTTP 不再返回原 UUID 游标。服务端 InboxCursorCodec 加密扫描位置并绑定当前身份/范围/筛选，避免被过滤空页暴露隐藏 Decision ID。页面指纹不包含令牌随机性，仍表示可见源内容；跨页快照与全局水位语义不变。


Pack 启用审批消费：verifyPackEnableApproval 复用 Action 的必需席位、责任和 Grant 当前校验，并校验 PackEnableProposal 自摘要、Pack exactRef、组织管理上下文、来源请求用途、精确证据集合包含关系和决定包影响一致性。使用前通过 approvalFenceRefs 收集锁，在同一 UoW 持锁复核。返回支持事实引用，不授予 Enable 权限，不证明制品验证通过；正式命令仍需独立 Grant、当前 Pack 证据读取和部署 CAS。

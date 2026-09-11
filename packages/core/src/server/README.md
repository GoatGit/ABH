# HTTP Server 装配

`createCoreHttpApp` 位于服务装配层，使用 adapter-fastify；领域 Owner 不依赖 Fastify。当前按显式安装开放 Decision 提交、撤回、单对象和 Inbox 查询。[类型化客户端](../CLIENT.md) 已提供独立浏览器入口；完整发行 Server、生产 bootstrap 和其他公开处理器尚未完成。

调用者提供已构造的 Database、IdentityIngress 和可信 credentials 解析器。解析器将请求凭据交给 IdentityIngress，后者通过 IdentityProviderPort、身份映射及当前组织/Principal/Membership/epoch 核验生成 VerifiedContext。组织和用途选择不等于授权。当前 IdentityIngress 仅提供同组织上下文，未开放客户端 Workspace 切换。

装配将已核验身份与服务端 requestId/correlationId/receivedAt 绑定，在私有 WeakMap 中按本次 AbortSignal 保存证据；业务处理器一次性消费该绑定，不从 JSON RequestContext 重新认证。身份解析、Grant 解析及业务事务共享期限与取消信号；超时不承诺业务回滚。

撤回安装必须提供 Grant 候选解析，以及 fenceRefs/admit/lockSubject/source 全部治理检查。Grant 在实际事务内重新核验，重放也重验当前准入。source 必须来自原事项已取消/替代的权威来源，不能把 reason 文字当证明。测试中无操作的治理回调只是明确 Fixture，不是默认生产实现。

HTTP target 和 If-Match 转为 DecisionRef，按 Owner 的 `{decisionRef,payload}` 输入规则计算摘要。返回持久回执的原 commandId 和 DecisionRef；相同幂等键重放不会用新入口 ID 冒充原命令。DTO 只包含公开 DecisionWithdrawnResponse 的字段，再经传输层校验和 ETag 输出。内部权限、epoch 和用途诊断统一映射 FORBIDDEN；其他错误仍受各操作公开错误注册表约束。

真实 PostgreSQL 测试位于 `test/decisions.test.ts`，覆盖实际 IdP Fixture → 身份映射 → 当前 Grant → 撤回事务 → Audit/Outbox/回执 → HTTP 响应，以及并发重放、异参冲突、陈旧版本、当前治理拒绝、身份 epoch 变化和 Grant 撤销。

提交安装额外要求当前资格/条件检查和完整效果计划。最终批准原子保存 Pending 效果意图及 Outbox，响应使用来源命令的稳定跟踪集合；同库 Control Effect 已提供独立当前准入、冻结输入、Applied 回执及恢复 Worker；Domain 效果和生产策略装配仍未完成。

`decisionQuery` 安装开放 GET `/v1/queries/abh.decisions.get?id=...`，由可信身份/当前 Grant/DecisionView 准入产生公开响应。默认和 Strong 支持，Projection 尚未实现并返回 SCHEMA_UNSUPPORTED。QueryMeta.asOf 为数据库时间，watermark 是 `decision-source/sha256:...` 对象来源/可见状态指纹，不是全局消费水位，不可用于订阅追赶或保留清理。ListInbox 通过下面的独立安装开放。

`decisionInbox` 安装开放 GET `/v1/queries/abh.decisions.list-inbox`，独立配置当前 Grant/视图准入及 RegisteredName→责任 kind 类型映射。默认 25、最多 100，支持 status/type/expiry/cursor；cursor 为加密续页令牌，空结果也可能继续分页。每页当前验权，跨页不承诺同一快照；页指纹水位不代表连续投影水位。

公开 Inbox 游标已改为 `ic1` AES-256-GCM 加密令牌，替代直接暴露扫描 UUID。decisionInbox 必须安装 InboxCursorCodec，使用明确提供的 32 字节密钥（生产从 Secret 安装取得）；相同密钥支持进程重启，多实例须共享密钥，换钥会使旧游标失效。默认有效期 15 分钟、最多 1 小时。令牌绑定主体、组织/acting organization、Workspace、用途、session/scope epoch 及规范化筛选；页大小可改变，筛选条件不可改变。解码失败统一 INVALID_ARGUMENT，客户端重新从第一页查询。该令牌不是权限，后续仍独立执行当前 Grant/证据检查。

`actionProposal` 安装开放 POST `/v1/commands/abh.actions.propose`。入口核对 target organization 与实际身份组织，再调用独立当前提案 Grant、来源/定义治理、正式 Artifact 和 ActionOwner。成功返回 202，使用原受理 commandId/v1 引用；Action 后续变化不会改变重放响应。所有来源/定义治理必须明确安装，当前测试 Fixture 不代表生产目录。内部事务与回放语义见 [Action 装配说明](../execution/README.md#公开-action-提案装配)。

`actionQuery` 安装开放 GET `/v1/actions/:id`，使用真实 IdentityIngress、当前独立读取 Grant、ActionViewAdmission 和 getActionQuery。对象无权返回 404；可用操作另验命令 Grant。默认/Strong 返回来源数据，Projection 明确拒绝。现有客户端 actions.get 已经通过真实数据库业务测试，提案 Location 可在此安装下查询。列表、取消与请求授权可通过下述显式安装开放。

`actionList` 安装开放 GET `/v1/actions`，支持 missionId/type/lifecycle/outcome/cursor/limit，必须提供 ActionCursorCodec、列表准入和 ActionView 准入。按 createdAt/id 倒序返回完整裁剪视图；空页也可能有加密 nextCursor。读权覆盖空结果，跨页独立验权。客户端 actions.list 已接入实际业务测试；取消与请求授权使用下述独立命令安装。

`actionCancellation` 安装开放 POST `/v1/commands/abh.actions.cancel`，明确提供 Grant 解析和来源 fence/当前准入。版本和幂等键来自正式 HTTP 协议，调用统一 cancelAction；202 返回原回执 commandId、objectRef/trackingRef。准备、零派发 Authorized 和已派发停止/对账按实际状态由 Owner 选择，客户端不能选择资源清理模式。重放仍重验当前权限。请求授权使用下述独立安装。

`actionAuthorizationRequest` 安装开放 POST `/v1/commands/abh.actions.request-authorization`。当前身份、固定准备 Purpose、独立请求 Grant 和来源准入通过后，以 If-Match 与幂等键原子保存原请求/命令回执/Audit/Outbox，返回 202 和原 Action objectRef/trackingRef。参数中的 authorityRefs 仅为断言，不赋予 Service 身份或执行权；后续安装的授权宿主根据持久请求推进。取消后原命令仍可在当前准入下重放受理回执，新命令继续检查版本和状态。客户端 `actions.requestAuthorization` 已有真实数据库/HTTP 链路测试。自动 propose→request 子命令和生产宿主默认配置仍未完成。

`artifactStorage` 显式安装开放 POST `/v1/commands/abh.artifacts.store-inline`。Create 目标为当前组织，复用正式认证、幂等键、Schema 和受理层检查；成功返回 201、原 Artifact v2 objectRef/commandId 与 ETag。只支持已有 64 KiB 惰性内联内容范围，不能作为大文件或二进制上传接口。数据用途、分级、保留、地域及来源治理必须显式安装。

`actionProposal.automaticAuthorization` 可显式提供自动请求 Grant 解析、purposeNames、来源 fence 和治理检查。安装后公开提案返回 202 前已原子保存其自动授权请求，供现有授权宿主扫描。缺少自动请求权限时整个提案失败，已完成提案的重放仍重验当前权限；不通过客户端依次请求授权来弥补服务端事务缺口。默认生产治理/宿主启动仍需安装。

运行宿主可将 `stopIngress: () => stopHttpIngress(app)` 安装到 RuntimeService，其中 `app` 是 createCoreHttpApp 返回值，stopHttpIngress 由 @abh/adapter-fastify 导出。钩子同步关闭新业务准入，等待认证和实际 Owner 收尾后才允许队列排空及数据库关闭；HTTP 超时响应不会被当成 Owner 完成。监听地址、进程信号、当前 drain 身份和报告持久化仍需显式安装。

`runHttpService`（server/service.ts）统一承接已安装 app、loops、queue/database、drain 身份与报告存储。它在监听前安装进程信号，按显式 host/port 监听成功后启动循环；任一循环或 onListening 失败均停止入口、取消同伴并走实际 drain/关闭。租户业务通过 `tenant: {database, options}` 安装；宿主直接监督每个租户循环，使内部故障立即停止 HTTP 准入。数据库必须与宿主关闭的 database 是同一实例。onListening 只确认监听地址，不代表业务依赖就绪，也不能据此宣称生产 readiness。

宿主接管服务生命周期；正常退出、端口占用、启动前取消及启动期间 SIGTERM 均执行依赖收尾。stopHttpIngress 的可选 pendingListen 让停机先关闭业务准入，再等待已开始监听完成后关闭传输，避免启动竞争留下端口。调用方配置无效时在接管前拒绝；生产身份、治理、原生队列/业务组合和默认发行配置仍需安装。回调与 Worker 必须有界收尾。

`createTenantRuntimeLoops` 生成共享同一租户绑定的循环集合，runTenantRuntime 继续用于独立 Worker 服务；HTTP 宿主通过 tenant 安装直接使用集合，避免内层 join 等慢速同伴收尾时入口继续接受请求。任何资源关闭仍等待全部循环与已接收 HTTP 工作完成。真实 PostgreSQL/HTTP 测试注入身份刷新失败并故意延迟同伴退出，确认端口先关闭、队列 drain 后执行；该场景不声称实际执行了业务授权或原生队列派发。

`runHttpService.startup` 可安装有序、具名的只读能力检查，监听及任何 Worker 开始前只执行一遍。检查名必须唯一；总期限默认 30 秒、最多 30 秒，后续检查共享剩余期限。verify 收到 readOnly=true 的 TransactionOptions，可直接传入 Database.transaction；真实测试核对 PostgreSQL transaction_read_only=on。检查失败、超时、SIGTERM 或晚到结果均不能开放监听，并走既有依赖收尾。

检查只能读取当前身份/Policy/Port/配置能力，不能创建 Principal、发布 Policy 或执行外部写入；这些准备工作须由各自 Owner 先完成。启动检查为受信安装，readOnly 标记不限制任意自定义网络或代码，回调必须遵守只读与取消约束。超时只结束等待，不宣称任意自定义代码已经停止；不得借检查回调启动独立后台任务。省略 startup 不宣称验证了能力；onListening 仍只是监听通知，持续健康与完整生产启动验收尚需实现。

启动检查失败以内部 StartupCheckError 标明 checkName，并在 cause 保留原错误（包括超时）。错误仍由服务退出的 AggregateError 汇总，不作为 HTTP 响应发布；宿主可按检查名定位身份/Policy/Port 安装故障。

`serviceIdentityCheck(database, {name, organizationId, principalId, purpose, context})` 可作为 startup.checks 的一项。它复制固定安装身份，拒绝未注册用途，以同一期限取得真实 VerifiedContext，并在只读 UoW 中通过 currentIdentity 回读当前组织、Service Principal、Membership 和组织 fence；凭据 epoch、scope epoch、当前状态或安装绑定不符均拒绝。当前仅覆盖无 Workspace 的同组织 Service；Workspace/跨组织必须使用对应治理实现，不回退为此检查。

该检查不签发身份、Grant 或 Authority，也不锁住未来权限；运行中的每次业务调用仍需原准入。数据库、身份提供者与实际 context 工厂仍由部署安装，不能把测试生成的 VerifiedContext 当作生产认证。完整生产启动还需 Pack/Policy/Secret/能力与保留责任检查。

Service 身份启动联测现已经过实际 IdentityProviderPort 结果校验、持久 identity_locations 映射、IdentityIngress/currentIdentity、startup、HTTP socket 与进程退出。Fixture IdP 明确使用 Workload 认证强度；成员撤销时从真实 Identity Owner 拒绝，HTTP/Worker 不启动，独立排空身份同样失败时不调用 drain。合法成员可监听并在 SIGTERM 后收尾。队列与 IdP 是明确 Fixture，未声称生产凭据或原生队列全链路已经验收。

上述 Service 启动场景的队列已替换为实际 PgBossDeliveryAdapter 和 QueueAdmissionDirectory：使用当前独立 drain Grant、真实组织/Principal/Grant fence，以及退出时重新取得的 Workload Context 排空原生队列。验证成员撤销不监听、正常退出产生真实空队列报告、启动后撤销 drain Grant 会拒绝排空且不伪造报告；所有路径关闭连接。IdP 仍为 Fixture，本场景没有入队业务 Job，不能作为完整 Action 原生执行证据。


`packInspectionDiagnostic` 显式安装开放 GET `/v1/queries/abh.pack-inspection-jobs.inspect?id=...`。配置提供 `grants(context, id, options)` 和 `admission.fenceRefs/current/read`，所有回调在安装时固定并绑定 receiver。实际后端只接受同组织管理 Service，核对当前发现 Grant、Job 与 Artifact 权限；无权对象返回 404。默认／Strong 返回同次数据库诊断，Projection 拒绝。响应包含实际进度 Ref、预算与下一步建议，不提交修改。`meta.watermark` 的 `pack-inspection-source/` 摘要不能用于订阅追赶或清理。

## 2026-09-09：能力候选 HTTP 查询装配

`createCoreHttpApp` 新增显式 `capabilityQuery` 安装，接通 `GET /v1/queries/abh.capabilities.query`。查询先由真实 IdentityIngress 生成私有 VerifiedContext，再有界获取部署安装的读取 Grant，调用既有业务用途候选查询，在事务内复核当前 Grant、Enabled 安装、完整能力集合及兼容／健康状态。返回 `PackCapabilityQueryResult`，保留精确版本／范围过滤和 complete 截断标志，不返回实现句柄。

创建服务时校验并绑定 Grant／fence／inspect 方法；缺少安装时不注册路由（404），安装不完整时拒绝创建。查询没有命令、审计或 Outbox 写入。实际数据库与 HTTP 联测覆盖有效非空候选、分页截断、无身份、非法过滤、缺少／撤销 Grant 及安装对象方法替换。非空包仍为行政元数据夹具，不能代替真实签名非空包端到端验收。生产部署默认治理安装、Gateway 调用装配、Suspend／Retire 仍未完成。

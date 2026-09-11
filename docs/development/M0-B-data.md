# M0-B 持久层第一批

本批将工程从纯契约推进到真实 PostgreSQL 事实。整体 M0-B 仍在进行，Identity/Control、静态 Release/Authority 及跨组织撤权竞争尚待完成。

## 本地证据

2026-09-07，Node 24.13.0 / pnpm 10.28.2 / macOS arm64，Docker PostgreSQL 16.13（镜像摘要 `sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51`）。使用独立容器、随机凭据和 `abh_runtime` 实际连接，不以管理员执行结果替代应用权限验证。

`TESTCONTAINERS_RYUK_DISABLED=true pnpm check`：207 项契约测试、19 项真实数据库测试；46 个生成制品、9 个公开 API 报告，类型检查与构建通过。Ryuk 辅助镜像下载在本地阻塞，因此本次采用 Testcontainers 显式关闭/删除夹具的路径；未修改其他项目容器。

## 本批已覆盖

- 所有 11 张租户表登记 Owner、Schema、RLS、可变性和公共事实合同；状态 CHECK 与生成制品核对。
- 漏租户条件、缺 Context、跨组织 INSERT/UPDATE、Owner 切换、关闭 RLS、DDL/TRUNCATE、Audit 改删均拒绝。
- 同池 A → 成功/回滚/取消/超时 → B 无数据串读；只读 UoW 和事务句柄失效。
- 相同幂等键的并发重投只执行一次；摘要冲突拒绝；撤权后重投先执行当前授权检查。
- 相同 Ledger 版本并发竞争只允许一次成功；后续 Ledger 不足使整组预留回滚。
- 超出 JavaScript 安全整数范围且保留 12 位小数的额度精确核对；实际费用超估算入账并冻结；capacity 完成释放且不累计 Usage。
- Audit 写权限被移除时，Ledger、Entry、Receipt、Outbox 同时回滚；流水可重算额度/预留。
- 开放 RLS、Audit UPDATE 授权、意外角色成员关系与未登记表均使启动检查失败。

## 当前边界

内部 Ledger 的调用方必须在相同 UoW 中完成 Control/引用/凭证回验。测试授权回调明确是夹具，不代表真实治理责任。当前公开 Core 包不导出这些内部入口；没有对外开放业务 API。

下批接入 Identity 的可信映射、Scope/Principal/Grant fence、权限与来源回验，以及长期资源责任、静态 Release/Authority，再构建 Action → Decision → Operation 与 Fake Provider 闭环。

实施顺序见 [持续实现跟踪](IMPLEMENTATION.md)，运行说明见 [Core README](../../packages/core/README.md)。

## 同组织 Identity/Grant 补充

已接入最小 Identity 定位表、受信 IdP Port 输出校验、Principal/Membership 当前状态、固定 issuer/audience、credential/scope epoch、当前 Grant 范围/用途/版本/数据库时钟到期检查。Grant 撤销与 admission 共用 fence 行锁；撤销的状态、epoch、Receipt、Audit、Outbox 同事务。补充 7 项真实数据库测试，数据库测试共 26 项。IdP 使用明确的测试 Adapter；尚未接入真实 OIDC、完整治理 Bootstrap、跨组织核验、Policy/Snapshot 和 Dispatch Permit。

## 跨组织最小核验与静态版本固定

新增 Workspace 正式表和受限 SECURITY DEFINER 核验函数：普通 UoW 仍固定资源组织，只返回来源成员资格、版本、epoch 与 fence 向量。函数所有者 NOLOGIN/NOBYPASSRLS，固定 search_path、静态 SQL、最小列权限、无 PUBLIC/queue EXECUTE；启动核对函数正文摘要及权限。合法关系/错 Workspace/错来源/撤销競态/正文隐藏/权限漂移的 5 项数据库测试通过。

新增静态 Release、Assignment 和不可变 PinSet：Draft → Ready 与静态 Assignment 原子落库；并发同主体只保存一组，缺槽位或同层冲突回滚；正常新版本不改变旧 Pin，紧急暂停阻断旧执行资格。补充 7 项数据库测试，累计 38 项。当前 15 张 Tenant 表、1 张最小 Identity 定位表、4 个版本化迁移，生成制品 47 个。

这些测试的治理证据、安装/CTK 来源及身份目录仍由受控 Fixture 提供；尚未开放公共命令。跨组织完整 Responsibility/Grant 链、静态安装配置装配、Authority、Policy、Operation 与队列仍需继续接入，不能据此签署完整 G13/M0-B。

## Artifact 与持续责任补充

加入 64 KiB UTF-8 text/plain/application/json 内联 Artifact：Staged → Available 同事务保存元数据/正文/摘要/Audit/Outbox；每次读校验当前对象权限与实际字节，墓碑保留证据并阻止读取。6 项数据库测试通过。对象存储大文件、恶意文件扫描、生命周期级联和权限代理下载仍待实现。

加入 Commitment 和不可变 Settlement：Hold 原子转责任、差额调整、来源 Ref/version 去重、超界实际费用完整入账并记录 overrun/freeze、有限尾差 Closing、结算稳定后 Closed；原 Committed Reservation 不恢复 Held。7 项数据库测试通过。计量单位/Period 与 Domain Policy 的生产证明、退款/FX/Correction/Exception 仍待接入。

当前数据库测试累计 51 项，Tenant 表 18 张，版本化迁移 6 个。测试使用 Fixture 的权限/证据回验回调，不等于生产 Governance 或完整模块验收。

## 责任、动作准备与策略执行补充

已加入当前责任、冻结席位请求、Decision 与整体完成证据，以及 Action 绑定的有限 Service Grant/ExecutionAuthority Effect。历史重投不能复活撤销记录。Action 准备 Owner 固定执行主体与业务意图，逐次核对 Artifact 字节/摘要，限制 Plan 的固定 Compiler/Connector、范围、资源精确上界和 DAG；计划与全部 Pending Operation 原子保存。取消与计划竞争保持一致，不生成 Permit。

执行来源检查回读真实 Action、原 Command Receipt、当前提案人/Service/成员关系、Authority/Grant 和 fence，保留业务绑定对生命周期版本增长的兼容。Authority 撤销原子提升 stop/epoch。该函数仅提供 Resolver 证据，尚不证明 Purpose/责任/Policy/资源的完整授权。

复用 `@open-policy-agent/opa-wasm@1.10.0` 执行 OPA 1.20.2 编译的 Rego Fixture；没有另建策略服务或规则引擎。Worker 仅运行固定 WASM，32 MiB 内存、64 KiB 输入、20 ms 默认时限；缺输入、默认拒绝、错误结果、宿主时间不可用、实际计算超时、取消和两类 Policy 冲突测试通过。Fixture 源码/编译器/输出摘要可回溯，真实 Policy 发布治理与 Artifact 装配尚待接入。

当前迁移增至 10 个，Tenant 表 29 张。最新完整检查及具体测试计数以 [运行证据](verification-2026-09-07-data.json) 为准。Scope/资源目录、Snapshot/Permit、pg-boss、真实业务服务和完整 V1 仍在持续实现。

## Policy 与首次 T1 原子授权

Policy 版本以受用途控制的 JSON Manifest Artifact 引用已安装 WASM 摘要；安装前验证字节，运行前核对精确 entrypoint。当前 Mandatory Binding 每次重读，Behavior 必须来自 immutable Pin。6 项数据库/OPA 测试覆盖发布拒绝、缺策略、输入失效、Mandatory 收紧、固定 Behavior、Artifact 墓碑和代码缺失。

Resource Envelope 固定资源到真实 Ledger 的单位/上界映射，多个 Authority/Envelope 不创建新余额。首次一次性数量授权串联 Source/Pins/Plan/Artifact、两类 Policy、账本全部预留、Snapshot 与 Action CAS。事务内不可伪造结果和 UoW completion guard 拒绝孤立 Snapshot；并发争最后额度只有一项 Authorized，失败/撤权/中断不遗留 Hold。持续责任仍需既有 Commitment 与 ResourcePolicy 的 T1 组合；当前拒绝缺转换的 monetary 计划。

当前 12 个迁移、34 张 Tenant 表。执行来源、Purpose/Predicate/Connection/责任的完整组合仍有明确的测试回调，尚不开放业务 API，后续 Permit/Attempt 与 Fake 出站尚未实现。详见持续实施跟踪和最新运行证据。

## Purpose、Connection 与批准回源

新增实际用途目录和 Connection：登记名称/状态/精确版本与账户范围，撤销和 fence 同事务。Resolver 的首次 T1 直接校验 Purpose、每个 Connection、全部必需责任席位的当前批准与审批 Grant；不再由 Fixture 假设这些对象有效。当前支持无附加条件、无停止 Predicate 的 Action 绑定委托；未实现的 Predicate/Scope 预授权会拒绝。

T1 集成用例从真实 Decision Owner 创建整体证明，再由真实 Authority Effect Owner 签发有限 Service Grant/Authority，随后真实 OPA/Envelope/Ledger/Snapshot 与 Action 提交；审批 Grant 在整体证明后撤销仍阻断 T1。注册治理、Artifact 当前读权和 Domain source/Scope/one-shot 证明仍需静态应用装配，Secret 只为逻辑 Ref。尚无 Permit/Provider 调用和公开业务 Route。

本批迁移 13 个，Tenant 表 36 张；目录测试 6 项，Action/T1 测试 19 项。测试完整计数与摘要见运行证据。

## Worker、资源占位与 T2 增量

第 14–17 号迁移增加 WorkLease、ResourceFence、DispatchPermit、Attempt、追加 AttemptObservation 和一次性 DispatchExit；当前清单 42 张租户表。Permit/Attempt/Exit 为运行角色只可 SELECT/INSERT 的不可变事实，Attempt 执行状态通过追加观察保存。资源槽位无 TTL，WorkLease 到期不会清理可能产生远端效果的操作。

T2 使用控制 fence → 资源 fence → Ledger → Action → Lease → Operation 的锁序；原 Snapshot/意图/Plan/pins 与当前源事实重验，既有数量型预留仅核对而不重复预留。Action Owner 绑定当前 Snapshot，并在首个 Permit/Attempt/Operation Dispatching 已写入的同一事务内 CAS Executing。出口二次重验、一次性领取提交后才调用 Provider。32 项 Action 集成测试包括回滚、撤权、当前 Policy 收紧、失租约、Snapshot 过期、重复投递及 Fake Provider 响应丢失。完整检查的实际版本/数量以 [机器验证记录](verification-2026-09-07-data.json) 和本地日志为准。

尚未完成 Receipt/对账/父子输出/结束结算/刷新/取消；transport observation 不宣称业务结果。完整 V1、公开 handler、独立 CTK/治理证据、业务上线与性能门禁均未验收。

父子节点输入解析已接入：ConfirmedSuccess 报告固定外部 identity/version 和实际 Permit；只解析声明 JSON Pointer/类型映射，父节点必须 Closed/Succeeded 且当前完整回执向量未变。实际字节/当前读权再次验证，派生 Artifact 取来源用途交集、保留来源引用；数据等级或区域混合暂时拒绝。T2/Exit 将解析摘要和完整依赖引用纳入 Policy/Permit，Controller/最终结算按 Permit 的实际摘要对账。真实两节点 Fake 验证子请求含已确认父 ID、原模板不改、实际用量 2；父迟到冲突阻断 T2/Exit。完整检查通过 213 Contract + 138 Core（122 PG、7 OPA、6 比较、3 绑定），19 迁移、44 Tenant 表、48 生成制品、9 API 报告。公开服务、独立查询授权、自动回执保存、终态纠正和其余 V1 模块继续实施。

自动响应保存加入第 20 号迁移（45 张 Tenant 表）：TransportCapture 按 Attempt/Exit 唯一且不可变。dispatchAndCapture 使用新观察 Context，同事务保存原始 Artifact、归一化 Receipt、Attempt 观察、Capture 与 Audit/Outbox；只接受真实已提交出口产生的进程内观察，拒绝伪造对象/改写字节。解析失败保留原文，失败标签不证明无效果。CapturePending 仅持有不可打印原文的进程内句柄，重试只保存证据、不重发 Provider；进程丢失仍走 Query。已 Interrupted 的 Attempt 不重开，迟到回执可在原租约/执行 Grant 撤销后保存。内联编码保留任意字节，上限 48,000 bytes；大回执待 ObjectStore staging。全量通过 214 Contract + 142 Core（124 PG、7 OPA、6 比较、3 绑定、2 原始编码），48 生成制品、9 API 报告。

第 21 号迁移新增 runtime.inbox（46 张 Tenant 表）：消费真实已提交 Outbox Event，按 consumerId/eventId 唯一，事件摘要/源 Aggregate/ordinal 与不可变 Owner 结果一起保存。注册消费者明确可处理事件与当前 Service/Grant/fence；包括 Command Receipt replay 在内均重验 admission。Inbox、Owner Ledger 效果、Audit、Outbox 与 Command Receipt 同事务；故障注入整组回滚，多投递只执行一次，多消费者分别去重。新 5 项真实 PG 测试通过，最新全量为 214 Contract + 147 Core（129 PG、7 OPA、6 比较、3 绑定、2 原始编码），21 迁移、48 生成制品、9 API 报告。pg-boss 12.30.0 的上游公开 API/许可证已检查，尚未安装或接入；Outbox 扇出、Wait 和真实队列故障矩阵继续实施。

第 22 号迁移加入 Outbox routing/delivery/publication 三张不可变表（49 Tenant 表）。首次准备冻结真实事件摘要、消费者与 Job；配置变化不改旧路由。只接受实际 Port Completed 结果的进程内证明，Tracked 不记完成；当前 Service admission/Worker lease 下逐消费者确认，全部成功后才产生发布完成证据。最后一项故障会连 publication 一起回滚；失租约后入队成功不自动记发布，新 Worker 可复用相同队列证据。9 项 Inbox/Outbox PG 测试通过；全量 215 Contract +151 Core（133 PG、7 OPA、6 比较、3 绑定、2 原始编码），22 迁移、48 生成制品、9 API 报告。当前队列为显式 Port fixture，尚未接入真实 pg-boss/Wait 或全局发布扫描。

第 23 号迁移提供独立 abh_pgboss Schema，原生表与函数由锁版 pg-boss 12.30.0 / Schema 40 创建。新增 @abh/adapter-pg-boss 的 enqueue/inspect/drain 与内部 Worker fetch/complete/fail；业务 Runtime 与 Queue 角色双向禁止访问，启动检查固定原生表/函数摘要、函数权限和表/列级 ACL。真实 pg-boss 已连接到 Inbox/Ledger：业务提交后模拟队列确认丢失，再投递返回原 Inbox，实际 Owner 效果只有一次。

入队开始后的超时返回 Tracked，后续可用同一 JobRef 查回。排空停止相应队列的新工作，等待在途 Owner 确认及尚未返回的原生 send/fetch；截至调用期限返回剩余 Ref。认领尚未返回 ID 时使用安装队列的稳定 abh.queue Ref；排空/取消期间返回的认领释放到原生重投，不交给 Owner。函数 PUBLIC EXECUTE 或队列表列级授权漂移均阻断 readiness。

本批仍不是完整 Durable Port：Wait Owner、发布扫描、真实 ContextRef admission 装配、跨队列同去重键并发冲突约束、跨 Worker 原生迟到 ack 防护及生产保留/清理水位待完成。pg-boss ack API 按 Job ID 工作，不提供 Owner fencing；业务提交始终须走 Inbox、当前权限和 WorkLease。当前适配器不可据此宣称生产 Worker 已验收。

Outbox 扇出专项也已切换真实 pg-boss：两消费者部分完成、发布事务回滚后复用同一 Job、发布前失租约与替换 Worker 恢复均使用真实队列；仅 ContextRef admission 与安装路由仍为明确 Fixture。9 项专项测试通过。

本批最终全量检查通过：215 Contract + 158 Core（140 PG、7 OPA、6 比较、3 绑定、2 原始编码）；pg-boss 专项 7 项，Inbox/真实 Outbox 扇出专项 9 项。23 迁移、49 Tenant 表、48 生成制品、9 API 报告。冻结依赖安装通过，本批隔离测试容器均已清理。验证 JSON 已更新依赖锁和全量日志摘要。

第 24 号迁移新增 runtime.waits / runtime.wakeups（51 张 Tenant 表）。DurableWaitOwner 以组织/Owner 身份/waitKey 稳定去重，冻结条件、Authority、cause、期限与注册摘要。安装的 Owner 回调与 Wait/Audit/Outbox 同一事务写 Waiting 意图；注册立即回读持久源事实，条件已满足或期限已到则同事务 CAS Pending → Succeeded 并产生唯一不可变 Wakeup。Condition/Deadline 明确区分，Succeeded 仅表示等待已触发通知，不表示原业务成功。

Timer、已提交源事件与补偿回读走同一 recheck；校验事件租户/源身份、源版本与 ordinal，不信通知 payload。未满足的新源水位持久化，倒退、同水位内容改变、替换源、读源落后于已提交信号均拒绝。取消只 CAS Pending，已触发返回 AlreadyClaimed，不撤销 Owner 的重验责任。注册命令重放也回读当前 Service credential epoch、Grant/fence 和安装条件。Tenant 范围的 pending 扫描一次最多 100 条，只返回 Ref，恢复调用仍须重新 admission；扫描者完成一轮后重置游标，不能将游标当已处理水位。

11 项真实 PG 专项通过：提前信号、并发注册/去重、信号与 Timer、实际数据库期限、取消竞争、Owner/Wait/Wakeup/Audit/Outbox 整组回滚、版本缺口与非法源、补偿恢复、当前权限及 credential epoch。2 项契约测试校验状态证据关系与 Wakeup 摘要绑定。测试的 Waiting Owner/条件/Authority admission 为明确安装 Fixture（真实 Ledger 意图和源变化），不宣称 Mission/Run 等 Owner 已接入。

仍待：持久信号接收凭据、完整 scheduleWakeup/cancelWakeup/signal Port 装配、真实 ContextRef/Authority/Waiting Owner 集成、全局受限补偿调度与生产扫描水位、Queue/Worker 服务及其余 V1 模块。当前没有新增公开业务 handler。

Wait 批次完整检查通过：217 Contract + 169 Core（151 PG、7 OPA、6 比较、3 绑定、2 原始编码），24 迁移、51 Tenant 表、48 生成制品、9 API 报告。类型、构建、文档链接和公共 API 检查通过，本批隔离容器已清理；机器记录已更新全量日志与生成清单摘要。

2026-09-08：第 25 号迁移新增不可变 WaitPortReceipt 与 Action Owner 的 action_waits（53 张 Tenant 表）。DurableWaitPort 完成 scheduleWakeup/cancelWakeup/signal/Wait inspect；与 pg-boss enqueue/Job inspect/drain 组合后覆盖完整 DurableExecutionPort。签发 ContextRef 目录只接受内部 VerifiedContext，并在每次调用/重放检查实际 Grant、credential epoch 与 fence；目录限额、过期清理和显式 revoke 已实现。写入不确定返回 Tracked/稳定 WaitRef，成功结果在原事务保存不可变回执。

signal 的返回引用表示持久信号接收凭据，绑定真实 committedEventRef；即使条件未满足也能保存接收结果，但不生成实际条件唤醒。取消命令重放保持原 disposition 和 receiptRef。未注册 Wait 的信号返回 ResourceNotFound，后续注册依赖原已提交源事实回读。恢复入口按当前安装条件、当前租户分页读取最多 100 个 Pending，并逐项通过当前 admission 重验源/数据库期限，恢复重启或丢失通知。

ActionApprovalWaitOwner 是真实业务装配：Action 必须 Validated，责任请求属于该 Action 且摘要/期限匹配；同事务写 Action 等待意图，不伪造新的 Action lifecycle。DecisionOwner 新建请求的生命周期元数据允许 runtime.deliver 读取；实际 DecisionPackage/Artifact 权限仍独立。授权请求 Closed（包括拒绝）只触发 SourceClosed 通知，T1 仍须完整批准证明。安装 Inbox consumer 对实际唤醒/取消事件去重并由 Action Owner CAS SourceClosed/Deadline/Cancelled；通知与 Inbox/Audit/Outbox 同事务。集成覆盖真实 Decision 审批/拒绝、通知回滚、并发重投、取消同步及撤 Grant。

本批覆盖 Action 授权请求等待；Mission/Run、Operation 查询等待、公开 HTTP 身份入口、跨组织受限调度和常驻生产 Worker、原生 ack 防护及生产保留水位仍待实现。ContextRef 目录为进程内可信入口句柄，持久状态与回执在数据库；重启须由 Ingress 重新签发 Context。完整 Port 方法实现不表示所有 V1 模块或生产门禁已验收。

本批最终检查通过：218 Contract + 171 Core（153 PG、7 OPA、6 比较、3 绑定、2 原始编码），25 迁移、53 Tenant 表、48 生成制品、9 API 报告。Wait 专项 12 项、Action 专项 42 项。构建、类型、API、206 个文档链接与冻结依赖安装通过；本批隔离测试容器已清理。2026-09-08 验证 JSON 保存当前依赖锁、生成清单和全量日志摘要。

2026-09-08：第 26 号迁移新增 execution.operation_waits（54 张 Tenant 表）。OperationReconciliationWaitOwner 接入既有 Wait Port，按实际 Operation 源版本注册已派发操作的对账等待，固定原 Operation/Action/Grant 与摘要。只在 OperationController 将操作持久化为 Closed 后满足条件；Deadline/Cancelled 仅改变等待通知记录，不改变 Operation、Attempt、资源占位或账本。

实际唤醒/取消事件通过独立 Operation Inbox consumer 交回 Owner，重验当前通知 Grant、Wait/Owner/Authority 绑定、Action 摘要与当前 Operation。恢复扫描按条件匹配，已关闭的成功和无效果操作都能结束等待；SourceClosed 不自行重判 Outcome。测试将等待插入真实 Provider→Receipt→Reconciliation→Controller→最终结算链，覆盖超时/取消保留原操作与占位、当前 Controller 关闭后补偿恢复、并发 Inbox 去重和撤权后重放拒绝。Action 专项 42 项通过（新增场景纳入原对账用例）。

这里的 Grant 只授予 runtime.deliver 等待元数据权限，不是 Provider 查询权限。独立 Query ExecutionAuthority、只读查询出口与查询预算尚未实现；Mission/Run、跨组织常驻调度等其余 V1 工作仍待完成。既有测试中的查询来源/Connector finality 核验仍是明确 Fixture，不据此宣称真实查询执行已接入。

Operation 等待批次全量检查通过：219 Contract + 171 Core，26 迁移、54 Tenant 表、48 生成制品、9 API 报告。构建、类型、206 个文档链接及 API 检查通过，本批隔离容器均已清理；operation-wait 验证 JSON 记录当前生成清单与全量日志摘要。

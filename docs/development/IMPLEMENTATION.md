# V1 持续实现跟踪

用户要求：持续实现全部 V1 设计，不在每个批次结束时停下。代码与本地可重复验证持续推进；真实业务、外部平台、生产写入及独立审查的证据不以模拟测试替代。

当前模块状态与后续顺序见 [V1 缺口清单](V1-GAPS.md)。

## 当前执行顺序

1. M0-A 收尾：补齐首批持久表所需辅助状态与正式事实 Schema，保持统一生成链与 G01 机器覆盖检查。
2. M0-B：PostgreSQL 16、node-pg-migrate、postgres.js、受限角色/RLS、内部 Tenant UoW、CAS/幂等/Audit/Outbox、Identity、Ledger、静态 Release/Authority。
3. M0-C：Responsibility/Decision、Action/Plan/Operation/Permit、Fake Provider、对账/取消/恢复、HTTP/客户端、hello-business 与标准导出。
4. M0-D：Mission/Run/Task Graph、Definitions/Context、Pi Adapter 实际开源循环、Gateway、Verification、取消/恢复。
5. 后续设计：多方责任/Correction/Exception/Takeover、Pack/Release/Canary、学习与独立评测、Secret/Isolation、Projection/Realtime/Workbench、SDK/CLI/运维与完整工程门禁。

## 当前状态

2026-09-13：V1 工程实现完成度约 99.9%。Learning Gate 到 Workbench Release 的受控写路径已闭合；Release Assignment 现在具备 Core 与 Workbench 的授权 Get/List、稳定分页和受治理 Pause 生命周期。Run 取消、有界 Task Graph Patch、Durable Wait 条件唤醒 Worker、Ready Task Worker、Running 租约过期接管、迟到 Invocation 观察/裁决、无进展预算停止、Human Exception 处置与 ApplyCorrection 后治理解冻、Task Execution/Invocation/Checkpoint Owner、Correction 候选/公开接入、三类目标应用、受治理 Signal/Case、Draft Capability Candidate、Profile 冻结/Evaluation Run、Evaluation Retry/Gate 与 Learning Release 均已形成契约、PostgreSQL、授权、幂等和审计闭环；Ledger 余额/责任审计已接入 CLI doctor，周期/单位目录与退款/汇率 Correction 也已进入本地闭环。Action 的确定性 TransportFailed Safe Retry 已补齐三次上限、完整 T2 重授权、同一 Operation 围栏轮换和强制策略重评。`abh run` 已移除组合桩，改为显式部署安装模块提供 Identity Provider、凭证解析、Mission 治理、Durable Port 和 drain 记录后，连接 `assembleAbhService` 与 `runHttpService`。`defineBusiness` 与 hello-business 初始化模板提供 Action-only 声明、稳定摘要、schema 输入校验和公开 SDK 示例；Manifest 编译、Pack 发布和生产治理仍不计入本地闭环。

## 2026-09-14：审查修复、Workbench 重设计与 hello-service 参考部署

外部深度审查发现并已修复：CLI `abh run` 引用未导出的 `@abh/core/server`（运行必崩，测试注入掩盖）；`abh mission` 写命令缺 Idempotency-Key/If-Match 且 body 携带非法字段（对合规服务器必 400）；core 测试夹具 60 秒上下文过期在慢环境引发套件级联 UNAUTHENTICATED（默认 TTL 提升至 30 分钟）；CI 缺 cosign 导致 7 个真实签名测试永久跳过；adapter-pg-boss 无测试门禁；README 完成度口径与 61 路径计数过时。

Workbench 前端重设计为令牌化扁平设计系统（明暗双主题、侧栏/顶栏应用外壳、状态徽章、页面页眉），SSE 逻辑收敛为共享 `useProjectionStream` hook（Last-Event-ID 续传 + 指数退避 500ms–8s），五处复制粘贴实现消除；新增 `identity-production.ts` 生产身份适配器（JWKS/RS256/ES256 与 HS256 时间安全验证、exp/nbf/iss/aud 校验、abh_organizations 声明映射、组织 Cookie 仅作选择意图、生产构建无配置即 fail closed），装配点按环境选择并修正 README 指引；axe WCAG AA 对比度与全部 e2e 旅程通过（4/4）。

新增 `examples/hello-service` 参考部署：完整 `createAbhServiceInstallation`（身份提供者、经附加 Database 的 Grant 解析、部署拥有的定义与 MissionAuthority 注册表、真实 pg-boss 队列与 LocalDrainJournal、启动就绪检查）、幂等 provision 脚本与受限角色口令管理。`abh run` 修复信号装配（AbortSignal 入 options、process 作为信号源）、新增可选 `install.attach({database})` 阶段与 `ABH_RUN_DEBUG=1` 根因诊断；adapter-pg-boss 启动失败保留根因。`@abh/core/server` 增补 CoreError、列表游标编解码器与 LocalDrainJournal 导出。已在 PostgreSQL 16 全迁移库上联测：授权 missions.list 200、缺 token 401、错误用途 403，全程脱敏。完整 `pnpm check` 门禁全绿（1024 测试 0 失败；cosign 在 CI 安装后真实签名测试生效）。

## 2026-09-13：defineBusiness 与 hello-business 模板

`@abh/core` 新增 `defineBusiness`、`validateBusinessInput` 和封闭 `BusinessDefinition` 类型。作者只能声明 Action-only 业务名、SemVer、1—20 个唯一 Action、有界 title/description、最多 8 层的封闭 JSON-Schema 子集、执行 Service、完成策略、风险类、行为槽、操作上限、intent 有效期和已登记用途。函数返回冻结声明和 JCS/SHA-256 稳定摘要；`validateBusinessInput` 在发送前执行同一 schema 的有界校验。公共入口不暴露事务或 Repository。

`abh init --template hello-business` 生成契约有效的 `business.mjs`、`example.mjs`、受保护环境样例和 package script。模板声明 `hello.publish`，示例先本地校验输入，再通过公开 typed SDK 的 `artifacts/actions.propose` 稳定子键流程提交一个 Action，并用 trackingRef 查询 Strong ActionView；示例在人工审批前停止，不自动批准、不注入身份、不伪造 Decision。测试通过动态导入生成项目验证公开入口解析、声明摘要和 schema 校验。

验证覆盖声明封闭性、重复 Action 拒绝、digest 稳定性、类型/长度/enum/额外字段拒绝、hello-business 配置和环境引用，以及生成项目的真实模块导入。Contracts 51 个 artifact、API 报告和 786 个文档链接一致；CLI 21/21 通过，Core 业务声明专项 2/2 通过。该边界仍不是 `defineBusiness` → Pack Manifest 编译器，也不是真实 Domain/Pack 发布验收。

## 2026-09-12：显式运行宿主 CLI 装配

`abh run` 不再返回“需要手工装配”的桩结果。命令现在只接受 `--config`、`--host`、`--port`，读取契约校验后的 Development 配置和显式 `env:` 数据库角色引用，再动态加载业务模块导出的 `createAbhServiceInstallation`。该安装模块必须提供真实 `IdentityProviderPort`、固定 issuer/audience、当前凭证解析、Mission HTTP 治理安装、`DurableExecutionPort.drain`、drain Context 和报告持久化；可选提供租户 Worker、启动检查和 release 回调。

CLI 随后创建受限 `Database`，用部署 Provider 构造 `IdentityIngress`，经 `assembleAbhService` 组合 HTTP Owner，再交给 `runHttpService` 执行启动检查、套接字、租户循环、SIGTERM/SIGINT ingress 排空和依赖关闭。CLI 不注入默认身份、Grant、队列、机构或业务回调；缺失安装在进入数据库连接前以 `INCOMPLETE_BUSINESS_INSTALLATION` 失败。真实连接串只从受保护环境传给部署安装模块和受限数据库构造，不写日志、不进入 Command 或审计。

CLI 回归覆盖严格参数、配置/环境缺失、安装模块缺失、显式安装成功路径，以及 Identity、Mission、queue 和 drain 回调不使用默认值的依赖注入验证；`abh run` 的依赖注入测试确认 CLI 调用顺序为 Database→IdentityIngress→assembled service→HTTP runtime。全仓 `pnpm check` 通过：Core 609 项中 602 通过、7 跳过、0 失败；CLI 20/20 通过，Contracts 313/313 通过，全工作区 996 项中 989 通过、7 跳过、0 失败，API 报告与构建一致。

## 2026-09-13：Exception Resolution Effect 治理解冻

新增公共命令 `abh.exceptions.apply-resolution-effect`、不可变 `abh.exception-resolution-effect` 和 `human.exception_resolution_effects` 表。只有 `ApplyCorrection` 决议可触发效果；Core 在事务内复核当前 Human/`abh.decision.review`、以 `abh.exception` 为授权对象和来源 fence 的当前 Grant、批准 Decision、决议与 Exception 事实一致，以及 `CorrectionApplicationRecord` 的精确身份、治理有效性和 Exception 报告证据。错误决议种类返回 `PRECONDITION_FAILED`；外部/无证据应用返回 `OPERATION_FACT_CONFLICT`；缺权返回 `AUTHORITY_REQUIRED`。

效果只调用 ResourceFence 报告阻塞释放，移除 `blockedByReportRef`，保留未决 Operation 和 fencing token，并把不可变 effect、Audit 与事件同事务提交。重放会重新执行当前授权，已释放且匹配同一 Correction 应用时返回原 effect；不把不可变证据引用送入 fence 锁。HTTP 响应使用 `201` 且 Create 命令不带 `If-Match`，稳定幂等重放保留同一响应；typed client 暴露 `client.exceptions.applyResolutionEffect`。

真实 PostgreSQL/HTTP/SDK 回归覆盖解冻、HTTP 与 SDK replay、外部应用、无证据应用、缺权、错误决议种类后效果计数不变，以及 fence 只移除报告阻塞且版本递增。Contracts、API 报告、文档链接、Core 类型和全仓构建通过；Core Action 回归 70/70，Contracts 回归 313/313，OpenAPI 达到 60 条路径。后续仍限于生产治理装配、真实 Domain 验收、Exception 后续编排和责任重路由。

## 2026-09-13：Safety Stop 候选发现

新增公开强读查询 `abh.safety-stops.list` 和 typed client `safetyStops.list`。查询要求当前 `abh.actions.read` Grant 与 `abh.action.safety-stop` 用途，在租户/Workspace 内最多返回 100 个未释放 resource fence 候选，完整时返回 `complete=true`，超限时返回 `complete=false`。响应只包含 fence 身份、资源键、当前 token、原未释放 Operation、可选当前 safety Operation 和 blocker 引用，不暴露 payload、Provider 密钥、Attempt 细节或实现句柄。

该入口只做候选发现，不创建 safety Intent、不授权 transport、不改 fence 或 Unknown 责任。真实 PostgreSQL 回归覆盖缺 Grant 拒绝、两条独立责任完整列出和 `limit=1` 截断；契约测试覆盖候选边界和缺 `unresolvedOperationRef` 拒绝。正式安全业务编排和生产 Worker 仍开放。


## 2026-09-12：Evaluation Request 与 Profile 冻结

新增公开命令 `abh.learning.request-evaluation`、不可变 `abh.evaluation-profile` 目录对象和 `core.evaluation_profiles` / `core.evaluation_runs` 租户表。Payload 只允许 Evaluator 提交精确 Candidate 和 baseline；Suite、Dataset、指标阈值、停止规则、assignment unit 和样本下限都来自治理登记的唯一 Profile，调用方不能自填。Core 在同一强读事务中复核当前 Evaluator Grant、学习用途、Candidate 版本/摘要、Producer 与 Evaluator 身份独立、候选 Draft 状态、baseline 与候选 Artifact 不同且当前 Available，以及 Profile 四个 Artifact 快照仍可用。

通过唯一 Profile 匹配 Candidate 的 `assetKind` 和 `risk` 后，命令生成确定性受控的 Queued Evaluation Run，写入服务端随机 seed、空执行引用、Audit、Outbox 和命令 Receipt。该命令不执行评测、不产生指标、不判定 Gate，也不改变 Release 状态。HTTP 处理器和 typed client 支持独立 Evaluator 装配与幂等回放。真实 PostgreSQL 回归覆盖缺 Grant、Producer 请求、baseline 漂移/缺失、Profile 缺失/Artifact 失效/多义、成功创建、HTTP/SDK replay 和精确计数；OpenAPI 公共路径增至 43 条。

## 2026-09-12：Learning Candidate 创建

新增公开命令 `abh.learning.create-candidate`，目录对象 `abh.learning-candidate` 和不可变 `core.learning_candidates` 租户表。`CreateCandidatePayload` 绑定精确 Learning Case、资产类型、base 版本、候选 Artifact、Scope 和风险码；Core 在同一强读事务中复核当前 Grant、学习用途、Case 版本与 digest、Case 的信号 Scope 一致性，以及候选 Artifact 当前 Available 精确版本。命令只生成 Draft Candidate、Audit、Outbox 和命令回执，不授予事实资格，也不触发评测、Gate 或 Release。

HTTP 处理器和类型化客户端同步支持命令幂等回放。真实 PostgreSQL 回归覆盖缺 Grant、Case 缺失/版本漂移、Scope 越权、Artifact 缺失/过期、成功创建、HTTP/SDK replay 和精确持久计数。OpenAPI 公共路径增至 42 条。

## 2026-09-12：不可变 Correction 候选

`abh.corrections.propose` 现在创建只读候选，不自动应用替换产物。命令要求当前 Human、`abh.correction.propose` 用途、独立 Grant、当前 `Correction` 责任且责任 Scope 覆盖 Subject。Owner 在锁下读取 `beforeRef` 所属 Artifact，核对 Subject Owner、当前版本和预期版本；不匹配时返回 `CORRECTION_STALE`。替换 Artifact 必须是当前租户可用 Inline Artifact、内容摘要完整，且 Owner 指向同一 Subject。

`human.corrections` 与数据库清单版本 68 保存不可变 `CorrectionRecord`、Subject/Artifact/责任索引、目标 Owner、证据、命令 Receipt 和契约摘要；Audit 与 Outbox 同事务提交。重放返回同一候选，权限撤销后重放 fail-closed。该实现不解冻资源、不做补偿、不改技术 Outcome，也不推进 Capability Candidate 或生产版本；实际应用必须由目标 Owner 在授权流程中完成。

`CoreHttpInstallation.corrections` 现在提供显式宿主装配的 `POST /v1/commands/abh.corrections.propose`。处理器先解析一次性私有身份绑定和安装提供的当前 Grant 候选，再调用 Correction Owner；Owner 事务内重新校验 Human 用途、Grant、活跃 Correction 责任、Scope、Subject 版本和 Artifact 属主。响应使用 `CorrectionProposedResponse`，返回内联 `objectRef`、`commandId` 和完整候选。typed client 暴露 `client.corrections.propose`，本地校验目标 UUID 和幂等键；Create 命令不发送 `If-Match`。

`abh.corrections.get` 提供 Strong 单候选查询。宿主必须在 `corrections.get` 安装当前读权解析器；处理器在事务内锁定组织与 Grant fence、校验 `abh.corrections.read`，再由 Correction Owner 校验精确版本、租户、用途、行记录和不可变摘要。typed client 暴露 `client.corrections.get`。投影模式和批量列表仍未提供，避免把候选当前读取伪装成连续订阅。

真实 PostgreSQL 回归覆盖 HTTP `201`、HTTP 精确重放、typed SDK 重放和精确持久计数：`corrections=2`、`audits=8`、`events=8`、`receipts=2`。直接 Owner 回归继续覆盖有效候选、Grant 缺失、替换 Artifact 缺失/属主错误、当前版本过期、无责任和越权责任。合同生成一致性、API 报告、Core 类型检查、聚焦测试和完整 `pnpm check` 通过。Subject Owner 应用、品牌事实资格、能力纠错 Candidate 和学习订阅仍是后续缺口。

## 2026-09-12：Correction 应用第一段（Mission Goal）

`abh.corrections.apply` 现在实现第一段目标 Owner 应用：仅接受 `targetOwner=Domain` 且 Subject 为 `abh.mission` 的候选。命令要求当前 Human、`abh.mission.manage` 用途和当前 apply Grant；Payload 必须精确绑定 Subject、Mission Authority 和证据。Owner 在锁下复核候选精确版本与不可变摘要、目标 Artifact、Mission 当前 goal 和版本，随后调用宿主 `authority` 准入，再通过 `MissionOwner.reviseGoal` 原子推进 Goal。

`human.correction_applications` 保存不可变 `CorrectionApplicationRecord`，固定候选、应用前后版本、Authority、证据、结果、Receipt、应用人和契约摘要；Audit 与 Outbox 同事务提交。重放先重新验证当前 Human、Grant 与用途，再返回同一 `CorrectionApplicationRecord`；候选保持不可变，摘要不因应用改变。HTTP 和 typed SDK 均暴露 `client.corrections.apply`，Update 命令使用带引号的 `If-Match` ETag。

真实 PostgreSQL 回归覆盖 apply Grant 缺失、目标 Authority 拒绝、Mission Goal 从版本 2 推进到 3、HTTP 与 SDK 精确重放、Owner 级重放、候选摘要不变和精确持久计数：`corrections=2, applications=1, audits=9, events=9, receipts=3`。该段只覆盖 Mission Goal；Run Graph Patch 与 Memory Signal 后继由后续段落实现。

## 2026-09-12：Correction 应用第二段（Run Graph Patch）

`abh.corrections.apply` 现在支持 `targetOwner=Run` 且 Subject 为 `abh.run` 的候选，运行用途登记为 `abh.runtime.deliver`。候选的 `beforeRef` 必须是 Run 拥有的 JSON 快照，并精确匹配当前 Graph Revision 的 `nodes`、`edges` 和 `supersededNodeKeys`；`proposedAfterRef` 必须是 Run 拥有的 `ProposeGraphPatchPayload`，其 Run、版本、`baseRevision` 和证据 Artifact 都绑定候选快照。快照或 Run 版本漂移返回 `CORRECTION_STALE`，Patch 基线过期返回 `PRECONDITION_FAILED`。

通过校验后，Owner 在同一事务内调用 Run Owner 的受控 Graph Patch：复核 Run 状态与版本、图依赖、边界和 Pending 节点规则，创建下一 Graph Revision 并物化 Ready/Pending Task，最后写入不可变 `CorrectionApplicationRecord`、Audit、Outbox 和 Receipt。Application 的结果指向 Graph Revision。候选和快照保持不可变；重放返回同一 Application，不创建第二个 Revision。

真实 PostgreSQL 回归覆盖运行时 Grant 缺失、Authority 拒绝、快照漂移、过期 Patch 基线、Revision 2 创建、新 Task 物化、Owner 重放和精确持久计数。该边界只覆盖 Graph Patch，不表示可直接替换已 Running/Failed Task、补偿外部效果或解冻资源；Exception 编排、治理解冻和通用 Run 修改仍开放。

## 2026-09-12：Correction 应用第三段（Memory Signal 后继）

`abh.corrections.apply` 现在支持 `targetOwner=Memory` 且 Subject 为 `abh.learning-signal` 的候选，用途登记为 `abh.learning.capture`。`beforeRef` 必须是 Signal 拥有的 JSON 精确快照；`proposedAfterRef` 必须是同一 Signal 拥有的替换 Artifact。Owner 在 Signal fence 下复核当前不可变 Signal、租户、用途、精确版本和快照；漂移返回 `CORRECTION_STALE`。

应用不修改原 Signal，而是创建新的不可变 successor Learning Signal，沿用 source/scope/type/purpose，绑定替换 Artifact，写入 `abh.learning-signal.corrected`、Correction Application、Audit、Outbox 和 Receipt。同一 Signal 只允许一个直接后继，重复分叉返回 `PRECONDITION_FAILED`；重放返回同一 Application。该段只覆盖 Signal 后继；Learning Case 由后续段落实现，仍不做独立评测、用途撤回传播或知识资格授予。

真实 PostgreSQL 回归覆盖学习 Grant 缺失、Authority 拒绝、快照漂移、成功后继创建、旧 Signal 不变、Application 重放、重复分叉拒绝和精确持久计数。三类目标 Owner 的第一段应用均已闭环，但仍不是通用 Correction Engine。

## 2026-09-12：Learning Case 证据归因第一段

`abh.learning.build-case` 新增为公共 Create 命令，要求当前 `abh.learning.capture` 用途和当前 Grant。Payload 绑定 1—100 个 Signal、根因码、1—50 条支持证据、至多 50 条反证和 Domain Owner Ref。Owner 在 Signal fence 下逐个复核租户、Workspace 可见性、当前用途、精确版本/Ref；所有 Signal 必须共享同一 Scope 和合法学习用途，跨客户或用途撤回样本不能进入 Case。

支持与反证必须是当前租户可用且用途允许的 Artifact，证据缺失、不可用或引用漂移返回 `CASE_EVIDENCE_INCOMPLETE`。通过后创建不可变 `LearningCaseRecord`，写入 Receipt Ref、构建者、数据库时钟、内容摘要、Audit、Outbox `abh.learning-case.created` 和 `core.learning_cases`，全部在同一 PostgreSQL 事务提交。Case 只是证据归因，不创建 Capability Candidate，不执行评测，不授予品牌事实或领域知识资格，也不触发发布。

HTTP 与 typed client 暴露显式宿主装配的 BuildCase；宿主 Grant 回调只提供候选授权，Owner 在事务内重新校验。真实 PostgreSQL 回归覆盖 Grant 缺失、证据缺失、跨 Scope、用途撤回、成功创建、HTTP/SDK 幂等重放、跨组织拒绝和精确持久计数。Capability Candidate、Evaluation Profile/Run/Gate、用途撤回传播、Candidate 查询和独立 Producer/Evaluator/Release 身份仍开放。

## 2026-09-12：保持 Unknown 的 Exception 处置

`abh.exceptions.resolve` 现在把 Human 责任处置与外部技术事实分离。命令要求当前 Human、`abh.decision.review` 用途和独立 Grant；Owner 复核精确 Exception 版本、当前 ResourceFence 仍被报告阻塞、未决 Operation 占位仍存在，且 Closed Responsibility Request 中的 Decision 证据有效。`RejectAndStop` 可引用已拒绝 Decision，其余注册处置必须引用批准证据。

`ExceptionResolutionRecord` 只登记 `WaitForEvidence`、`RejectAndStop`、`ApplyCorrection`、`RequestCompensation` 或 `AuthorizedContinue`，并固定 `technicalUnknownPreserved=true` 与 `resourceFreezePreserved=true`。不可变 Resolution、CommandReceipt、Audit 和 Outbox 在同一 PostgreSQL 事务提交；重放返回同一视图，同 Exception 换幂等键冲突，技术 Operation 与资源冻结不被改写。Command 重放前仍会重新验证当前权限和技术冻结。Correction 应用、自动补偿和治理解冻仍是后续缺口。

## 2026-09-12：Run 无进展预算停止

Run 现在在创建时固定 `progressBudgetSeconds` 和数据库 `progressDeadline`。Checkpoint 提交成功后，Owner 在同一事务读取数据库时钟、刷新 Run JSON 与 `progress_deadline`，因此实际进展能延长预算，而 Worker 不会用本地时钟误判。内部命令 `abh.runs.stop-stalled` 要求当前 Service、`abh.runtime.deliver` 和 Grant；`stopStalledRun` 校验命令目标/版本，`stopStalled` 在 Run 锁下复核状态和数据库 deadline。

到期 Run 原子转为 `Failed/NoProgress`；`Created/Running` Invocation 关闭为 `Cancelled/Deadline`，未终 Task 取消，Mission activeRunRef 清理，活跃 Mission 的 stop epoch 前进。Run、Task、Invocation、Audit 和 Outbox 在一个 PostgreSQL 事务内提交，命令幂等重放返回同一 RunRecord。`runRunStallWorker` 只做租户内有界分页发现，每页刷新 Context 并逐个授权；版本冲突、抢跑 precondition 和候选消失安全跳过，权限或完整性错误继续暴露。

真实 PostgreSQL 回归覆盖活跃 deadline 不停、两个到期候选发现、旧版本拒绝、命令重放、Run/Task/Invocation/Mission/stop epoch 原子状态、精确 Audit/Outbox、Worker 扫描停止和活跃 Run 隔离。Run execution 回归确认 Checkpoint 刷新 JSON 与数据库 deadline。Core 全量 557 项中 551 通过、6 跳过、0 失败；合同生成一致性、类型检查、Contracts/Core API report、本批聚焦测试和完整 `pnpm check` 通过。生产 Worker 托管、跨租户调度、真实 Pi/Provider 装配仍不在此验收范围内。

## 2026-09-12：Run Wake Worker

新增 `runRunWakeWorker` 提供租户内有界候选扫描：只发现 owner 指向 Waiting Run、Wakeup 已持久化且 Wait source 明确 satisfied 的条件通知；Deadline 通知不会伪装成业务条件满足。Worker 每次刷新当前 Service Context，检查组织/Workspace/主体绑定，使用当前 `abh.runs.wake` Grant 调用既有幂等 WakeRun Owner；竞态、旧版本和短暂 precondition 保留给下一次扫描，权限或完整性错误立即暴露。

真实 PostgreSQL 回归覆盖 Deadline 候选过滤、Pending/错误 owner 拒绝、Worker 自动 Waiting→Running、直接命令幂等与旧版本拒绝、缺 Grant 拒绝以及 Audit/Outbox 精确计数。租户间发现、全局 Worker 托管、重投策略和真实等待条件装配仍开放。

## 2026-09-12：Ready Task Worker

新增 `runReadyTaskWorker` 将租户内 Ready 发现接到可替换 executor：每次扫描绑定固定 Service Context，通过当前 Grant 执行 Claim、Prepare、Finalize 和 Complete。Prepare 冻结 TaskSpec 与执行 Principal，Finalize 固定 Manifest、Bindings 和 Contract Digest；executor 只在 Invocation 已 Running 后调用，完成结果必须由当前租约 fencing 提交。幂等键由 Task/租约/阶段派生，短暂丢竞态留给下一页，授权或完整性错误立即失败。

executor 返回 `Unknown` 时 Worker 不伪造 Completed/Failed，Invocation 和 Task 保留 Running，交由后续迟到证据对账。真实 PostgreSQL 回归覆盖下游任务自动 Claim→Running→Completed→Verifying、usage/result 绑定，以及外部结果不确定时不推进任务状态。全局多租户托管、Running 租约过期恢复、重投策略和 Pi 生产装配仍开放。

Running Invocation 只在已有 Work Lease 实际过期后进入恢复扫描。接管在同一事务内推进 fencing token，把旧 Invocation 关闭为 `Deadline/Cancelled`，Task 重置 Ready 并递增 `attemptOrdinal`；新 executor 拿到新 fencing 后正常完成。活跃租约不会被发现，缺失租约也不会获得全新 fencing 序列，旧 executor 后续写入口令会被 `requireCurrent` 拒绝。

## 2026-09-12：迟到 Invocation 观察

新增内部命令 `abh.invocations.observe-late`、`abh.invocation-observation` 对象和不可变 `core.invocation_observations` 表。丢失当前租约的 Worker 不能改写 Invocation/Task 状态；只有数据库观察到同一租约已过期、或接管 token 已严格前进时，才保留其 Completed/Failed 证据、usage 和 Artifacts。接管前的重复 Complete 继续失败，Observation 命令在 Audit/Outbox 和幂等回执约束下只保留一份证据；当前 Owner 后续决定是否采用。

真实 PostgreSQL 回归验证活跃租约拒绝、过期后 Complete 拒绝、Observation 落库、旧 Invocation 和 Task 状态不变、接管后 attempt 2 进入 Verifying，以及重复 Observation 不产生第二行。Core 全量 556 项中 550 通过、6 跳过、0 失败；合同 51 artifact 和 API report 通过。迟到证据的自动采用、对账策略和生产调度仍开放。验证见 [迟到 Invocation 观察](verification-2026-09-12-late-invocation-observation.json)。

## 2026-09-12：迟到 Invocation Owner 裁决

新增不可变 `abh.invocation-adjudication` 与 `core.invocation_adjudications`。Run Owner 在接管过期 Running Invocation 前读取同一租约的 Observation：只有数据库已确认租约过期、证据为 `Completed` 且带 Artifact 时，才在同一事务中推进 fencing token、把旧 Invocation 置为 Succeeded、Task 进入 Verifying，并写入 `Adopted/CompletedEvidence`；非完成证据写入 `Rejected/NotCompletedEvidence` 后仍安全重试。接管完成后的迟到证据保留为 Observed，并由 Owner 写入 `Rejected/TaskAlreadyAdvanced`，绝不覆盖新 attempt。

Worker 认领接管候选后重读 Task；若证据已被采纳则跳过重复 Prepare/Executor。真实 PostgreSQL 回归覆盖活跃租约拒绝观察、过期 Complete 拒绝、接管后迟到证据拒绝、明确完成证据采纳、旧 Invocation/Task 精确推进、不新增 attempt、fencing token 前进和不可变裁决审计。Core 全量 556 项中 550 通过、6 跳过、0 失败。验证见 [迟到 Invocation 裁决](verification-2026-09-12-late-invocation-adjudication.json)。

## 2026-09-12：Task Execution、Invocation 与 Checkpoint

新增内部命令 `abh.tasks.claim`、`abh.invocations.prepare`、`abh.invocations.finalize`、`abh.invocations.complete` 和 `abh.tasks.commit-verified`，以及 `abh.checkpoint` 目录对象。迁移 1788897100000 创建 `core.invocations`（Task/attempt 唯一）和 `core.checkpoints`（Run/sequence 唯一），数据库清单升级到 v66。

`RunOwner.readyTasks` 只做租户内有界发现；认领必须通过当前 Grant、Running Run、Ready Task 和 Durable Work Lease。Prepare 冻结 TaskSpec digest 与执行 Principal；Finalize 在租约 fencing 下重验 Manifest/Binding，计算 Contract Digest，并把 Invocation 与 Task CAS 到 Running。Complete 记录 Artifact、stopReason 和 usage，将 Task 推进 Verifying 或 Failed。

Verification 提交现在锁定当前 Task/Invocation、校验版本与来源，Pass/Reject 结果进入 Task CAS，并原子写入 Audit/Outbox；同时补上 VerificationReport 的 contract digest 字段。CommitVerifiedTask 要求 Pass 证据、成功 Invocation 和 Domain Receipt，写入 Checkpoint、派发依赖满足的 Ready Task，并在 required 节点全部成功时提交 Run Completed 和清理 Mission activeRunRef。

真实 PostgreSQL 回归覆盖租约接管、旧 fencing 拒绝、Created→Running→Succeeded、验证提交、Checkpoint、下游 Ready、同键幂等回放和 Audit/Outbox 计数。当前实现仍不调用真实 Pi/外部系统；实际 Pi/Tool 装配、Running 租约过期恢复和迟到证据对账保留为下一批。

## 已验证基线

前三批 M0-A 见相邻实施记录：200 测试、42 个生成制品和九个公开 API 入口报告通过。没有数据库、Adapter 或业务服务。下一步先准备隔离的本地 PostgreSQL 测试环境；不接触其他项目数据。

## 实施原则与外部依赖

- 通用组件沿用设计指定上游，避免第二套队列、Workflow、Schema 或授权真相。
- 所有状态写入前先登记 Schema/状态；业务修改、Receipt、Audit、Outbox 同事务。
- Development/Fake 只用于代码验证。生产出站、独立安全审查、真实 Domain 效果与用户测试保留为明确未验证项。
- 未登记真实 Maintainer 不签署 G01/G13 等正式门禁；机器覆盖与工程证据可继续建设，不冒充人的审查签字。

## M0-B 第一批进度

已加入 `@abh/core`：11 张受限角色/RLS 租户表、迁移与启动清单、内部 Context/UoW、CAS/幂等/Audit/Outbox 和 Ledger 配置/预留/消费/释放。真实 PostgreSQL 16.13 完成 19 项集成验证；契约测试增至 207 项，生成制品 46 个。详见 [M0-B 持久层记录](M0-B-data.md)。Identity/Control 当前来源回验、长期 Commitment 及对外业务服务仍在实现。

同组织 Identity/Grant 已补充当前身份、epoch、最小定位索引、Grant 范围/用途/有效期校验和原子撤销；真实数据库测试增加到 26 项。下一步仍需把这些内部能力接入完整治理来源和静态 Authority/Release，再开放业务入口。

跨组织最小成员核验、Workspace 及静态 Release/Assignment/PinSet 已实现并通过数据库测试：受限函数正文/权限漂移拒绝、撤销竞争、同主体完整固定、缺槽位回滚、原版本恢复和紧急暂停。累计 38 项数据库测试、15 张 Tenant 表、4 个迁移；完整治理来源、Authority/Policy、业务入口与队列尚未完成。

内联 Artifact 与 Commitment/Settlement 继续补齐：小正文摘要/权限/墓碑、Hold 转长期责任、去重结算、超界冻结、差额调整、尾差关闭。当前 51 项数据库测试、18 张 Tenant 表、6 个迁移。仍需完成治理证据与 ExecutionAuthority/Policy、正式业务服务及 Durable/Action 闭环。

责任/Decision 内部 Owner 已实现：当前责任 Assignment、冻结 ANY/ALL 席位、完整决定包摘要、版本/期限/当前资格重验、整体完成证据。新增 7 项 PostgreSQL 测试，累计 58 项；没有把 Approved 直接变成 Grant。当前继续接入完成证明到有限 Service Grant/ExecutionAuthority 的幂等效果。

完成证明到有限 Service Grant/ExecutionAuthority 的幂等 Effect 已加入。随后补齐 Action 不可变意图、验证、Plan 登记、Pending Operation、取消与来源回验，以及 Authority 原子撤销；新增 10 号迁移，当前 29 张 Tenant 表。Action/来源测试 12 项，OPA-WASM 真实执行测试 7 项。核心仍只导出版本号，不挂载未完成授权链的公开路由。

下一步实现 Policy Version/Artifact 配置、完整 Resolver 与 Action T1 的 Snapshot/资源原子授权，再实现 Permit/Attempt/资源 fence/Worker 租约、Fake 出站与对账。已接入跨阶段事实用途：受信 Action 定义冻结元数据用途，Operation/Plan 继承，PinSet 取固定 Release/Assignment 用途交集；真实执行 Context 可读这些事实，Artifact 保持自身用途限制。`inspectActionExecutionSource` 只验证持久身份、Command、Authority/Grant 与 fence；完整责任/目的目录、Scope/停止条件、资源包络和两类 Policy 仍由后续 Resolver 组合。未完成 Snapshot 不允许 Authorized/Dispatch。

补充用途切换集成测试与启动 CHECK 布尔分组漂移负例；准备/执行元数据用途不会隐式扩大 Artifact 内容权限。启动比较保留 AND/OR 括号结构，防止约束 token 相同但分组改变仍被接受。最新完整证据更新后继续 Policy 版本治理、Resolver/Snapshot、Permit 与 Durable。

Action 固定已改为 `ActionOwner.pin`：组织选择 fence → Action 聚合 → Release 聚合，同一 UoW 提交完整 PinSet 与 Action.pinSetRef；故障注入证明一起回滚。Action 测试当前 14 项。后续 registerPlan 强制已绑定 pins。

已加入 PolicyOwner / InstalledPolicyAssets、11 号迁移（32 张 Tenant 表），版本/Manifest Provenance/当前 Mandatory Binding/PolicyEvaluation 合同。Policy manifest 用小型 JSON Artifact 引用已安装 WASM 摘要；二进制仍来自部署安装目录，不塞进内联 Artifact。真实 OPA 加载发生在事务前；求值在同一 UoW 重验输入后执行。Behavior 只能从精确 Pin 找到显式版本；Mandatory 每次读当前 Binding。6 项真实 DB/OPA 组合测试覆盖默认缺策略拒绝、发布回调拒绝、收紧立即生效、输入失效回滚、Artifact 墓碑/代码缺失拒绝。生产安装签名/独立评审和完整 Resolver 尚未组合；Owner 仍内部。

下一步：ResourceEnvelope 的持久映射与上界、Purpose/停止条件回验、Control Snapshot 与 Action T1 原子授权；随后 Dispatch Permit/Attempt 和 Fake。当前所有执行路径仍禁止公开。禁止把 PolicyOwner.evaluate 的测试 verifyInput 回调当成生产授权。

ResourceEnvelope / Snapshot 第 12 号迁移已加入（34 张 Tenant 表）。Resource Envelope 固定 Resource → Ledger/单位/单次上界，不复制余额；当前 T1 仅支持数量型一次性责任，maxMoney/持续责任转换需后续 ResourcePolicy/Commitment 路径。Control 的 `ActionAuthorizationResolver.authorizeOneShot` 组合真实当前来源、固定 Pins/Plan、Artifact 字节、当前 Mandatory + 精确 Behavior OPA、全部账本预留及不可变 Snapshot；Action Owner 消费事务内 WeakMap 凭证再 CAS Authorized。UoW completion guard 拒绝“只有 Snapshot、未提交 Action”的孤立提交。当前 Action 测试 18 项，含两个意图争最后精确额度只有一个获准、源/Policy 拒绝与提交后故障整组回滚、伪造凭证/源 Grant 撤销拒绝。

这仍不是可公开的完整执行授权：`SnapshotSourceChecks` 的跨 Owner Purpose 目录/完整 Decision 证据/停止 Predicate/Connection Scope 与 OneShot 业务证明回调在测试中显式使用 Fixture。下一步要实现这些静态 M0 Owner 的真实组合，然后 Permit/Attempt、WorkLease/ResourceFence、Fake Dispatch/Receipt/Reconciliation；没有外部调用已经开放。Policy 拒绝当前跟 T1 一起回滚，拒绝审计的独立安全入口也待补充。

Purpose 与 Connection 第 13 号迁移已加入（36 张 Tenant 表）。用途名绑定注册 Catalog；Connection 固定账户/Scope/精确 Connector 与 Secret Ref，撤销原子更新 fence。6 项目录测试覆盖错账户/版本/Scope/用途/租户和撤销。T1 已直接调用这些 Owner，无需测试回调假定存在。

Human `approval-proof.ts` 提供先收集控制 fence、锁后完整回验：冻结全部必需席位、Proof/Request/revision、Approved Package 摘要/期限、当前 Responsibility 与审批 Grant、影响上界。T1 只接受 Action 绑定的整体完成证明，未实现的条件/停止谓词拒绝。Action T1 测试改为真实 Decision Owner 生成证明、真实 Authority Effect Owner 创建有限 Grant，再执行真实 OPA/资源/Snapshot/Action 事务；初始治理配置、发布/责任授权及 Domain source/one-shot 证明仍有明确 Fixture。新用例验证审批 Grant 在完成证明后撤销也阻断 T1。

剩余需完成：Domain 注册/Artifact 当前读权与 Scope Proof 的真实静态组合，治理/bootstrap admission；Scope 预授权、条件 Predicate、持续责任的授权路径；Dispatch/Permit/Attempt/WorkLease/ResourceFence 和 Fake/对账、取消/续签，再 pg-boss/HTTP/SDK。只首次一次性 Action T1 可内部测试，不能把它叫完整 V1 或正式业务服务。

WorkLease 与 ResourceFence 已加入第 14/15 号迁移。租约采用数据库期限和单调 token，claim 不自动续期，heartbeat 只增版本；租约过期不证明外部零发送。资源锁按 Connection/账户身份及 resourceKey 唯一，不含可绕过占位的语义版本，不设 TTL。6 项租约与 5 项资源锁测试通过；该批完整检查为 210 契约 + 109 Core（102 PG、7 OPA），15 个迁移、38 张 Tenant 表。

T2 与出站继续实现第 16/17 号迁移（42 张 Tenant 表）：Action 绑定当前 Snapshot；Control 同事务重验完整批准、Purpose/Connection、源向量/epoch、固定能力/Plan/Artifact、当前 Mandatory + 原 Behavior、原预留与上界。Operation Controller 创建不可变 Permit/Attempt、Created 观察、资源占位，再由 Action Owner 提交首个 Executing。Permit ≤5 秒并绑定 Worker/lease token/资源 token/精确 Connector/payloadDigest。全组故障回滚，当前不允许未确认父输出模板或自动 retry。

受信出口 `dispatchOnce` 在第二个短事务重验当前控制状态并写一次性 dispatch_exit，提交后才调用安装的 Connector 接口。Command replay 或新 Worker 均不能再次消费已领取的出口；退出超窗/撤权拒绝，已在途可能有远端效果仍保留。Fake Provider 用独立调用计数与真实远端记录覆盖响应丢失、重放、失租约及领取后崩溃。Action 集成测试当前 32 项；扩展 Attempt State Registry，生成制品 48 个。新增 TypeScript erasableSyntaxOnly 与 Node 24 strip-only 保持一致。

当前 transport observation 只返回给受信编排，尚未自动持久原始回执或完成业务对账；不得把 Responded 当 Succeeded，或把 TransportFailed 当确定失败。下一步实现持久化观察/Receipt、控制器 Unknown/查回、Reconciliation 最终判断、父子输出解析、资源结算、Snapshot Refresh/取消，并接入真实治理/Domain admission、pg-boss、HTTP/SDK/CLI/Pi。出口仍为内部 API，Connector 安装/CTK 和 Domain 目标回验在测试中是明确 Fixture，未开放公共业务处理器。

T2/Exit 完整检查已通过：211 项 Contract + 122 项 Core（115 PG、7 OPA），17 个迁移、42 张 Tenant 表、48 个生成制品、9 个 API 报告。追加当前 Service credential epoch 回验；租约仍有效不能绕过凭证撤销。

随后新增内部 OperationReceiptOwner 与 NormalizedOperationObservation：原始/归一化内容存真实受用途控制 Artifact；回执键由稳定 sourceKey/sourceVersion 派生，内容摘要去重，同源冲突拒绝，读取再次校验实际字节。Response 必须关联真实 Attempt/Permit/Connection/精确 Connector；归一化及外部来源验证由安装的 Connector 检查回调承担。回执入口使用独立 `abh.operations.record-receipt` / `abh.operation.reconcile` Grant 注册，不依赖过期 Worker 租约或已撤销的执行 Grant；不会修改 Outcome。测试用真实 Fake 响应保存原始与归一化 Artifact，再撤销租约/执行 Grant 后追加回执，验证独立入口权限、并发去重、同内容副本重放、冲突、原始证据拒绝、RLS 与不可变性。Action 集成测试已增至 33 项。尚未完成自动观察持久化编排、只读 Query Authority、Reconciliation 与最终状态/资源结算。

ReconciliationService 已成为比较报告的唯一逻辑 Owner，报告绑定完整 Receipt 向量、固定 Rule/Plan/payloadDigest 和摘要；输入少列一条已存在回执即拒绝。比较器不把零匹配或失败标签当 no-effect，多个身份/同版本矛盾/不可排序版本/成功后出现相反证据保留冲突。6 项状态化 Fake 比较测试覆盖响应丢失、延迟可见、多匹配与幂等原生 key；发现并修复比较只看最新版本会遗漏旧版本互相冲突的问题。

OperationController 已可在独立查回用途/当前 Worker lease、资源 fence 与完整证据向量下应用报告：Pending/Ambiguous/Conflicting → Observing/Unknown，保留资源槽和预算；ConfirmedSuccess/ConfirmedNoEffect → Closed/Succeeded 或 Failed，仅清理匹配 token 的资源槽。Action Owner 反映完整子集合的 Unknown/Pending，暂不作最终结果或资源结算。控制器写入失败则 Operation、父 Action 和槽位一起回滚。WorkLease 的元数据用途现在可由实际 target Owner 的核验回调返回，使相同 Operation 在执行/查回阶段使用一个租约事实，仍不扩大业务权限。

最新专项测试：34 项 Action 链路 + 6 项 Fake 比较通过；新增 finality 测试继续断言实际 Fake 写入数量，明确 Provider 拒绝的零效果模式，查询权限/Connector finality 在该专项仍是标注的 fixture。待完成：超窗崩溃恢复自动记 Unknown、正式 Query Authority/读出站、Attempt 状态追加与自动保存响应、迟到终态纠正/Exception、父输出解析、完整 Action 聚合/结算/刷新/取消及其余 V1 模块。

崩溃恢复补齐 `OperationController.recoverExpired`：只有 Permit 已过期、当前控制器租约有效且 CAS 匹配时追加 Interrupted 观察、Operation Observing/Unknown 与父 Action Unknown；不重发、不释放资源。回滚和重复恢复均覆盖。

第 18/19 号迁移新增不可变 ActionResult/ActionCleanup（当前 44 张 Tenant 表）。一次性最终汇总要求完整子版本向量、全部 Closed/零派发 Cancelled、每项最新完整回执/对账与无本 Action 未决槽位；领域结算回调必须证明全部实际用量/容量结束，未知费用不得推断为零。Ledger 消费/归还、ActionResult、Action Closed 在同一 UoW；孤立 Result 无法提交，失败全部回滚。已验证单节点成功及 Provider 明确拒绝的零效果到最终 Closed，真实 Fake 记录数量与账本实际用量一致。

零派发清理锁原 Snapshot fence、当前管理权限、资源键、Ledger 和 Action，直接查 Permit 表并核对所有孩子。Cancel/Expire 取消 Pending 子项，Reauthorize 保留原孩子/Plan/pins 并退回 Validated、解绑当前 Authority/Snapshot，历史记录保留。仅原意图到期可 Expire；Snapshot 短期过期不自动终止业务。重新 T1 创建新一轮预留而旧 Hold 为 Released，无双占；执行 Grant 撤销后当前管理资格仍能清理明确零派发责任。派发与取消竞争只允许一方提交。最新专项 Action 测试 37 项通过，Reservation 元数据用途继承受信意图以支持独立查回结算，不扩大 Artifact 权限。

接下来：不释放已执行责任的 Snapshot Refresh、父子输出绑定、自动响应/Attempt 观察保存、独立查询 Authority、正式异常纠正与取消后对账，随后真实 Domain/治理 admission 和 pg-boss/公开 HTTP/SDK/CLI/Pi。以上均为本地内部 Owner 验证；还不能宣称 V1 或公开业务服务完成。

Snapshot Refresh 已支持同 Authority/Principal/不可变 Plan 的一次性长计划续签。Snapshot 明确引用 resourceOriginSnapshotRef 和 previousSnapshotRef，原 Reservation 身份/金额/来源不变，仅在完整权限、批准、用途、固定能力、当前两类 Policy 与原资源映射重验后延长 Held 期限并增版本；不重新预留。新 Snapshot 与 Action 当前快照绑定同 UoW，孤立/故障全部回滚；旧 Permit/Attempt 不修改。专项测试验证：首节点 Permit 已提交，旧 Snapshot 真正过期后续签，独立第二节点可用新 Snapshot 派发，仍只有原预留、原 Authority 和原 pins/plan。Action 链路测试当前 38 项。

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

2026-09-08：继续补齐独立只读 Query 链路。第 27/28 号迁移新增 execution.query_exits / query_captures（56 张 Tenant 表）。QueryExitOwner 组合实际 ExecutionAuthority、Service/Grant/fence、Purpose、Connection、ResourceEnvelope/Ledger 与 WorkLease；拒绝使用原派发 Authority 代替查询 Authority，查询参数取自持久 Operation/Permit。安装策略指定正数查询额度、最长 30 秒时限及同 Operation 最小调用间隔。提交一次性出口时原子预留并消费额度，即使随后进程崩溃也不退还；计量单位是已提交查询出口，不是 Provider 账单。

queryOnce 在事务提交后仅调用一次只读 Connector；命令重放仍检查当前权限，但不再次出站。独立查询可在原执行 Grant 撤销后进行；当前查询权限/租约、连接及组织停止仍须有效。超时返回 Interrupted，晚到响应不进入证据链，不据零匹配判定无效果。QueryCaptureOwner 验证进程内真实观察来源与持久出口，用独立观察入口权限保存原始 Artifact、规范化 Receipt、不可变 Capture 和 Audit/Outbox；查询 Grant 撤销不丢弃已取得证据。解析不支持时保存原文，落库失败可通过不含正文的进程内句柄重试，不能再次调用 Provider。

该链路仍为内部组件，详见 [执行 Owner 说明](../../packages/core/src/execution/README.md)。Scope 查询 Authority 正式签发、当前策略证据/停止条件、Connector 安装与 Domain admission 仍需生产装配，集成测试明确使用受信 Fixture。大回执 ObjectStore、终态矛盾证据 Correction、已派发取消/安全重试、常驻 Worker/Publisher、HTTP/SDK/CLI/Pi 与其余 V1 模块继续保留为缺口。

Query 批次全量检查通过：221 Contract + 172 Core（154 PG、7 OPA、6 比较、3 绑定、2 原始编码），28 迁移、56 Tenant 表、48 生成制品、9 API 报告。Action 集成 43 项，覆盖独立 Query/限流/预算、撤权后观察入口、原始回执与 Capture 原子回滚、超时及进程内重试。类型、构建、生成一致性与公共 API 检查通过；本批隔离容器已清理。详见 [Query 验证记录](verification-2026-09-08-query.json)。

Scope 签发前置政策隔离：第 29 号迁移将 Mandatory Policy Binding 唯一键从组织改为组织/输入 Schema。旧绑定保留为 ActionPolicyInput，记录与列一致性由数据库 CHECK 校验；ScopeAuthorityPolicyInput 使用独立绑定，不会覆盖 Action 的当前政策。PolicyOwner 对 Action 的 Mandatory/Behavior 均验证输入类型；Scope 只走独立 Mandatory 评估，闭合输入包含委托草案、Grant 快照、来源版本和 ResourceEnvelope，评估摘要包含当前绑定版本。重新激活即改变证据摘要，不能复用旧允许结果代替当前评估。

实际 OPA Fixture 增加独立 Scope 规则并用固定 1.20.2 编译器重建；Policy 持久化专项 7 项通过，覆盖两种政策互不替代、派生权限不匹配拒绝、输入回验拒绝、绑定版本变化、数据库类型约束。Scope 允许只保存 PolicyEvaluation，不生成 Grant/Authority。实际来源解析、管理权限和 Scope Authority 签发仍是下一步，本次没有将 Fixture 输入当作生产授权链。

Scope Policy 基础批次全量检查通过：221 Contract + 173 Core（155 PG、7 OPA、6 比较、3 绑定、2 原始编码），29 迁移、56 Tenant 表、48 生成制品、9 API 报告。类型、构建、契约生成及 API 一致性通过；隔离测试容器已清理。详见 [Scope Policy 验证记录](verification-2026-09-08-scope-policy.json)。下一步仍是实际来源解析与 Scope Authority 签发，不将政策评估等同于完整授权装配。

Scope 来源解析继续推进：resolveScopeAuthoritySource 从当前组织读取实际执行 Service、允许提议人、成员关系、Grant、Purpose 与不可变 ResourceEnvelope，锁定相关 fence 后检查租户、版本、状态、用途、委托范围及有效期上界，生成包含成员/fence/Grant/用途/包络版本的闭合政策输入。来源读取不代替签发管理权限，也不创建 Authority。当前只处理已有同组织/单用途来源；非空停止 Predicate 与跨组织来源仍需注册验证器，不能默认为允许。

Action 集成中的真实 Query Fixture 加入来源验证：回读实际 Grant/Envelope、记录成员与 fence 版本、拒绝未授予动作/扩大有效期/非 Service 执行主体，Query Grant 撤销后读取来源拒绝。正式 Scope 签发 Owner 与管理权限装配仍待接入。

ScopeAuthorityOwner 已加入：CreateScopeAuthority 使用明确管理 Grant 校验 abh.execution-authority.create，重新读取 Service/Grant/用途/包络来源，校验当前 Scope Mandatory 绑定、政策 Artifact 与持久 PolicyEvaluation 的目标、允许结果、义务、规则版本和输入摘要。新 Authority 固定 Scope 绑定、来源证据、签发 Actor/版本与摘要；复用已有 Service Grant 与实际资源包络，不生成额外 Grant/预算。按证据/effectKey 语义去重，管理权限仍需当前有效；同来源异输入拒绝，历史回放不复活旧来源。

集成将实际来源→OPA Scope 评估→管理权限→Scope 签发接入独立 Query 场景，并覆盖管理权限缺失、原子回滚、同证据幂等、异输入冲突。正式治理入口/政策发布与 Connector admission 仍保留受信 Fixture；非空停止条件、跨组织和多用途 Scope 扩展仍待实现。

Scope 签发批次全量检查通过：221 Contract + 173 Core，29 迁移、56 Tenant 表、48 生成制品、9 API 报告。新增签发场景纳入现有 Query 集成测试；Query 已使用实际签发 Scope Authority。构建、类型、API 与生成一致性通过，隔离容器已清理。见 [Scope 签发验证记录](verification-2026-09-08-scope-create.json)。后续公开 Command ingress 仍须在 CommandReceipt 重放前执行当前管理 admission，不能仅依赖 Owner 内部检查。

Scope 签发内部 ingress 已补齐：createScopeAuthority 接受内部 VerifiedContext，在同一事务中于 CommandReceipt 查回前执行 ScopeAuthorityOwner.admit；创建路径仍由 Owner 再验证。入口检查固定 Command 类型与实际 Payload 摘要，返回数据库中的当前 Authority，而非旧回执中缓存的状态。并发命令重放复用同一签发；来源 Grant 撤销时可在当前管理权限下读取历史结果，管理 Grant 撤销后旧 Command 重放也拒绝。该函数是内部装配入口，尚未挂载公共 HTTP。

Scope 运行时政策校验已加入 assertScopeRuntimePolicy：读取当前 Authority 与签发 PolicyEvaluation，核对来源规则证据、目标/版本/租户、允许结果及义务，再用当前 Service Context 回读 Scope 来源并执行当前 Mandatory Policy。保留签发时的额度/期限/Grant 上界，不借用签发者 Session，也不重新签发。Query 预先锁定执行人与允许提议人的 fence，使运行时来源检查与撤权互斥。实际 Query 集成已用该校验替换空政策回调，覆盖政策收紧时已有 Scope Authority 拒绝出站且不消费预算，恢复允许政策后继续查询。

Scope runtime 撤销竞争修复：assertScopeRuntimePolicy 自行按 canonical fence 顺序锁定 Authority、组织、调用者、执行人、允许提议人及 Grant/Purpose/Envelope，再读取当前 Authority 和评估来源。单独调用不再依赖 Query 预先持锁。真实 PostgreSQL NOWAIT 竞争验证校验事务确实持有 Authority fence；同事务提升 Authority fence 后再次校验拒绝，错误回滚不会改变原 Authority。原 Query 组合复用已持锁，保持锁顺序。

多用途来源校验基础：PurposeOwner.requireAllCurrent 返回全部当前 Purpose 并拒绝重复身份；requireCurrent 保持选取当前用途的兼容语义。Scope 来源解析验证每个用途都被实际 Service Grant 与 ResourceEnvelope 覆盖，并将全部 Purpose 版本加入来源向量。集成覆盖已有单用途 Grant 扩展用途被拒绝、双用途 Grant 的实际来源读取及重复 Purpose 拒绝。Scope 签发仍显式限定单用途，跨用途管理 admission 与签发证据发布尚未实现，不能因来源支持多用途而提前放行签发。

多用途 Scope 签发接入：Scope 政策评估确认委托用途全部被当前政策版本、Mandatory 绑定及政策 Artifact 用途覆盖，评估证据按这些用途发布。新签发要求每个管理 Grant 覆盖全部委托用途，并核对证据用途；Authority 保存完整用途集合。来源摘要只包含委托依赖的 fence，额外管理 fence 参与锁定但不污染政策输入摘要。双用途集成覆盖单用途管理者拒绝、全用途管理者签发及 Authority/评估证据用途一致性；跨组织与停止 Predicate 仍未完成。

多用途跨用途运行验证：双用途 Scope Authority 现在在集成中实际提交，再由另一用途的新 VerifiedContext 读取并运行 assertScopeRuntimePolicy；无关用途读取拒绝。ExecutionAuthorityOwner.get 加强持久一致性检查：组织/ID、执行主体、来源类型/ID、effectKey、期限列与记录内容、签发摘要必须一致，不能用修改元数据列隐式延长授权。期限列漂移负例在事务中拒绝并回滚。

已派发取消基础已加入 ActionOwner.requestCancellation：在当前取消 admission 与父 Action 锁下，Executing → Reconciling，记录数据库时间 cancellationRequestedAt，并同事务取消 attemptCount=0 的 Pending Operation。已派发子项及原 outcome 不改，预算预留和资源占位不释放；Pending 且已有 Attempt 的安全重试场景拒绝交由后续协议处理。取消不会写父 Action Cancelled，最终仍须现有 Reconciliation/Controller/结果结算确认。当前取消 admission 为内部注入接口，公开 Command 重放授权和常驻恢复装配仍需接入。

真实 Provider 响应丢失后的取消专项覆盖回滚恢复全部子项与父状态、保留已派发 Operation/账本/资源占位、停止剩余子项、命令去重及权限拒绝。该能力不代表完整取消/安全停止和生产入口验收。

已派发取消内部入口 cancelDispatchedAction 已接入当前实际 Grant：固定 abh.actions.cancel 与 abh.action.prepare 注册用途，验证 ActionRef/请求正文摘要，在 CommandReceipt 查回前及 Owner 写入前校验身份、Grant 与 fence。返回当前持久 Action，取消权限不依赖原执行 Grant。集成使用真实取消 Grant，先撤原执行 Grant，再并发取消并查回同一 Reconciling Action；取消 Grant 撤销后旧命令也拒绝。入口尚未挂载公开 HTTP，治理来源及完整取消后对账调度仍待装配。

取消后恢复缺口修复：ActionOwner.observeChildProgress 支持 Executing 与 Reconciling，子项 Unknown/最终报告只更新 outcome 与版本，不把取消中的父 Action 切回 Executing。状态注册补齐 Reconciling → Reconciling 的 action.advance 路径。集成将过期 Permit 恢复放在取消之后，验证 Unknown 保留取消时间、资源与预算且不能提前结算；最终无效果对账路径也加入取消，验证 Reconciling 可在真实报告与结算后 Closed。

取消/恢复批次全量检查通过：221 Contract + 174 Core（156 PG、7 OPA、6 比较、3 绑定、2 原始编码），29 迁移、56 Tenant 表、48 生成制品、9 API 报告。Action 专项 44 项；构建、类型、生成与 API 检查通过，隔离容器清理完毕。见 [取消恢复验证记录](verification-2026-09-08-cancellation.json)。取消后 Unknown 恢复与确认无效果后的最终结算已覆盖；常驻调度、安全重试和终态 Correction 仍未完成。

取消/出口竞争证据补齐：实际 Permit 签发后分别验证取消先提交与取消/dispatchOnce 并发。取消先提交零 Provider 调用；并发允许已提交一次性出口对应至多一次调用，之后旧 Permit 出口拒绝。从未派发的子项成为 Cancelled，不能取得新 T2 授权；原预留与已派发资源 fence 保留。测试使用真实 PostgreSQL 锁与 FakeProvider，取消 admission 仍为该专项的明确 fixture；实际 Grant ingress 已由相邻专项覆盖。

恢复发现入口 pendingReconciliation 已加入 OperationOwner，第 30 号迁移添加组织/ID 的未终结操作部分索引。扫描只允许 abh.operation.reconcile，用途/工作区/RLS 约束下按 UUID 游标返回最多 100 个 Dispatching/Observing Operation Ref；不读取业务正文、不申请租约、不执行外部查询或修改结果。每轮结束需重置游标，以覆盖较早 UUID 后来进入待对账的操作。调用者对每项仍须当前 admission 与 WorkLease；该内部扫描不等于跨租户常驻调度。

取消后过期恢复集成新增分页发现验证：已派发操作可发现、取消的未派发子项不可发现、无重复、页大小有界、错误用途/过大页拒绝、其他租户无结果。现有 Controller 再执行原 Unknown 恢复流程。

recoverOperation 内部入口已接入：验证固定 Command 类型与 OperationRef/正文摘要，CommandReceipt 读取前检查实际 abh.operations.recover Grant、身份与 fence；新执行由 OperationController 校验原版本、到期 Permit、资源占位和当前 WorkLease。回执重放只返回当前 Operation，不再次更改 Attempt/Action，不要求把旧租约复活。取消后过期恢复集成改用真实独立恢复 Grant，覆盖无权限拒绝、并发恢复命令幂等、撤权后旧回执拒绝；Unknown 的资源/预算保持原状。


## 2026-09-08：租户内有界恢复 Worker

新增 `execution/recovery-worker.ts`，将 `pendingReconciliation`、WorkLease 与实际 Grant admission 的 `recoverOperation` 接为可取消的循环。每页最多 100 条，按 UUID 游标推进，扫完回到起点；每页及每项重新取得 Service Context，并固定组织、工作区、执行主体和 acting organization，防止 Context 提供者漂移导致跨租户处理。事务有独立 deadline，停止信号传入数据库和页间等待。

逐项先验证当前 recovery Grant、Operation 版本和数据库时钟下的 Permit 过期，再以 30 秒 WorkLease 认领；恢复提交重新检查权限、资源栅栏和租约。租约竞争、版本变化和源事实消失留待后续扫描；权限和事实完整性错误上报宿主。只将过期 Dispatching 转入 Observing/Unknown，不执行网络 Query、不生成新 Attempt、不结算或释放资源；Observing 交给独立对账链。崩溃后依赖持久状态和租约到期重新扫描；目前不维护持久扫描游标。

集成覆盖无 Grant、其他活跃 Worker、Permit 未过期、到期恢复、Observing 跳过、分页停止、逐项新 Context 和主体漂移拒绝。此处是可调用的租户内 Worker 组件；生产托管、受限全局租户发现、Publisher、Observing 调度和独立恢复门禁仍未完成。

验证：Action 45 项通过；全仓检查中 221 项 Contract 和 164 项 Core 通过，唯一失败为数据库 Fixture 在 10 秒内未绑定容器端口；该文件重跑 11 项全部通过，Core 累计 175 项通过。最终 build/API check 通过，30 号迁移完成验证，无遗留测试容器。首次失败及重试分别保留原日志，证据为 `verification-2026-09-08-recovery-worker.json`，不将首次 `pnpm check` 标记为成功。


## 2026-09-08：Outbox Publisher 与租户内发布循环

新增 `durable/publisher.ts`，串接真实事件读取、路由冻结、WorkLease、DurableExecutionPort enqueue、进程内 Completed 证明和 Owner 确认事务。恢复时只重投未确认消费者，保持冻结 Job 参数和 dedupeKey；全部确认才写 publication，已完成重放仍执行当前 admission。每项出站前续租和重验权限，出站后重新取得当前 Service Context，丢失 lease 不能确认。Port 等待以 10 秒上限、请求期限、租约期限和 AbortSignal 共同约束，非配合实现也不能永久阻塞发布函数。

`OutboxOwner.pendingEvents` 按租户、工作区、已安装事件类型/历史未完成路由过滤，最多 100 个事件 Ref。`runOutboxPublisher` 默认 100 条/500 ms，扫描到底后重置游标，Context 不允许改变组织、工作区、acting organization 或主体；权限/完整性错误上报，竞争失败下轮恢复。待投递向量在路由锁下读取，避免与最终 publication 竞争导致不一致。

真实 PostgreSQL/pg-boss 集成覆盖部分投递、Tracked 不确认、入队成功后崩溃、只重投未确认项、已完成重放不发新任务、重放当前 admission、非配合 Port 超时、订阅变化后的旧路由发现、跨租户隔离和停止循环。生产身份/路由/Port admission 仍需正式装配；受限全局扫描、背压与指标、保留水位和独立验收未完成。

准备路由命令使用稳定事件幂等键，持续轮询复用同一 CommandReceipt；当前 prepare admission 在查回执前执行，重放不会绕过权限。

验证：`pnpm check` 全部通过，221 项 Contract、176 项 Core，包含 10 项 Inbox/Outbox 集成测试；新增稳定回执修改的 Core typecheck 与 Inbox/Outbox 文件重跑也通过。30 号迁移、48 个生成物和 9 个公共 API 报告一致，无遗留测试容器。证据保存为 `verification-2026-09-08-publisher.json`，完整日志为 `artifacts/verification/publisher-check.log`。


## 2026-09-08：原生队列并发入队与投递代次确认

`adapter-pg-boss` 新增隔离 Queue 角色事务连接。对组织/消费者/dedupeKey 派生的稳定 Job ID 取得事务 advisory lock，再通过 pg-boss 公开 findJobs/send 的 db 参数在同一事务中检查各队列与入队。多个 Adapter 实例跨队列同键竞争时只有一个输入成功，另一输入为 IDEMPOTENCY_CONFLICT；Completed 在队列事务提交后返回。超时仍保留 Tracked 和排空的在途事务记录。

complete/fail 先以只读 `SELECT ... FOR UPDATE` 锁定原生 Job，校验实际 active、retry_count、started_on、created_on 和数据库时间下的 expire_seconds，再用公开 API complete/fail 提交，拒绝已过期或被新 Worker 接管的旧代次。取消认领和无效消息退回使用同一保护。旧代次清理仅删除自己对应的进程内活动记录，避免删除后续 fetch 的新代次。该查询固定 Schema 40，无自写原生 UPDATE，也不与任意业务 UoW 拼事务。

驱动桥接保留 pg-boss 已序列化 JSON 参数，避免 postgres.js 将 JSON 字符串再次编码成标量；postgres 3.4.9 从 Adapter 开发依赖移为运行依赖。测试以真实 PostgreSQL/pg-boss、两个 Adapter 实例验证跨队列同键竞争；通过明确的原生重试故障注入验证旧 complete/fail 不改变新 Worker 的 active 状态，并检查尚未被 supervisor 回收的过期代次也不能确认。Publisher/Inbox、响应丢失与排空测试一并回归。

保护依赖原生 Job 仍被保留；清理后的长期幂等绑定、各消费者保留水位、生产身份与部署、全局受限调度和完整 V1 验收仍未完成。

验证：`pnpm check` 全通过，221 项 Contract、178 项 Core（含 9 项原生队列与 10 项 Inbox/Outbox）；并发重复确认只有一个成功，另一确认按旧代次拒绝。构建与 9 个公共 API 报告通过，30 号迁移不变，无遗留测试容器。证据为 `verification-2026-09-08-queue-concurrency.json`，完整日志为 `artifacts/verification/queue-concurrency-check.log`。


## 2026-09-08：Outbox 全消费者处理完成凭证

新增 OutboxConsumptionRecord、RecordOutboxConsumptionPayload、独立当前权限和 Internal Command/事件注册。第 31 号迁移新增不可变 `runtime.outbox_consumptions`，按组织/路由唯一、FORCE RLS、运行角色仅 SELECT/INSERT。Core Owner 从真实 publication 与冻结投递集合出发，逐消费者读取已提交 Inbox，并校验事件/摘要/源聚合版本和 ordinal；全部符合才原子保存消费完成事实、Audit 和 Outbox。不接受调用者传来的 Inbox 清单，也不调用 Consumer 或改写业务结果。

Ingress 使用稳定路由幂等键，当前 Grant admission 在 CommandReceipt 读取之前。Owner 支持语义重复与完整证据重验，失败不保存部分凭证。`pending` 提供最多 100 个已发布/未记录完成的路由引用，带 UUID 游标和租户/工作区限制，扫描候选不等于完成资格。

真实 PostgreSQL 测试覆盖未发布、已发布但无人处理、只完成一个消费者、无关消费者不可替代、全部实际处理后保存、事务回滚、并发幂等、当前权限缺失/撤销、外租户隐藏及不可变存储。该事实是后续保留水位输入，尚不是全局连续水位或删除授权；新消费者回填、法律保留、幂等墓碑、独立 Maintenance Command 和生产清理仍未实现。

验证：`pnpm check` 全通过，221 项 Contract、179 项 Core（11 项 Inbox/Outbox），31 个迁移、57 张 Tenant 表、48 个生成物、9 个公共 API 报告，无遗留测试容器。证据为 `verification-2026-09-08-outbox-consumption.json`，完整日志为 `artifacts/verification/outbox-consumption-check.log`。

## 2026-09-08：消费者完成恢复与租户循环装配

新增 `runConsumptionWorker`，默认每页 100 项/500 ms，从实际 publication 候选调用独立授权的 completion ingress。每项刷新 Context，固定租户/工作区/主体，拒绝授权缺失或身份漂移，缺失 Inbox 留待后续扫描；完成后候选自动退出。真实 PostgreSQL 回归覆盖缺失结果等待、自动完成、取消和授权拒绝。

新增 `runTenantRuntime`，统一装配 Operation 恢复、Publisher、消费者完成循环，校验三个用途 Context 的租户边界一致。任意循环失败会取消其他循环并等待它们完成收尾后抛错；并发错误保留为 AggregateError，外部取消在全部循环结束后返回。单元测试验证故障传播、等待清理、外部停止和并发异常。宿主仍需生产 Context 签发、进程信号接线、队列消费者、drain/关闭依赖和重启策略；连续水位与保留删除尚未实现。

验证：最终 Core typecheck、13 项 Inbox/运行循环相关测试、215 个文档链接通过，无遗留测试容器。本次未重复全仓检查，证据为 `verification-2026-09-08-consumption-runtime.json`，上一批全仓结果单独保留。

## 2026-09-08：原生队列到实际 Inbox/Owner 的 Worker 装配

新增 `consumeOutboxDelivery` 与 `runDeliveryWorker`。每次 fetch 后从安装目录选择 Consumer，重新取得 Service Context，核对队列组织，再回读实际事件与冻结路由；消费者 ID、完整 Job 载荷和事件摘要均须匹配。之后由既有当前授权 Inbox ingress 调用真实 Owner，成功提交才 complete 队列。Job 不携带可替代当前业务 Authority 的授权；未安装消费者与篡改 Job 均拒绝。此 Worker 当前只处理 Outbox 冻结事件路由。

`consumeCommittedEvent` 将结果读取合并到原提交事务，避免提交后开启第二事务而产生不必要的不确定读。确认失败仍抛给宿主，已提交 Inbox 不回滚；原生重投重新 admission 并返回原 Inbox，实际 Owner 不重复执行。停止时已提交结果先完成确认尝试，未提交事务响应 AbortSignal。

真实 pg-boss 集成覆盖冻结目标篡改、组织/消费者不匹配、实际 Owner 成功后确认丢失、原生 retry 再处理、一次 Owner 效果及最终 completed/Inbox 输出。生产 Context 解析、其他 Job 类型与完整进程托管尚未完成。

验证：Core typecheck、23 项 Inbox/Outbox/pg-boss/宿主回归测试与 215 个文档链接通过，无遗留测试容器。包含 Owner 失败时事务不变且队列不确认的断言。证据为 `verification-2026-09-08-delivery-runtime.json`；本次为相关回归，未重新运行完整 workspace check。

## 2026-09-08：服务排空与依赖关闭装配

新增 `runRuntimeService`：join 已停止的循环后，以独立当前 Context 和信号调用 drain，将实际报告交给持久保存回调，然后依次关闭 Queue 与 Database。drain 的业务等待期限最多 60 秒，另有 250 ms 报告返回窗，防止宿主超时与原生到期报告竞争；忽略取消的 Port 也不能永久阻塞。未完成 Job 只记录剩余 Ref，不伪造业务或队列成功。运行/保存/关闭异常保留为 AggregateError，包含已取得的真实报告。

`joinRuntimeLoops` 新增意外正常退出检查，任一常驻循环提前结束会取消其他循环。测试覆盖等待循环收尾、依赖关闭顺序、多个失败保留、Port 不配合取消、意外退出，以及真实 pg-boss 有活动任务时返回未排空报告且不改写原生 active 状态。生产信号、Ingress 停接、报告持久保存和关闭提供者自身期限仍由服务装配负责。

验证：Core typecheck、16 项运行宿主/退出/原生队列测试、215 个文档链接通过，无遗留测试容器。本次为定向回归，证据见 `verification-2026-09-08-runtime-shutdown.json`。

## 2026-09-08：进程信号与 Ingress 停接接线

新增 `runProcessService`，在运行期间注册 SIGTERM/SIGINT，重复信号只触发一次退出；任何成功/失败返回都移除本次监听器，不触碰 process.exit 或全局错误处理。`runRuntimeService` 新增 stopIngress 钩子，先同步停止新请求，再取消 Worker，随后等待两者收尾后执行排空与依赖关闭。循环异常也调用同一停接路径；入口关闭异常与运行/排空异常共同保留，不跳过依赖关闭。重入停止有显式防重标记。

测试覆盖两个信号、重复信号、监听器清理、Worker 失败伴随入口失败、入口停接先于 Worker 取消、在途请求结束先于数据库关闭，以及真实 pg-boss 的未排空报告/确认丢失回归。HTTP 入口实现、持久报告后端、生产身份签发与完整服务启动仍未完成。

验证：最终 Core typecheck、19 项宿主/信号/排空/原生队列测试、215 个文档链接通过，无遗留测试容器。信号测试使用 EventEmitter 注入，不发送系统进程信号。证据为 `verification-2026-09-08-process-service.json`。

## 2026-09-08：本地持久排空报告日志

新增 `LocalDrainJournal`，用于已有持久卷部署的退出报告保存钩子。按组织/实例路径隔离，以 canonical JSON 摘要命名，临时文件 fsync 后原子 link 发布并 fsync 目录；并发重复保存返回同一摘要，既有内容不匹配时拒绝覆盖。读回校验格式、租户/实例、摘要和实际 DrainReport，保留未完成 Ref。路径根及祖先由部署控制；文件/最终目录拒绝符号链接，权限 0600/0700。当前不提供清理或重放权限，不能将其当作业务 Audit 或 ObjectStore 的替代。

文件系统测试覆盖重新实例化读取、并发重复、原文件篡改、失败不覆盖、临时文件清理、组织隔离、契约错误与符号链接拒绝。真实断电/文件系统耐久门禁尚未验证；生产部署必须使用支持 link/fsync 的持久卷，根目录预先创建。

验证：最终 Core typecheck、8 项日志/退出/进程服务测试、215 个文档链接通过。证据为 `verification-2026-09-08-drain-journal.json`，本次未重跑全仓检查。

## 2026-09-08：Action 授权等待的真实通知路由

`ActionApprovalWaitOwner.router` 从持久 DurableWakeup/Cancelled Wait 和实际 ActionWait 绑定推导通知目标，不接受请求自带 Action/消费者。它核对 wait、owner、authority 绑定，生成固定消费者 `abh.action.wait-notification` 的 action.advance Job；事件/消费者派生幂等键，路由冻结后复用原 Job。路由不签发 Authority，也不替代通知消费者当前 Grant。投递窗口由安装参数约束为 1 秒至 7 天，默认 24 小时。

Action 集成测试将原先直接 Inbox 通知改为实际 OutboxOwner.prepare 与 consumeOutboxDelivery，覆盖真实 Decision 关闭后的通知、并发 Inbox 重放及取消等待通知，验证目标来自 ActionWait、无 execution authority、Action 仍保持 Validated/NotStarted。路由规则 Ref/消费者 Ref 和发布权限仍由安装配置提供，正式治理及 Operation/Mission 通知路由仍待实现。

验证：最终 Core typecheck、45 项 Action 集成测试、215 个文档链接通过，无遗留测试容器。本次定向回归证据为 `verification-2026-09-08-action-wait-routing.json`。

## 2026-09-08：Operation 等待通知路由与统一 Wait 路由

JobEnvelope 增加 `abh.operation.notify-wait`，明确目标为 Operation，区别于必须携带查询 Authority 的 `abh.operation.reconcile`。OperationReconciliationWaitOwner.router 从真实 Wakeup/Cancelled Wait/OperationWait 验证绑定并生成通知 Job，未签发执行权限。默认 control 队列，不执行对账网络查询。

新增 composeWaitNotificationRouter，以持久 Wait 的 Owner 类型在安装路由中选择，避免靠权限失败后切换消费者。Action 与 Operation 集成通过该组合器，错误 Owner 处理器若被选择会直接使测试失败。Operation 的超时、取消、最终完成通知均经过 Outbox.prepare 冻结路由及 consumeOutboxDelivery；Provider 次数、预算责任和父 Action 结果保持既有 Owner 控制。新增契约测试区分通知与查询授权，原生队列测试验证通知进入 control 且无查询 Authority。

安装治理、未实现 Owner 的路由、消费者回填和连续水位仍未完成。

验证：`pnpm check` 全通过，222 项 Contract、193 项 Core，31 号迁移/57 张 Tenant 表、48 个生成物、9 个公共 API 报告一致，无遗留测试容器。完整证据为 `verification-2026-09-08-operation-wait-routing.json`。

## 2026-09-08：Wait 持续恢复与逐项入口授权

新增 runWaitRecoveryWorker，每页生成当前服务 Context 句柄，完成或失败后立即撤销；有界分页与 500 ms 轮询，扫完重置游标，Context 组织/工作区/主体固定。租户运行装配新增 waits 安装列表，与 Operation 恢复、Publisher、消费完成循环共用生命周期。

修复 recoverPending 只在候选扫描验证入口 Grant 的缺口：各项 condition wrapper 汇总安装条件与入口 Grant fence，并在实际回查前再次检查入口权限。真实 PostgreSQL 故障注入在候选扫描后改变独立入口 Grant fence，证明该项被 EPOCH_REVOKED 拒绝且 Wait 保持 Pending。Action 实际 Decision 关闭后的遗漏通知通过持续 Wait Worker 恢复，保留原授权边界。

验证：Core typecheck、45 项 Action、最终 13 项 Wait、5 项宿主/进程测试和 215 个文档链接通过。定向回归证据为 `verification-2026-09-08-wait-worker.json`，未重跑全仓检查。

## 2026-09-08：真实 Queue Port admission 目录

新增 QueueAdmissionDirectory，替代 Adapter admission 中仅返回 Fixture scope 的装配方式。服务端注册真实 Service/runtime.deliver Context 与已安装消费者，绑定 Grant 并签发随机句柄；resolve 只接受 enqueue/inspect/drain，使用当前租户 UoW 验证实际 Grant、身份、用途、scope/fence，返回绑定组织和消费者。有限目录、过期回收、显式撤销和 Grant 复制保护进程内生命周期；拒绝 JSON 克隆的 Context 和未安装消费者。

真实 pg-boss 集成覆盖入队及重放、实际消费者/组织绑定、跨组织 scope 拒绝、inspect 返回真实 Inbox、drain、撤销 Grant 后拒绝入口及撤销句柄。业务处理仍独立验证冻结路由和当前 Owner 权限。生产身份签发、安装治理与共享 Context 服务尚未完成。

验证：最终 Core typecheck、13 项 Inbox/Outbox/真实 Queue admission 集成测试、215 个文档链接通过。定向回归证据为 `verification-2026-09-08-queue-admission.json`。

## 2026-09-08：Publisher 与真实 Queue admission 生命周期连接

新增 QueueAdmissionDirectory.publisherContexts，为每次投递根据冻结路由的组织、摘要、消费者和 Job target 签发当前 ContextRef。Publisher 增加 releaseEnqueueContext 钩子，覆盖 Completed、异常、超时和签发后取消，避免长期运行将每次出站句柄积累到目录上限。Grant/路由配置继续由安装宿主提供，具体入队 resolve 走实际当前权限事务。

真实 pg-boss 测试从 Publisher 到 Queue admission 完成双消费者发布，确认两次调用句柄均被撤销；入队异常和签发后取消也释放句柄，取消路径不调用 Port。既有部分发布、恢复、Inbox 与 revoked Grant 测试一并回归。生产安装治理与身份签发仍未完成。

验证：最终 Core typecheck、13 项 Inbox/Outbox/Publisher admission 集成测试、215 个文档链接通过。证据为 `verification-2026-09-08-publisher-admission.json`，本次为定向回归。

## 2026-09-08：退出排空的真实授权句柄装配

QueueAdmissionDirectory 新增 drainContexts，退出时重新取得可信 Service Context，为实际组织与已安装消费者绑定当前 Grant，并复制固定队列类别，配置期限在 1—60000 ms 内且不超过 Context 到期。RuntimeService 新增 releaseDrainRequest，在报告处理后、依赖关闭前释放句柄；排空、验证、报告保存失败均执行释放，释放错误加入 AggregateError 但不跳过关闭。

真实 pg-boss admission 测试验证生成目标、当前权限排空和释放后句柄拒绝；宿主测试验证成功释放顺序及 drain/release 同时失败时完整保留错误、继续关闭队列/数据库。生产身份签发和安装治理仍为外部依赖。

验证：Core typecheck、20 项 Inbox/退出/进程服务测试和 215 个文档链接通过，无遗留测试容器。定向证据为 `verification-2026-09-08-drain-admission.json`。


## 2026-09-08：身份定位与 Worker 身份刷新的期限传播

IdentityIngress 将请求期限和取消信号传到最小 deployment.identity_locations 查询。Database.locateIdentity 在连接池等待、数据库锁等待及查询执行阶段均受期限约束；取消后消费查询结果再返回，避免留下排队工作，有限期限校验拒绝 NaN/Infinity。真实 PostgreSQL 测试覆盖表锁、显式取消、单连接池占满和取消后连接复用。

新增内部 ContextSource/requestVerifiedContext：安装入口接收 TransactionOptions，Worker 合并期限和停机信号，验证返回值是实际签发且未过期的 Context；不配合取消的入口不能无限阻塞循环，迟到结果不用于业务处理。Wait、恢复、Publisher、消费完成与队列交付均接入，租户宿主透传参数。定向测试覆盖不响应入口、停机、伪造 Context 和迟到结果，真实交付测试验证身份刷新取消不增加 Inbox 或确认 Job。

该实现没有补齐真实 IdP/凭据保管、bootstrap/安装治理及一般租户事务的连接池等待取消。drainRequest、stopIngress、报告保存和依赖关闭仍要求宿主提供有界实现，生产验收与 V1 全部模块尚未完成。

验证：完整 `pnpm check` 通过，222 项 Contract、203 项 Core 测试，48 个生成物和 9 个公共 API 报告一致；最终 215 个文档链接通过，未遗留测试容器。证据为 `verification-2026-09-08-identity-worker-deadline.json`。


## 2026-09-08：数据库连接排队期限与取消

新增 ConnectionAdmission，租户事务、身份定位、readiness 共用与连接池 max 相同的活动额度，按进入顺序唤醒，最多保留 1000 个等待项。排队期间响应请求期限/Context 到期/取消信号，在发出 SQL 前移除失效项；事务提交或回滚完成后才释放额度。关闭 Database 拒绝排队与后续进入者，已有操作仍交给原生事务/关闭处理。

真实单连接 PostgreSQL 测试阻塞首个事务，验证排队超时和显式取消均不执行回调，随后有效 A/B 租户事务按序完成且 RLS 隔离保持；身份定位的表锁/连接池取消回归通过。专门验证排队上限、关闭拒绝及取消后额度交接。生产容量/SLO、事务初始化与连接建立的端到端故障期限仍须继续验证。

验证：Core typecheck、build 与全部 206 项 Core 测试通过，215 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-connection-admission.json`；本批未重跑契约与公共 API 全仓检查。


## 2026-09-08：终态矛盾报告与资源冻结

ResourceFenceRecord 增加 blockedByReportRef，注册 abh.resource-fence.blocked 事件。ReconciliationOwner 在比较 Closed Operation 前锁定实际资源键，对完整回执向量产生的矛盾/歧义及相反确定结论，将不可变报告与冻结同事务提交。Control T2/exit 和资源占用路径检查冻结，原终态、当前未决占位、fencingToken 保留；普通完成清理不会删除冻结。

实际两节点 Action 场景在新 Permit 前及已签发未出口后注入迟到矛盾回执，验证没有第二次 Provider 调用；比较/冻结回滚、当前 admission 拒绝、Command 重放、冻结事件与原 Operation 不变均有覆盖。Human Exception 责任分派、Correction/Domain Result 更正、治理解冻及迟到 Receipt 自动调度还未完成，冻结报告不能等同责任处置完成。

验证：完整 `pnpm check` 通过，222 项 Contract、206 项 Core，48 个生成物和 9 个公共 API 报告一致，最终 215 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-terminal-conflict.json`。


## 2026-09-08：终态回执持续比较 Worker

新增 pendingClosed 与 runTerminalReconciliationWorker，发现未被当前版本报告完整覆盖的 Closed Operation 回执，有界分页后重置游标。32 号迁移增加终态与报告版本索引。compareClosedOperation 使用完整回执向量摘要与 Operation 版本去重，当前独立 Grant/安装 fence 和权限检查在重放之前执行；回执并发新增在资源与父 Action 锁下检测，版本竞争交下轮处理。租户运行宿主增加 terminalReconciliation 安装项，共用身份刷新期限/停机/租户绑定。

Action 实际迟到矛盾场景改由持续 Worker 发现并冻结，pageSize=1 覆盖分页；报告覆盖后扫描清空，调用重放不重复冻结，撤销独立 Grant 后拒绝读取重放结果。原终态、未决占位与零额外 Provider 调用保留。该 Worker 只比较已持久化证据；外部查询、Human Exception/Correction、治理解冻仍未完成。

验证：Core typecheck、build 和全部 206 项 Core 测试通过，实际 Fixture 应用 32 号迁移，215 个文档链接通过，未遗留测试容器。证据为 `verification-2026-09-08-terminal-worker.json`；本批未重跑全仓契约与公共 API 检查。


## 2026-09-08：终态 Human Exception 与责任请求绑定

新增 ExceptionRecord/OpenTerminalExceptionPayload、内部 open-terminal Command 与异常事件，33 号迁移新增不可变 human.exceptions，按报告和 Request 分别唯一。ExceptionOwner 从真实 Closed Operation/矛盾报告/冻结资源/Plan 推导异常依据与影响上限，核对完整责任提案后通过 DecisionOwner 创建 Request/Decision；异常、责任请求、CommandReceipt 和 Audit/Outbox 原子提交。独立 Service Grant 和安装 fence/资格检查在 Command 重放前执行。

无合格责任人保留 Unresolved；有责任人沿用实际 Exception Assignment 与既有 Decision 流程。责任事项关闭不改变原 Operation、不清除资源冻结、不触发预算释放。ResolveException 的注册处置类型、Correction/Domain Result、治理解冻及冻结事件自动创建事项仍未完成。

验证：完整 `pnpm check` 通过，223 项 Contract、206 项 Core，33 号迁移、48 个生成物与 9 个公共 API 报告一致；216 个文档链接通过，无遗留测试容器。实际测试覆盖未分派/已分派责任、Decision 关闭仍冻结、回滚、重放、撤权与跨租户拒绝；审阅资格回调仍为明确 Fixture。证据为 `verification-2026-09-08-exception.json`。


## 2026-09-08：异常诊断的责任状态与技术状态回源

ExceptionOwner.inspect 增加内部当前状态读取，强制安装 admission 回调后依次锁定资源、父 Action 和责任请求。回读并验证异常与 Request 的 kind/subject/proposalDigest/报告证据绑定，分别返回当前 Request Ref/状态/Decision Ref，以及实际 Operation position、当前冻结报告和未决占位。责任关闭不会投影成技术解决，也不修改任何业务状态。

实际异常场景覆盖 Open/Unresolved 读取、Decision 后当前 Request 版本推进且技术冻结保持、安装 admission 拒绝及 Grant 撤销后拒绝，并通过维护故障注入验证替换 Request 报告证据时拒绝返回误绑定状态。正式 HTTP/CLI 查询入口、独立查询动作治理、ResolveException/Correction 和解冻仍未完成。

验证：Core typecheck/build、最终 45 项 Action 集成测试、216 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-exception-inspect.json`；本批为定向回归，未重跑全仓检查。


## 2026-09-08：Decision 当前责任席位回验

修复提交仅检查候选主体、完成汇总只依赖安装 revalidate 回调的缺口。DecisionOwner 统一核对当前 Request/Decision 的 subject/proposal/routeRevision、冻结席位候选、实际 Assignment 类型/范围/有效期/状态及 Human 成员身份；ALL 生成完成凭证前，对全部批准者再次回读。已有批准者失效时拒绝汇总，最后一次响应与完成凭证均不提交。Grant、职责分离、业务条件及并发撤权 fence 仍由安装 admission 负责。

真实 PostgreSQL 故障注入覆盖先前批准者撤销后末席响应回滚，以及候选移出冻结席位后拒绝响应；Action/Exception 既有责任链一并回归。

验证：Core typecheck/build、55 项 Decision/Action 集成测试、216 个文档链接通过，无遗留测试容器。定向证据为 `verification-2026-09-08-current-seat.json`；未重跑全仓检查。


## 2026-09-08：异常责任持续路由 Worker

新增 ExceptionOwner.pending 与 runExceptionWorker，发现当前冻结且没有责任事项的报告，以有界分页、当前 Service Context、独立 Grant 与安装 route/eligibility 创建实际 Exception/Request。route 接收 10 秒期限及取消信号，非配合回调也不阻塞退出，结果必须保持扫描得到的 reportRef。宿主增加 exceptions 安装项。

报告稳定 Command key 与 payload digest 保持既有幂等约束；并发冲突仅在重新授权并确认实际事项已存在或冻结原因已替换后允许略过，错误提案不静默吞掉。Unresolved 也是已持久化事项，不重复创建。责任重路由、正式治理安装、ResolveException/Correction/解冻仍未完成。

验证：最终 46 项 Action/Exception Worker 测试、Core typecheck/build 与 216 个文档链接通过，无遗留测试容器。首轮较早 OPA 调用超时导致实例后续拒绝，保留失败日志，新 Fixture 重跑通过。定向证据为 `verification-2026-09-08-exception-worker.json`，本批未重跑全仓检查。


## 2026-09-08：异常并发创建验证与发现索引

真实 Action 集成安排两个 Exception Worker 先扫描同一冻结报告，首个提交责任提案后，第二个提交不同 Request UUID/摘要。验证仅首个创建一个异常事项，第二个重新授权并读到已存在的异常后完成处理，不创建替代 Request；实际 Unresolved/冻结状态不变。

34 号迁移为 resource_fences 的组织与 blockedByReportRef.id 建立表达式索引，覆盖异常发现及冲突回验的匹配条件。数据库 Fixture 应用迁移后通过 readiness/RLS/取消测试；容量与 SLO 仍未验收。

验证：全部 209 项 Core 测试、Core typecheck/build 与 216 个文档链接通过，无遗留测试容器。数据库 Fixture 使用 34 号迁移。证据为 `verification-2026-09-08-exception-concurrent.json`；本批未重跑全仓契约/API 检查。


## 2026-09-08：Unresolved 原责任席位重试

注册 retry-route 内部 Command 与当前独立 Grant 动作。retryResponsibilityRoute 在重放前验证当前权限与安装 fence；DecisionOwner.retryUnresolved 锁定并完整比对当前 Request，拒绝席位/提案/证据/期限替换，重新读取候选资格后原子创建 Pending Decisions 与推进 Request 版本。不可路由仍返回原 Unresolved，不创建新事项；初始 open 与 retry 共用候选构造和分派写入，版本更新带 CAS。

真实 PostgreSQL 测试覆盖资格恢复后的 ALL 决策完成、并发只分派一次、期限替换拒绝、缺 Grant 拒绝与撤权后重放拒绝。该能力只重试原冻结配置，不实现替换席位、新 Route revision、Delegate/Escalate、自动重试调度或正式 frozenPolicyRefs 治理。

验证：完整 `pnpm check` 通过，223 项 Contract、211 项 Core，48 个生成物和 9 个公共 API 报告一致；216 个文档链接通过，无遗留测试容器。额外覆盖路由事务回滚和错误 Request 版本的 DecisionPackage 拒绝。证据为 `verification-2026-09-08-retry-route.json`。


## 2026-09-08：责任与授权链 Workspace 隔离

对照 Data/Artifact 设计的 Owner Workspace 边界要求，修复 Assignment/Request 写入遗漏 workspace_id、Decision/完成凭证与批准效果未继承来源范围，以及当前责任资格、批准凭证、Grant/Authority 准入与重放的读取遗漏。组织级来源在 Workspace 内处理仍保持组织级范围；工作区来源生成的 Grant/Authority 保持同一工作区。Control 执行来源选择与加锁后回读、Scope 委托来源和撤销路径一并补齐过滤。CommandReceipt 保存创建 Context 的 Workspace，重放在当前准入之后检查范围，不能跳过业务 Owner 直接返回其他工作区的历史结果；组织/主体/命令/幂等键唯一性保持原设计。

真实 PostgreSQL 测试覆盖初次分派/原席位重试、完成凭证、授权效果范围继承与历史重放、跨 Workspace 责任资格/Grant 准入/撤销拒绝，并在实际 Action T1 验证越界批准 Grant、Service Grant 或 Authority 不产生授权执行事实。测试中的安装资格回调仍属 Fixture，不能作为生产治理实现。

历史 NULL Workspace 行无法凭现有信息可靠回填，本批保留原数据。完整责任委派/升级、Exception 注册处置类型、Correction 与治理解冻、生产身份/权限装配和 V1 全量验收仍未完成。

验证：最终完整 `pnpm check` 通过，223 项 Contract、218 项 Core，48 个生成物、9 个公共 API 报告和 216 个文档链接一致，无遗留测试容器。首轮新增 Action 测试误读 Fixture 返回结构，修正后全仓重跑通过，保留首轮日志。证据为 `verification-2026-09-08-responsibility-workspace.json`。


## 2026-09-08：责任请求整体到期与恢复扫描

按 Responsibility 设计的整体期限规则实现 DecisionOwner.expire：数据库时间、当前版本与 Request 锁决定到期；仅 Pending Decision 转 Expired，历史已提交决定保持原样，Request 关闭。Audit/Outbox 与 Owner CAS 同事务，无批准完成证据或授权效果。部分审批后的到期不会被解释为批准成功。

注册内部 expire Command 和独立 Service Grant 动作；expireResponsibilityRequest 重放前校验当前权限。runResponsibilityExpiryWorker 提供租户/Workspace 内有界扫描、Context 刷新、版本竞争回读和停机退出，接入 runTenantRuntime。35 号迁移增加待到期请求索引。真实 PostgreSQL 测试覆盖未到期拒绝、部分批准保留、事务回滚、并发只关闭一次、Workspace 筛选、未来请求保持 Open、Unresolved 到期、当前 Grant 及撤权后重放。

独立 Package 提前到期重提问、责任升级/委派、生产治理和全量 V1 验收仍未完成。

验证：完整 `pnpm check` 通过，223 项 Contract、220 项 Core，48 个生成物和 9 个公共 API 报告一致；最终 217 个文档链接通过，无遗留测试容器。数据库 Fixture 使用 35 号迁移。证据为 `verification-2026-09-08-responsibility-expiry.json`。本批检查了既有 Wait 关闭事件装配，未新增到期通知全链路测试。


## 2026-09-08：到期责任的 Wait Port 与 Action 通知闭环验证

补充实际 Request/Decision、到期 Worker、Wait Port、冻结 Outbox 路由、Inbox 与 Action 消费者的组合测试。覆盖 Request 先关闭，以及 Wait Deadline 先处理后到达关闭事件；重复信号与并发投递保持唯一 Wakeup 和单次业务绑定版本推进，分别记录 SourceClosed/Deadline。两种顺序下 Decision 都是 Expired，Action 保持 Validated/NotStarted，无完成凭证和执行 Authority。

首轮新增子测试错误挂载父级 TestContext，已主动终止该测试并清理专用 Fixture，修正后重新验证。仅增加集成证据和 Fixture 支持，不据此宣布生产装配或完整 V1 验收。

验证：48 项 Action 集成测试、Core typecheck、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-expiry-wait.json`。本批只修改测试和说明，未重跑全仓检查。


## 2026-09-08：责任资格撤销、必要席位保护与不可变依据

注册内部 RevokeResponsibilityPayload/Command、独立 Grant 动作及 LAST_REQUIRED_RESPONSIBILITY。准入收集全部安装 fence 后验证当前管理 Grant，重放仍验权。Owner 在组织 fence 下查找受影响的必需冻结席位，只有存在当前有效且通过安装审批资格检查的剩余候选才允许撤销；replacementRef 不会自动替换冻结席位。安装 continuity 必须验证目录级必需岗位、管理与证据。

Assignment 版本/状态、控制 fence epoch/stopFlag、不可变撤销依据、Audit/Outbox 原子提交。36 号迁移保存撤销理由/证据/来源版本，并添加请求冻结候选 GIN 索引。真实 PostgreSQL 测试覆盖最后必要席位保护、候选资格拒绝、治理拒绝、事务回滚、同键重放、并发双方撤销只成功一方、旧责任人提交拒绝、合法剩余候选响应、跨 Workspace 拒绝和不可变表权限。

当前撤销事件可供后续路由重算消费；自动消费、新 Route revision/委派/升级与生产治理仍未完成。隐藏 Workspace/用途的必要依赖保守拒绝，不能以替代 Ref 绕过原路由。

验证：完整 `pnpm check` 通过，223 项 Contract、223 项 Core，48 个生成物、9 个公共 API 报告及 217 个文档链接一致，无遗留测试容器。数据库 Fixture 使用 36 号迁移。证据为 `verification-2026-09-08-responsibility-revoke.json`。


## 2026-09-08：Pending Decision 撤回及实际源事项/Wait 装配

实现既有 WithdrawDecision 契约的内部入口，当前独立 Grant 与管理 admission 在重放前执行。安装方按锁序锁定源事项，Owner 在 Request 锁下回验版本/期限/源绑定并要求真实取消或替换证据。原事项撤回使 Request 与全部当前 Pending Decision 进入 Withdrawn，已批准历史保持不变。37 号迁移保存不可变撤回依据；状态、证据、Audit/Outbox 同事务。新 Request/Decision 登记审批用途并继承来源用途/Workspace，旧记录用途不猜测回填。

Action Wait 新增 Request.withdraw 订阅，允许 Withdrawn Request 对已 Cancelled Action 通知 SourceClosed，不修改 Action 技术状态。真实 Action Owner 测试覆盖未取消拒绝、取消后真实版本证据、Wait Port/固定 Outbox/业务消费者；Decision 测试覆盖部分批准历史保留、源证据和管理权限拒绝、事务回滚、重放撤权、Workspace 隔离及末席批准竞争。

尚未挂载公开 HTTP/SDK；通用源事实/生产治理、自动撤回源事项、已生效权限撤销、新 Route revision 与委派/升级仍未完成。

验证：最终完整 `pnpm check` 通过，223 项 Contract、226 项 Core，48 个生成物、9 个公共 API 报告和 217 个文档链接一致，无遗留测试容器。Fixture 使用 37 号迁移。首轮资源 fence 用例因 Docker 端口绑定超时未启动，新 Fixture 全仓重跑通过，保留首轮日志。证据为 `verification-2026-09-08-decision-withdraw.json`。


## 2026-09-08：责任候选必须覆盖原请求范围

修复在 Workspace 内处理组织级 Request 时将局部 Assignment 当作组织级替代候选的缺口。currentResponsibility 同时过滤调用上下文与所需请求范围；原席位重试、Decision 当前席位/完成回验、批准核验和 Authority 效果使用持久来源范围，撤销连续性检查也要求剩余候选覆盖受影响 Request。

真实 PostgreSQL 测试覆盖工作区候选不能保住组织级必要席位、失败不写撤销依据、原席位重试保持 Unresolved，以及故障注入将原组织级候选收窄后提交拒绝且不创建批准凭证。正式跨组织委派、新路由与生产资格治理仍未完成。

验证：73 项 Decision/Action 集成测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。本批定向回归，未重跑全仓检查。证据为 `verification-2026-09-08-responsibility-coverage.json`。


## 2026-09-08：责任路由新版本与不可变变更依据

注册 revise-route 内部 Command，独立 Grant 与安装 admit 在重放前执行。Owner 校验当前 Request 版本、新版本/routeRevision 递增、原事项与期限保持不变；禁止删除/降级必要槽位及减少席位。govern 在声明的政策/目录/委派/资格 fence 下验证实际版本与合法替换。旧 Pending 进入 Superseded，旧 Approved 历史不改，新路由重新取得全部响应。

38 号迁移持久保存旧 Request、完整新提案和政策/目录/理由/证据；事件、Decision 和 Request CAS 同事务。无法路由时新版本为 Unresolved，随后可通过既有 retry-route 恢复新席位。Action Wait 支持 unroute/route-revised 回读，路由变化不视为批准。初始生产政策目录、专用委派/升级、自动目录消费、旧批准携带和跨组织路由仍未完成。

定向测试覆盖治理拒绝、缺 Grant、冻结字段/必要席位变更拒绝、事务回滚、并发幂等、旧响应拒绝、历史批准保留、新席位重新完成、不可变记录、Workspace 与 Unresolved 恢复。首轮降级测试的输入先被 Schema 拒绝，调整为合法 ANY 结构后验证 Owner 拒绝，保留首轮日志。

补齐 Wait 的同版本事件序号：ActionApprovalWaitOwner 从持久 Outbox 读取该 Request 当前版本最大 eventOrdinal，避免 Unresolved 重路由的第二条事件被当作来源尚未推进。实际 Wait Port 测试断言序号 1 的 route-revised 可被观察，等待保持 Pending 且没有 Wakeup。

验证：完整 `pnpm check` 通过，223 项 Contract、231 项 Core，48 个生成物、9 个公共 API 报告和 217 个文档链接一致，无遗留测试容器。Fixture 使用 38 号迁移。证据为 `verification-2026-09-08-route-revision.json`。Wait 来源序号依赖已保留 Outbox 元数据，后续保留清理仍需保证来源水位不倒退。


## 2026-09-08：批准效果签发的完整席位与来源绑定

补齐 ExecutionAuthorityOwner.issueEffect 比执行批准回验更弱的结构验证。现在要求真实 Authorization Request、当前行版本/状态/期限、完成凭证身份与组织，逐项核对 Decision 属于当前冻结席位与候选、实际响应 Human 绑定当前 Assignment，并验证 Package 的请求/路由/事项/提案及提交摘要。错误来源不能靠 permissive 安装回调签发 Grant/Authority。

真实 PostgreSQL 故障注入覆盖响应人替换、候选集合替换、正确摘要但错误 Request 的 Package、旧路由/不匹配路由、非 Authorization Request 和冻结席位替换；恢复原记录后合法效果仍可签发并保留重放撤销语义。生产 Grant/条件/管理权限及完整 V1 验收仍未完成。

验证：76 项 Decision/Action 集成测试、Core typecheck/build 和 217 个文档链接通过，无遗留测试容器。定向证据为 `verification-2026-09-08-effect-binding.json`，本批未重跑全仓检查。


## 2026-09-08：Unresolved 原冻结路由自动恢复

新增 DecisionOwner.pendingRouting 和 runResponsibilityRoutingWorker，接入 runTenantRuntime.responsibilityRouting。当前 Service 在用途/Workspace 内有界扫描未到期的 Unresolved 请求，加载提案前和 Owner 重试时分别验证独立 Grant；Context 刷新与提案加载都有 10 秒上限并响应停机。提案绑定扫描版本，实际 Owner 再比对完整冻结请求；不允许自动改席位/期限。

每轮独立 Command key 允许历史 no-op 后资格恢复，默认间隔 30 秒；版本竞争和处理期间到期不丢弃责任，权限与提案错误不静默吞掉。真实测试覆盖资格从不可用恢复、两个 Worker 同时加载只分派一次、Workspace 过滤、缺 Grant、错 Ref、加载期间撤权、非配合回调取消。

原冻结包加载仍由可信安装负责；初始包自动查询、跨组织/全局发现、新路由/委派/升级自动调度和生产容量/保留验收仍未完成。首轮测试误假定 Workspace 隐藏组织级请求，已使用独立用途隔离 Fixture；业务扫描语义保持不变。

验证：全部 232 项 Core 测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-routing-worker.json`。本批没有契约变更，未重跑全仓契约/API 检查。


## 2026-09-08：冻结路由提案原子存储与默认恢复

39 号迁移新增不可变 routing_proposals，按请求/路由版本唯一。初始 open 和 reviseRoute 保存原 Request/DecisionPackages，与状态/Audit/Outbox 同事务，继承原 Workspace/用途。读取只接受当前精确版本 Unresolved，并验证完整请求、包摘要及事项/路由/槽位/期限绑定。

runResponsibilityRoutingWorker 默认从 Owner 读取冻结记录，不再必须安装提案加载器；加载时版本竞争留待扫描。可选加载器保留历史记录兼容，缺失记录不猜测回填。测试覆盖新连接读取、无自定义加载器的资格恢复、新路由记录、初始创建/改路由回滚、不可变权限、Workspace 与损坏拒绝。生产治理、全局发现、新路由自动调度与完整 V1 验收仍未完成。

验证：全部 233 项 Core 测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。Fixture 使用 39 号迁移。证据为 `verification-2026-09-08-routing-proposals.json`。本批复用既有契约，未重跑全仓契约/API 检查。


## 2026-09-08：原路由恢复强制比对完整冻结包

修复 retry-route 仅比对 Request、未比对持久 DecisionPackage 的缺口。现在在 Request 锁下加载原冻结提案，并对整份输入做一致性检查；重新计算有效摘要不能替换问题、风险、影响描述或 Package 期限。缺失持久原包拒绝恢复，可选外部加载器不再被描述为绕过缺失记录的兼容入口；历史记录须通过有来源证明的维护流程处理。

真实 PostgreSQL 测试覆盖四类重签摘要的内容替换全部拒绝、失败不创建 Decisions、缺原记录拒绝，以及恢复原记录后按原包完成分派。新路由变更仍走既有治理入口。

验证：29 项 Decision 集成测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。本批定向验证，未重跑全仓检查。证据为 `verification-2026-09-08-frozen-package-retry.json`。


## 2026-09-08：内部 Decision 待办查询与当前可见性

新增 DecisionInboxOwner.get/list，要求空页也执行安装查询准入，逐项执行当前 abh.decisions.read Grant 和证据可见性检查。Pending 回验当前 Request/route/席位/候选、Human Assignment、范围和期限；历史记录仅向实际响应人开放，责任撤销不自动抹去本人历史读取资格，但仍受读取 Grant 和证据权限限制。

列表支持状态、kind、截止上界、UUID 游标和最多 100 条扫描。游标按已扫描行推进，被过滤的空页不代表结束。实际 PostgreSQL 测试覆盖筛选空页后续分页、非本人记录排除、空页准入、缺读取 Grant、证据拒绝、Workspace 隐藏、提交后历史与资格撤销、读取 Grant 撤销。

这是内部 Record 查询，公开 DecisionView 效果状态、动作列表、QueryMeta 水位及 HTTP/SDK 尚未装配；不声明已完成公共查询协议。首轮测试类型检查发现可选游标未收窄，修正后重跑。

验证：30 项 Decision 集成测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。本批为定向验证，未重跑全仓检查。证据为 `verification-2026-09-08-decision-inbox.json`。


## 2026-09-08：Fastify 公开入口适配层

新增私有 adapter-fastify 包，固定 Fastify 5.12.3。按注册表挂载明确安装的公开命令/查询，可信认证生成上下文，服务端分配入口标识，调用 Contract Package 的已编译请求/响应校验器。严格条件头、闭合查询、脱敏错误、命令 ETag/202 Location 和请求体上限已接入。认证/处理器有界等待、上下文过期与断开取消信号可用；超时不承诺业务回滚或安全重试。

10 项传输测试覆盖成功装配、伪造上下文、错误头/查询、UUID、未安装/内部路由、认证与上下文期限、响应泄漏、注册错误、恶意 JSON、体积限制、迟到认证和非合作处理器。Fastify inject 会合并部分重复头，因此重复幂等头另用真实 TCP 验证。生产 Owner/DTO/身份及服务生命周期仍未完成。

验证：完整 pnpm check 通过，223 项 Contract、235 项 Core、10 项 HTTP 测试通过，48 个生成制品、9 个 API 报告、217 个文档链接一致，无遗留测试容器。证据为 `verification-2026-09-08-fastify.json`。


## 2026-09-08：Decision 撤回 HTTP 与身份/Owner 装配

Core server/http.ts 新增 createCoreHttpApp，显式安装撤回处理器、实际 IdentityIngress 和凭据解析。VerifiedContext 经当前身份映射/组织/成员/epoch 验证后，与服务端入口标识及 AbortSignal 私有绑定；处理器不能从客户端 Context 生成可信身份。安装 Grant 候选在业务事务重新验证，来源治理检查不提供默认放行。

withdrawDecision 返回持久命令回执的原 commandId，并核对回执 DecisionRef。HTTP 以原 commandId/DecisionRef 生成公开 DTO，保证并发同键和响应丢失后的重放一致。真实 PG 测试覆盖身份、权限/来源拒绝、事务事实、Audit/Outbox、重放冲突、陈旧版本、治理撤销、身份 epoch 变化与 Grant 撤销。首轮身份状态测试使用未注册 Suspended 值被数据库正确拒绝，改为实际 credential_epoch 变化后全部通过。

这是首条公开命令的内部服务装配，生产凭据/治理/来源实现、Workspace 身份选择、其他公开操作、完整生命周期和 SDK/CLI 仍未完成。

验证：236 项 Core、10 项传输测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-http-withdrawal.json`。未重跑未变更的契约生成/API 检查。


## 2026-09-08：Decision 提交、完整批准与 Pending Effect 原子持久化

新增 DecisionEffectIntentRecord 契约、created 事件和 40 号迁移。human.decision_effects 按 Request/routeRevision/effectKey 唯一，继承来源 Workspace/用途，仅授予 SELECT/INSERT。实际完成凭证及来源 Outbox 必须匹配，目标精确绑定原事项；每项意图预分配稳定目标命令引用，但不表示执行或 Applied。

submitDecision 独立验证当前 Grant、Human 冻结席位、原事项治理与资格。记录的 Grant 不能由资格回调凭空产生；重放重新验证当前 Grant/Assignment/治理。最终批准要求非空效果计划，意图/批准/凭证/回执/Outbox 同事务。HTTP SubmitDecision 返回原命令 ID 和本次命令实际创建的效果跟踪集合；前一席位重放不会吸收后来新建的效果。

真实 PG/HTTP 测试覆盖 ALL 首席无效果、最终并发重放、空/重复/错目标计划回滚、伪造 Grant 拒绝、拒绝无效果、不可变 Pending 记录、资格和 Grant 撤销后的重放拒绝。初次 Fixture 缺少第二位 Human 的 Principal fence，被准入正确拒绝，补齐实际 fence 后通过。效果消费、目标 Owner 回执/恢复及公开查询尚未完成。

验证：完整 pnpm check 通过，225 项 Contract、237 项 Core、10 项 HTTP 测试通过，40 号迁移、48 个生成制品、9 个 API 报告和 217 个文档链接一致，无遗留测试容器。证据为 `verification-2026-09-08-decision-effects.json`。


## 2026-09-08：Control Decision Effect 完整结果与 Applied 回执

新增 DecisionEffectReceiptRecord 和 applied 事件；41 号迁移保存不可变完整效果回执。applyControlDecisionEffect 按意图固定命令 ID/幂等键进入独立当前管理 Grant/治理准入，然后由 ExecutionAuthorityOwner 检查整体批准和实际资格，原子创建 Service Grant/Authority。回读完整结果并核对两项来源事件后才记录 Applied，与 CommandReceipt/Audit/Outbox 同事务。查询回执也验证实际命令回执与摘要/结果 Ref。

核对 V1 后使用 abh.execution-authority.create 管理权限，未以内部 issue-effect 命令名代替；目录增补 Action 准备用途。测试覆盖缺管理权限、租户隔离、Scope 拒绝、回执写入故障整组回滚、并发单次提交、异参冲突、回执不可变、当前治理/Grant 撤销，以及已撤销 Authority 的历史重放不复活。实际来源/MFA/资格治理仍需安装，测试回调是明确 Fixture。

Domain 效果、Blocked/Abandoned、新责任事项、冻结参数加载、Outbox 消费/Worker 恢复和公开效果查询尚未完成。

验证：完整 pnpm check 通过，227 项 Contract、237 项 Core、10 项 HTTP 测试通过，41 号迁移、48 个生成制品、9 个 API 报告和 217 个文档链接一致，无遗留测试容器。证据为 `verification-2026-09-08-control-effect.json`。


## 2026-09-08：Control Effect 冻结签发参数与恢复 Worker

42 号迁移新增不可变 control_effect_inputs。prepareControlDecisionEffect 先以实际 create Grant/治理和效果级 advisory lock 冻结完整签发输入；Apply 必须匹配原参数。重签摘要也不能改 ID、范围、额度引用或期限。应用失败保留冻结记录，重连读取一致；参数准备和 Applied 是不同事实。

runControlEffectWorker 从持久记录扫描当前 Service 所属、已准备且无回执的 Control 效果，逐页/逐项/执行均当前验权，绑定固定身份/组织/Workspace/用途，复用原命令 ID 与参数。多 Worker 竞争只有一次实际提交，Applied 后空页；租户宿主新增 controlEffects 安装。错误传播并保留待办，不绕过权限或自动续期。

真实 PG 测试覆盖冻结并发、重连、不可变权限、同键异参/重签摘要变化拒绝、缺冻结输入拒绝、应用/回执失败仍保留原参数、Service Worker 并发恢复、完成后排除、Human/缺 Grant 拒绝、刷新 Workspace 漂移、不合作身份回调停机和空页撤权。Domain 效果、错误分类退避、Blocked/Abandoned/新责任事项、事件队列路径、全局扫描与生产策略装配仍未完成。

首轮完整 Core 回归发现已有 Action 到期测试用应用时钟等待后断言首轮过期，数据库仍可能未到期。改为有界等待数据库 clock_timestamp 确认到期，保持生产期限逻辑不变；重跑全部 237 项 Core 测试通过。Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-control-effect-worker.json`；本批复用既有契约，未重跑全仓契约/API 检查。

## 2026-09-08：效果恢复分页回调的有界停机

检查运行宿主排空时发现 Control Effect Worker 的 onPage 可无限挂起。新增内部 boundedCallback，为分页观测提供 deadline/AbortSignal；最多等待 10 秒，宿主停机立即释放 Worker，迟到结果不触发新页，迟到拒绝已有处理。回调失败仍向宿主传播，不抹去已提交的效果。

单元测试覆盖返回/失败、过期/取消前拒绝调用、不合作回调超时、迟到拒绝与停机；真实 PG 效果 Worker 在已完成后的空页回调挂起时也能停止。此修改只补齐 Control 效果观测回调，其他模块的回调生命周期仍需按设计逐项检查。

验证：36 项定向测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-effect-observer.json`；未重跑全仓检查。

## 2026-09-08：租户宿主其他分页回调的有界排空

将既有 boundedCallback 接到 Responsibility routing/expiry、Exception、Operation recovery/terminal comparison、Outbox Publisher/Consumption 与 Wait recovery。onPage 增加 deadline/AbortSignal，最多等待 10 秒，停机释放不合作回调，错误保留并传给宿主。已有单参数回调兼容；不改变已提交业务结果和 Owner 授权。

生命周期测试覆盖七类循环在回调挂起时停止及回调失败透传，并验证兄弟循环失败可以取消观察中的 Worker；真实 PG 的 Action Wait 回归新增挂起观察回调停机断言。测试中的空扫描数据库仅用于生命周期隔离，不充当授权或业务一致性证据。

验证：256 项 Core 测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-runtime-observer.json`。本批未变更公共契约，未重跑全仓契约/API 检查。

## 2026-09-08：受当前读权约束的 Decision 效果摘要

新增 queryDecisionEffects，复用 DecisionInboxOwner 的独立当前读取 Grant/本人资格/历史和证据可见性。效果必须精确绑定 Decision 版本、原 Request/routeRevision/subject/proposalDigest，并匹配实际整体完成凭证；Applied 必须存在已验证的命令回执。效果/回执的字段可见性由必需 canReadEffect 安装核验。回执存在但用途隐藏时省略，不能误报 Pending。

真实 PG 测试覆盖最终批准后的 Pending、实际应用后的 Applied、Authority 撤销后仍保留历史 Applied、效果隐藏、回执用途隐藏、查询治理拒绝、缺读取 Grant 和撤销读取 Grant。返回既有 EffectSummary，但完整 DecisionView/QueryMeta/availableActions 和 HTTP 查询仍未装配。

验证：32 项 Decision 集成测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-effect-query.json`；未重跑全仓检查。

## 2026-09-08：DecisionView 与当前可用操作装配

新增 readDecisionView，取得声明 fence 后组合当前 Decision 查询和持久效果摘要，返回既有公开 DTO。availableActions 只允许 submit/withdraw，必须是 Pending、拥有独立当前命令 Grant 且通过安装的来源/MFA/职责前置检查；仅有 read Grant 或历史 Approved 均不显示命令。可选命令拒绝隐藏操作，其他查询错误仍传播，命令执行不会信任此按钮列表。

真实 PG 测试覆盖完整 Package 保留、公开字段闭合、独立 submit Grant、withdraw 前置条件拒绝、read Grant 无法替代 submit、命令 Grant 撤销后仍可读但无操作，以及批准后无操作。QueryMeta/连续水位、HTTP get/list-inbox 和 SDK 尚未完成。

验证：32 项 Decision 集成测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-decision-view.json`；未重跑全仓检查。

## 2026-09-08：DecisionView 提交操作的 Owner 前置检查

补齐 availableActions 与实际提交前置条件之间的差异。canAct 返回允许后，Owner 仍核对冻结 Request/route、当前 Human 席位、数据库期限、包摘要和前置槽位批准；缺少前置决定时隐藏提交操作。真实 PG 注入缺失前置槽位验证安装回调无法绕过，恢复原记录后保留原视图行为。

验证：32 项 Decision 集成测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-decision-readiness.json`；未重跑全仓检查。

## 2026-09-08：提交与视图共用完整前置槽位检查

统一 DecisionOwner.submit 与 assertSubmissionReady 的前置判断，按冻结 seats 数量与 Request 引用核对每席恰好一项有效批准。路由记录读取增加软删除、Workspace/用途过滤及行/正文一致性验证，防止缺失或隐藏前置记录被当成全部批准。

真实 PG 测试创建两人 ALL 前置槽位和一个依赖槽位：零/单人批准均拒绝，完整前置批准后可提交；删除、异 Workspace 或用途隐藏任一批准时，视图就绪与提交都拒绝，且不提交依赖决定或完成凭证。恢复实际记录后全部三项批准才产生完整凭证。

验证：257 项 Core 测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-decision-dependencies.json`；未重跑全仓契约/API 检查。

## 2026-09-08：Decision Strong HTTP GET 与真实对象查询元数据

新增 getDecisionQuery 和 Core decisionQuery 安装，GET 经过 IdentityIngress、当前读取/命令 Grant、证据可见性和 Owner 视图。asOf 来自数据库时钟；Strong 单对象水位绑定实际 Request 版本、routeRevision、调用者范围与可见视图。使用明确 decision-source 前缀，不宣称连续投影/消费水位或清理权限。Projection 请求返回 SCHEMA_UNSUPPORTED，未静默替换一致性类型。

真实 PG/HTTP 测试覆盖完整响应、稳定水位、批准后的变化、未认证、非法 UUID、未实现 Projection、Workspace 隐藏和读 Grant 撤销。ListInbox、全局连续水位、SSE 和生产身份/治理装配仍未完成。

验证：257 项 Core 测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-decision-http-query.json`；未重跑全仓契约/API 检查。

## 2026-09-08：Strong Decision Inbox HTTP 分页

新增 listDecisionQuery 与 decisionInbox 安装。页面先统一取得声明 fence，独立读取 Grant 准入覆盖空页，再复用已扫描游标分页和完整 DecisionView。默认 25/最多 100，状态/期限/UUID 游标验证；公开类型名称通过明确安装表映射责任 kind，未知值拒绝。数据库时间和页面可见结果指纹形成 QueryMeta，不声明跨页快照或全局连续水位。

真实 PG/HTTP 测试覆盖完整视图、过滤空页继续翻页、最后页游标结束、类型空页、空页缺 Grant/撤权拒绝、未知类型/无效游标/重复参数/超限拒绝及 Projection 拒绝。生产类型目录/准入安装、SSE、Projection 连续水位、SDK/CLI 与 V1 验收仍未完成。

验证：257 项 Core 测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-decision-inbox-http.json`；未重跑全仓契约/API 检查。

## 2026-09-08：公开 Inbox 游标加密与范围绑定

修复过滤空页直接返回隐藏 Decision UUID 的缺口。新增 InboxCursorCodec，AES-256-GCM 加密位置，绑定当前组织/主体/Workspace/用途/epoch 和规范化筛选；默认 15 分钟、最多 1 小时，必须明确安装 32 字节密钥。重启/多实例复用同一密钥，换钥拒绝旧令牌。HTTP 编解码后仍走内部 UUID keyset 与完整当前读权检查；不把游标当授权。

测试覆盖位置不泄露、同密钥新实例读取、随机密文、跨身份/范围/筛选拒绝、请求 ID 更新可继续、篡改/格式/换钥/过期拒绝及密钥副本。实际 HTTP 验证过滤空页令牌继续分页、可调整页大小、旧 UUID 与更换筛选拒绝。初轮单元 Fixture 用途未改变且字节赋值缺类型收窄，修正后重跑。

验证：36 项定向测试、Core typecheck/build、217 个文档链接通过，无遗留测试容器。证据为 `verification-2026-09-08-inbox-cursor.json`；未重跑全仓检查。

## 2026-09-08：公开类型化客户端与 Core API 门禁

新增 `@abh/core/client` 浏览器子入口，复用 Contract Package 协议和 Schema，提供 Decision get/listInbox/submit/withdraw 及 Action get/list/cancel/requestAuthorization/proposeFromArtifact。写入保留原幂等键与版本条件，Create 不发送 If-Match；原始幂等键先校验，防止 Headers 自动 trim 改变重放身份。凭据回调每次解析，不能带入陈旧的版本/幂等头。Action 提案入口只消费现有 Artifact，不冒充业务输入上传便捷流程。

调用共享有界期限和取消，逐块限制响应大小，验证 UTF-8/JSON/公开操作状态与响应 Schema；晚返回 fetch 响应和超限/非法内容关闭流。错误区分 NotSent、Unknown、Responded，明确已收到服务端错误仍可能发生过提交，不自动重试或默认批准。

真实 PG/Identity/Grant/Owner 测试验证客户端重放返回原命令及效果集合；HTTP 适配层验证九个操作。浏览器打包从真实 package exports 入口验证，不含 Node/数据库/Fastify/OPA/Worker 依赖，并测试构建后的公开入口调用。Core 根入口和 client 子入口现纳入 API Extractor 报告，根命令同时核对 Contracts 与 Core；检查实现提取为共享脚本。

完整服务 bootstrap、Action HTTP Owner、Artifact 上传/高层 actions.propose、Mission/专业 SDK/defineBusiness/CLI 和 V1 独立验收仍未完成。用法和结果不确定性说明见 [客户端文档](../../packages/core/src/CLIENT.md)。验证结果记录于 `verification-2026-09-08-decision-client.json`。

验证：全仓 pnpm check 通过，227 Contract + 271 Core（含 11 客户端测试）+ 10 HTTP 测试，48 个契约制品和 11 份公开 API 报告匹配；额外 Core/浏览器专用类型检查、221 个文档链接通过，无遗留隔离测试容器。

## 2026-09-08：真实 Action 提案 HTTP 与稳定受理回执

新增 proposeAction 和 Core actionProposal 安装，连接实际 IdentityIngress、当前提案 Grant、正式 Artifact 与 ActionOwner。服务端定义解析执行 Service/完成策略/风险和上限，来源与目标版本、证据和策略通过必需治理安装验证。调用前固定摘要输入，治理回调接收副本，定义与影响返回值复制后使用。首次提案和重放都重新核验当前准入及实际输入 Artifact。

Action/Intent/回执/Audit/Outbox 同事务保存，202 返回原 commandId/v1 objectRef/trackingRef。后续取消不改写已受理响应，不重新解析定义或创建 Authority。实际 HTTP/客户端/PG 测试覆盖并发单次创建、异参冲突、未认证/跨组织/缺 Grant/撤权、领域拒绝、隐藏输入、回调修改副本和 Intent 写入中途失败后的整体回滚。初轮测试把未认证且非法请求预期为 400，按传输层先认证顺序修正 Fixture 后通过。

完整 Action 查询/取消/请求授权 HTTP、Artifact 上传/业务输入便捷提案、生产定义/来源政策、SDK/CLI 和 V1 验收继续实施。本轮验证证据为 `verification-2026-09-08-action-proposal.json`。

验证：272 项 Core 测试通过；最后的回调返回值副本加固后重跑 51 项 Action 测试通过。Core/浏览器类型检查、构建、11 份 API 报告和 222 个文档链接通过，无遗留隔离容器；本轮未重跑全仓检查。


## 2026-09-08：实际 ActionView 与 Strong HTTP 查询

新增 getActionQuery/ActionViewAdmission 和 Core actionQuery，GET /v1/actions/:id 经实际身份、独立读 Grant、来源 fence 与父 Action 锁组合公开 DTO。关联 Authority/Snapshot、Operation、当前责任及技术冻结分别裁剪；Snapshot 核对实际 Action/Payload/Plan/PinSet/Authority，ResourceFence 核对行/正文 ID。Unknown 操作和资源占位保持未决，责任关闭不冒充技术解冻。当前来源指纹不代表连续水位。

实际客户端/HTTP 测试验证完整 Proposed/Cancelled 视图、当前命令 Grant/前置条件按钮、读权独立、对象 Workspace 隐藏、撤权、稳定及变化水位和未实现 Projection 拒绝。真实授权测试读取 Snapshot/期限并裁剪隐藏摘要；Wait 测试读取当前待批 Request；恢复测试读取 Unknown Operation/资源占位。首轮新增 Fixture 的循环变量遮蔽已修正，未改生产语义。

Action 列表、取消/请求授权 HTTP、输入上传、生产治理与完整 V1 验收继续实施。证据为 verification-2026-09-08-action-query.json。

验证：272 项 Core 测试通过；统一 Grant 解析器拒绝为 404 后，51 项 Action 回归测试通过。Core/浏览器类型检查、构建、11 份 API 报告及 222 个文档链接通过，无遗留测试容器；未重跑全仓检查。

## 2026-09-08：Action 倒序列表与加密续页

新增 listActionQuery、ActionListAdmission、ActionCursorCodec 及 actionList HTTP 安装，支持全部注册筛选、默认 25/最多 100、createdAt/id 倒序。整页来源 fence 和父锁按固定顺序取得，复用 ActionView/current Grant，锁后重新核对筛选。列表准入与读权覆盖空页；可见性过滤不泄露对象，扫描空页保留继续位置。

ac1 令牌 AES-256-GCM 加密时间/UUID，绑定主体/组织/Workspace/用途/epoch 和筛选，明确安装 32 字节密钥，默认 15 分钟。数据库微秒以六位精确文本读取并经 text::timestamptz 传回；初轮真实分页测试发现驱动直接按 timestamptz 序列化字符串会损失微秒，修正后同毫秒不同微秒和同时间 UUID 排序均不漏页。此测试发现的是实际分页缺陷，未降低测试条件。

真实 HTTP/client 测试覆盖连续分页、空页续查/调整页大小、筛选变化拒绝、生命周期/mission 筛选、空结果缺读权和列表准入拒绝、Projection 拒绝；游标测试覆盖篡改、过期、密钥复制/换钥、所有身份/筛选绑定和跨路由拒绝。跨页不承诺快照，页水位不是连续事件水位。取消/请求授权 HTTP、输入上传与生产治理继续实施。

验证：275 项 Core 测试、Core/浏览器类型检查、构建、11 份 API 报告和 222 个文档链接通过，无遗留测试容器。证据为 verification-2026-09-08-action-list.json；本轮未重跑全仓检查。


## 2026-09-08：统一 Action 取消与 HTTP 装配

新增 cancelAction/ActionCancellationChecks/actionCancellation，独立当前取消 Grant/来源准入覆盖首次和回执重放。按当前 Owner 状态选择准备取消、Authorized 零派发清理、已派发停止与对账；Snapshot epoch/来源 fences 一次声明，资源/账本/父锁保持既有顺序。202 使用原回执 commandId/版本，重放不返回任意后续版本。

真实 HTTP/client 验证准备取消、并发幂等、版本/异参冲突和撤权；统一入口另验证 Provider 已接受但响应丢失后的预算/资源责任保留，执行撤权后的独立取消、清理凭证 INSERT 失败的整组回滚、取消与 Permit 签发竞争。初轮旧测试直接比较完整返回值，已按新返回的回执/ref 与 replayed 标志分别断言，未改变 Owner 状态语义。

请求授权 HTTP、上传/生产策略、持续义务和其余 V1 验收继续实施。证据为 verification-2026-09-08-action-cancel.json。

验证：275 项 Core 测试、Core/浏览器类型检查、构建、11 份 API 报告、222 个文档链接通过，无遗留测试容器。本轮未重跑全仓检查。

## 2026-09-08：首次 T1 当前执行身份校验

核对请求授权装配时发现首次 T1 只限制用途，未像 Snapshot 刷新一样校验当前 Service 身份。修复 authorizeOneShot：要求 Service 与 Action 执行主体一致，取得来源 fence 后调用 currentIdentity 检查凭据 epoch、成员状态、Scope epoch 和 Principal 版本，再进入审批/策略/资源处理。

新增真实 PG 测试证明 Human/错误 Service/旧凭据/撤销成员/错误 Scope 均不创建 Snapshot、策略评估或资源预留，Action/子操作保持原状态。首轮 Fixture 使用不在 AccessRecordState 中的 Suspended，数据库约束拒绝；改用正式 Revoked 状态重跑。请求授权 HTTP、持久业务推进与完整 V1 验收尚未完成，本次修复是其执行边界前置工作。

验证：276 项 Core 测试、Core/浏览器类型检查、构建、11 份 API 报告、222 个文档链接通过，无遗留测试容器。证据为 verification-2026-09-08-t1-identity.json；未重跑全仓检查。

## 2026-09-08：已准备 Action 的 Service T1 幂等事务

新增 authorizePreparedAction/PreparedActionAuthorizationChecks，明确 Service action.execute 上下文，固定 ActionRef/RequestAuthorizationPayload 摘要与回调副本。先声明完整当前来源 fences，重验配置 Service/身份 epoch/安装准入，再用实际 Resolver 与 Owner 原子提交 Snapshot/评估/预留/Action/回执。Authority 引用仅作单一断言，不选择执行主体或解决多候选歧义。

真实测试验证两个并发调用只产生一份 Snapshot、两次策略评估和一组预留；Snapshot INSERT 故障后数量回滚，使用新连接及新入口 commandId 仍返回原回执。Human、错误断言、安装准入拒绝和源 Grant 撤销均不能完成调用。入口不假称完整 RequestAuthorization HTTP：持久请求推进、计划/责任分支和生产装配继续实施。

验证：277 项 Core 测试、Core/浏览器类型检查、构建、11 份 API 报告和 222 个文档链接通过，无遗留测试容器。证据为 verification-2026-09-08-prepared-t1.json；未重跑全仓检查。

## 2026-09-08：领域验证准备入口

新增 validateAction/ActionValidationChecks，使用既有 ValidateActionPayload，补充内部 abh.actions.validate 的 action.prepare 权限登记。当前 Grant、来源/证据准入、实际 Artifact/摘要检查覆盖首次及重放；领域验证与 Action CAS/回执/Audit/Outbox 同事务。回调使用输入副本，重放返回原结果而不重复 Validator，不把取消后的 Action 复活。

真实测试覆盖缺 Grant、领域拒绝保持 Proposed、同键重试/并发仅一次成功验证、后续取消后稳定回执、异参冲突和当前准入/Grant 撤销。内部命令未开放 HTTP，生产领域证据、计划/责任与完整请求授权推进仍未完成。

验证：全仓 pnpm check 通过，227 Contract + 278 Core + 10 HTTP 测试，48 个生成制品、11 份 API 报告及 222 个文档链接通过，无遗留测试容器。初轮类型检查发现私有 payload helper 仍要求完整 preparation checks，收窄至实际使用的 artifact 回调后全仓通过。证据为 verification-2026-09-08-action-validation.json。

## 2026-09-08：准备 Grant 与 Action 固定版本

修复 ResolveAndPinRequest 只允许执行/Mission Authority、无法使用准备 Grant 的合同缺口，新增明确 abh.grant Ref 分支而不放宽为任意 EntityRef。登记内部 abh.actions.pin/action.prepare，并新增 pinAction 入口，逐次验证实际准备 Grant、来源/能力读取准入和 Artifact；重放额外重验已固定 Assignment/Release。

真实测试以尚无执行 Authority 的 Validated Action 固定版本，验证拒绝伪造 Authority、准入拒绝、Action 更新故障导致 PinSet 回滚、并发只固定一份、重放保持引用、Assignment 停用及准备 Grant 撤销拒绝。固定版本不创建计划、Snapshot 或预算。新增 Grant PinRequest 合同 Fixture，保留原 Authority Fixture。

验证：全仓 pnpm check 通过，228 Contract + 279 Core + 10 HTTP 测试、48 个生成制品、11 份 API 报告和 222 个文档链接通过，无遗留测试容器。证据为 verification-2026-09-08-action-pin.json。

## 2026-09-08：计划注册独立准入与回执

新增 registerOperationPlan/PlanRegistrationChecks，复用 RegisterOperationPlanPayload，登记内部 action.prepare 用途的 abh.actions.register-plan 权限。预先核对编译产物摘要/正式引用，当前 Grant/来源/PinSet/所有 Artifact 检查覆盖回执重放；实际 Owner 核对范围、资源累计、固定能力和完整 Operation 结构。领域回调接收副本，不能替换已摘要计划。

真实 PG 测试覆盖缺 Grant、领域拒绝、编译产物与引用不匹配、Action 绑定失败整组回滚、并发单次完整创建、回调修改副本、连接重建回执查回、Assignment 停用和 Grant 撤销。生产 Compiler 调用、责任请求和持久授权推进继续实施。

验证：全仓 pnpm check 通过，228 Contract + 280 Core + 10 HTTP 测试、48 个生成制品、11 份 API 报告和 222 个文档链接通过，无遗留测试容器。证据为 verification-2026-09-08-register-plan.json。

## 2026-09-08：固定 Compiler 调用与候选输出验证

新增内部 ActionCompilerHost/InstalledActionCompiler，显式绑定固定能力版本，只调用当前 PinSet 中的精确 Compiler。输入核验 Action/Intent/PinSet 摘要与作用域，调用使用副本和 boundedCallback；输出核验 Action 版本、PinSet/输入摘要、Compiler/Connector 与完成策略，复制后交给现有计划注册事务。宿主不提供数据库、凭据或派发接口，也不宣称受信代码沙箱。

真实准备 Fixture 验证错误版本不会调用、输入输出修改不污染宿主、错 PinSet 产物拒绝、重复安装拒绝、已取消请求不调用及不合作回调超时。计划注册回归使用实际宿主输出。生产编译器/公共 Port/SDK、已授权输入读取、持久请求推进与隔离仍未完成。

### 2026-09-08：当前权限下的 Compiler 输入装配

新增 `compilePreparedAction`，从数据库读取固定 Action/Intent/PinSet，经当前准备 Grant、安装来源准入、Release 及 Artifact 校验后，在事务外调用精确版本 Compiler。返回前重新校验当前来源及 Action 版本、有效期，拒绝编译期间撤权或取消后的结果。候选计划仍须经过独立注册入口原子落库。真实 PostgreSQL 测试覆盖无权限不调用 Compiler、准入撤回、编译期间取消、成功编译注册以及注册后旧版本拒绝。完整 RequestAuthorization 持久推进、生产 Compiler/正文读取能力和责任分支仍待实现。

本批全仓 `pnpm check` 通过：228 Contracts、281 Core、10 HTTP 测试，48 份生成产物、11 份 API 报告及 222 处文档链接检查通过；测试容器已清理。证据记录于 `verification-2026-09-08-compiler-assembly.json`。Compiler 宿主此前的独立验证记录于 `verification-2026-09-08-compiler-host.json`。以上不代表完整 V1 验收完成。

### 2026-09-08：RequestAuthorization 不可变请求接收

新增 `ActionAuthorizationRequestRecord`、对应 Outbox 事件和第 43 号迁移。`requestActionAuthorization` 在当前请求 Grant/来源准入下保存调用者意图、固定执行主体和 Authority 断言；请求事实、Command 回执、Audit、Outbox 原子提交。接收不会运行 T1，也不改变 Action 版本或创建计划/执行权限。真实数据库测试覆盖无权拒绝、写入回滚、并发、重连、不可变权限、幂等冲突、取消后原回执查回及撤权重放拒绝。后续阶段必须独立认证 Service，并用稳定阶段子键调用实际准备/责任/T1 Owner。尚未开放 HTTP，持久自动推进仍有缺口。

本批全仓 `pnpm check` 通过：229 Contracts、282 Core、10 HTTP 测试，零失败；43 个迁移、48 份生成产物、11 份 API 报告与 222 处文档链接检查通过，隔离测试容器已清理。验证记录：`verification-2026-09-08-authorization-request.json`。

### 2026-09-08：授权请求的当前 Service 恢复发现

新增 `discoverAuthorizationRequests`：基于持久请求和当前 Action，为固定执行 Service 返回有界 UUID 分页恢复线索。当前组织级读取 Grant、安装准入、来源 fence、按序父锁、精确主体版本、生命周期和期限校验均参与；空页仍查权限，隐藏行仍占扫描位置。真实数据库测试覆盖 Human 拒绝、无 Grant 拒绝、同 Action 多请求分页、隐藏空页续扫、Validate→Pin→Compile 阶段变化、取消后移除，以及空页准入撤回/Grant 撤销。实际 Owner 推进、责任等待和 T1 装配仍未完成。

本批 Core 全量 282 项测试及 Action 专项 58 项通过，Core 类型检查/构建、11 份 API 报告和 222 处文档链接通过；测试容器已清理。验证记录 `verification-2026-09-08-authorization-discovery.json`。本批没有重跑整个工作区，上一批全仓基线仍见请求接收记录。

### 2026-09-08：原请求驱动的 Service 验证与 Pin

新增 `validateRequestedAction`/`pinRequestedAction`，在原请求与固定执行 Service 当前绑定下调用实际准备 Owner，使用原请求 ID、输入 Action 版本和阶段名构成稳定幂等子键。当前阶段 Grant、请求来源 fence/准入和执行主体精确版本覆盖首次及重放；传输 Command ID 改变仍返回原持久回执。测试将 Human 接收→Service 恢复发现→实际验证→实际 Pin 连起来，覆盖并发只执行一次领域校验、重连回执、变更证据冲突、无关 Action/Human/未来版本拒绝、取消后不复活和撤权重放拒绝。编译持久恢复、责任与 T1 宿主尚未完成。

同时收紧 `pinAction` 的新命令路径：在父 Action 锁内要求 Validated，防止已有 PinSet 使取消后的新命令走语义复用。已提交原命令仍由 Command 回执重放，不重新执行生命周期转换；新增取消后新阶段键拒绝的集成断言。

最终 Core 全量 282 项测试零失败，Core 类型检查/构建、11 份 API 报告和 222 处文档链接检查通过，测试容器已清理。验证记录 `verification-2026-09-08-requested-preparation.json`；本批未重跑整个工作区。

### 2026-09-08：请求驱动编译注册与原计划恢复

新增 `compileRequestedAction`，在固定 Service 当前请求绑定下衔接实际数据库输入装配、Compiler Host 和计划注册 Owner。采用已注册不可变 OperationPlan 作为持久计算输出，提交前候选可重新计算，提交后从原计划恢复并重验当前权限/Release/来源，不再编译。稳定阶段子键基于请求与计划输入 Action 版本。并发不同候选通过实际 CAS/幂等竞争确定唯一计划，失败方丢弃候选并重验查回已提交计划；不增加第二套 Workflow 状态。集成测试贯通 Human 请求→Service 验证/Pin→并发编译注册→恢复发现 Authorize 阶段，验证拒绝注册不留子操作、重连不重新编译、固定 Compiler 冲突、取消与撤权重放边界。责任/T1 和运行宿主仍未完成。

本批 Core 全量 282 项测试零失败，Core 类型检查/构建、11 份 API 报告及 222 处文档链接通过，隔离测试容器已清理。验证记录 `verification-2026-09-08-requested-compilation.json`；本批未重跑整个工作区。

### 2026-09-08：持久请求绑定的真实 T1

新增 `authorizeRequestedAction`，从持久请求读取 Authority 断言，要求当前固定 Service/执行用途，并以独立稳定阶段子键调用实际 T1。请求来源 fence/准入加入原有当前执行来源/身份/批准/策略/资源事务，原输入 Action 版本的重放返回原回执，不增加 Snapshot/预留。新增实际数据库场景覆盖错主体/Action/断言、准入拒绝、Snapshot 写入回滚、并发唯一效果、重连和撤权拒绝；批准与 Authority 由已有真实 Owner 准备。责任请求自动创建与 Wait 恢复、阶段宿主、HTTP 及完整 V1 仍未完成。

本批 Core 全量 283 项和 Action 专项 59 项测试零失败，Core 类型检查/构建、11 份 API 报告和 222 处文档链接通过；隔离测试容器已清理。验证记录 `verification-2026-09-08-requested-authorization.json`，本批未重跑整个工作区。

### 2026-09-08：授权准备恢复循环与租户宿主接入

新增 `runAuthorizationWorker`，调用实际阶段 Owner 自动推进验证、Pin、编译注册，可显式安装当前执行 Service 的 T1 配置。每步重新获取当前身份并固定租户/Workspace/acting organization/Service；复用持久阶段幂等和版本竞争恢复。加入 `runTenantRuntime.actionAuthorization`，使用既有失败取消与统一收尾机制。真实数据库测试覆盖四轮自动推进、重启仅报告待授权、身份变化拒绝和观察回调期限。T1 入口有独立测试，宿主 T1 分支及租户宿主集成还需专项覆盖；责任自动分支、Wait 恢复及生产 HTTP/默认装配仍待完成。

本批 Core 全量 283 项、Action 专项 59 项测试零失败，Core 类型检查/构建、11 份 API 报告与 222 处文档链接通过，隔离测试容器已清理。验证记录 `verification-2026-09-08-authorization-worker.json`；本批未重跑整个工作区。

### 2026-09-08：宿主 T1 提交后恢复验证

将原请求 T1 集成测试扩展到实际 `runAuthorizationWorker`：组织级读取 Grant 下发现已准备请求，独立获取同一 Service 执行上下文后通过真实 Resolver 提交 Snapshot/策略评价/预算预留。模拟提交成功后 onPage 通知失败，重新连接并重启宿主不再进入 T1；原阶段命令重放仍查回同一回执。验证跨准备/执行身份变化和当前请求准入拒绝不会产生 Snapshot 或 Hold。测试使用真实预先完成的 Decision/Authority；自动创建责任请求和 Wait 恢复尚未覆盖，租户多循环整体集成仍需补充。

本批仅扩展测试与说明：59 项 Action 集成测试、Core 类型检查和 222 处文档链接检查通过，隔离测试容器已清理。证据为 `verification-2026-09-08-authorization-worker-t1.json`；未重跑完整 Core/工作区或构建/API。

### 2026-09-08：原授权请求绑定的责任创建入口

新增 `openRequestedResponsibility` 与内部开单权限登记，固定执行 Service 在准备上下文下使用当前独立 Grant 与请求来源准入调用真实 Decision Owner。绑定有计划的 Validated Action、原 payload 和期限，稳定原请求级幂等键避免重试创建不同路由；Request/Decision/冻结提案/日志/回执原子提交。新增实际数据库测试覆盖开单失败整体回滚、并发唯一回执、重连、参数冲突、取消后查回和撤权重放拒绝。宿主责任策略与 Wait Port 衔接、Authority Effect 后自动恢复仍未完成。

本批全仓 `pnpm check` 通过：229 Contracts、284 Core、10 HTTP 测试零失败；48 份生成产物、11 份 API 报告、222 处文档链接及构建/类型检查通过，隔离容器已清理。Action 专项 60 项通过。证据记录 `verification-2026-09-08-requested-responsibility.json`。

### 2026-09-08：责任请求首次冻结提案恢复

新增 `recoverRequestedResponsibility`，从原请求固定开单键的持久 Command 回执和首次 routing_proposals 读取原输入，经摘要/回执/租户主体绑定检查后进入实际开单入口重验。真实数据库测试覆盖新连接恢复、Open→实际 Decision Approved→Closed 后恢复、取消后查回及当前准入/Grant 撤销拒绝。恢复只返回原回执及当前状态，不重建路由或批准，不依赖调用方记住原随机提案 ID。Wait 注册、宿主策略和责任效果完成后的授权恢复仍待装配。

本批 Core 全量 284 项、Action 专项 60 项测试零失败，Core 类型检查/构建、11 份 API 报告和 222 处文档链接检查通过，隔离测试容器已清理。证据 `verification-2026-09-08-responsibility-recovery.json`；本批未重跑整个工作区。

### 2026-09-08：原责任请求的 Wait Port 装配

新增 `waitRequestedResponsibility`，恢复首次开单事实后以独立当前投递上下文调用实际 Action Wait Owner/DurableWaitPort，固定原请求级 waitKey 与首次 owner/cause/dueAt。要求同一 Service/租户/Workspace，临时 ContextRef 始终释放。集成测试覆盖并发同一 Wait、重连、责任 Closed 后原 Wait 查回、错误投递主体拒绝、开单撤权拒绝及实际关闭事件 signal→Succeeded/持久 Wakeup。宿主责任策略与效果完成后 T1 自动恢复仍待接入。

本批 Core 全量 284 项、Action 专项 60 项测试零失败，Core 类型检查/构建、11 份 API 报告和 222 处文档链接通过，隔离测试容器已清理。证据 `verification-2026-09-08-requested-wait.json`；本批未重跑整个工作区。

### 2026-09-08：责任完成与 Control Effect 应用分离

新增原请求绑定的 `requestedResponsibilityProgress` 与内部效果事实读取，重验当前开单/来源准入后区分等待责任、无批准关闭、等待效果和历史效果已应用。绑定实际请求、Action、完成证据与效果回执；已应用后撤权不改写历史状态，T1 必须继续验证当前权利。Action 测试覆盖 Open→Closed 但无 Effect 时保持等待效果，Decision 测试覆盖 Pending→真实 Control 应用→历史 Applied 及 Authority 撤销。宿主策略分支仍需接入，不能以这个状态读取替代执行授权。

本批 Core 全量 284 项测试零失败，Core 类型检查/构建、11 份 API 报告和 222 处文档链接检查通过，测试容器已清理。证据 `verification-2026-09-08-request-effect.json`；本批未重跑整个工作区。

### 2026-09-08：授权宿主必需责任等待分支

新增显式 responsibility 安装配置。待授权阶段先回源责任/效果状态，Open 使用真实 Wait Port 保持等待，Closed 但未应用 Effect 不进入执行上下文，无批准关闭保持不授权；仅 EffectApplied 后继续真实 T1。缺失责任不回退成预授权，错误不被吞掉。真实宿主测试覆盖 Open 复用等待与 Approved/Closed 无 Effect 时阻止 T1。尚缺自动路由创建、动态业务责任策略及 EffectApplied→宿主 T1 联合测试。

本批 Core 全量 284 项、Action 专项 60 项测试通过；Core 类型检查/构建、11 份 API 报告与 222 处文档链接检查通过，测试容器已清理。证据 `verification-2026-09-08-responsibility-worker.json`；本批未重跑整个工作区。

### 2026-09-08：授权宿主首次责任策略装配

新增 `ensureRequestedResponsibility` 和可选受信 `responsibility.policy`。首次读取必须通过当前组织级开单 Grant、请求来源和固定 Service 检查，策略在事务外有界运行，提交仍进入真实 Decision Owner；恢复只使用已冻结路由，并发不同提案查回唯一赢家后重验。宿主可自动首次开单并注册 Wait。新增集成覆盖缺权/撤回准入、错误对象、取消回调、并发不同 ID、重连不重算以及宿主自动开单等待；生产策略及 Applied Effect→宿主 T1 联合证据仍待完成。

本批 Core 全量 285 项测试、Core 类型检查/构建、11 份 API 报告及 222 处文档链接检查通过，隔离容器已清理。证据 `verification-2026-09-08-first-responsibility.json`；本批未重跑整个工作区。

### 2026-09-08：Wait 恢复按安装 Authority 隔离

真实联测暴露同 condition、不同 Grant 安装互相扫描待办后 FORBIDDEN 的问题。新增可选精确 authorityRef 扫描条件，并由 Action/Operation Wait Owner 显式绑定，分页前筛选且复制安装引用。候选仍执行原当前准入。数据库测试覆盖相同 condition 不同 Grant、引用版本、外部配置突变、当前准入拒绝和只推进所属 Wait；Action 联测保留另一安装 Pending Wait，验证后续恢复循环仍正常运行。

本批 Core 全量 286 项测试、Core 类型检查/构建、11 份 API 报告与 222 处文档链接检查通过。证据 `verification-2026-09-08-wait-installation.json`；本批未重跑整个工作区。

### 2026-09-08：RequestAuthorization 公开 HTTP 装配

新增可选 `actionAuthorizationRequest` 安装，将正式 HTTP 命令经 IdentityIngress、当前 Grant、用途/来源检查接入持久请求 Owner。202 回执保留原 Action trackingRef/commandId；执行仍由独立 Service 宿主承担。真实 HTTP/客户端测试覆盖并发同一回执、缺少 If-Match、当前缺权/来源拒绝、错误版本、落库回滚、参数冲突、取消后重放与撤权拒绝。

本轮全仓 `pnpm check` 通过：229 Contracts、286 Core、10 HTTP，共 525 项测试零失败；48 份生成产物、11 份 API 报告、222 处文档链接及工作区类型检查/构建通过。Action 专项 61 项通过，隔离容器已清理。证据 `verification-2026-09-08-authorization-assembly.json`。完整 Applied Effect→必需责任宿主→T1 联合证据、高层提案编排、生产策略及 V1 其他模块仍未完成。

### 2026-09-08：实际 Control Effect 到必需责任宿主 T1 联合验证

新增联合 PostgreSQL 场景，从无责任的持久授权请求出发，由宿主首次创建并等待，经真实 submitDecision/Control Effect 输入冻结与应用后进入真实 Resolver T1。覆盖批准/Pending/冻结输入均不提前执行、Snapshot 写入失败回滚、提交后通知失败与重连不重复授权，并验证 Applied 后实际撤销 Authority 不被历史回执绕过。原预算竞争测试改为本场景增量计数，保持只提交一组 Snapshot/两次 Policy/一份 Hold 的约束。

本批为测试/说明变更：Core 全量 287 项、Core 类型检查和 222 处文档链接检查通过，隔离容器已清理。证据 `verification-2026-09-08-effect-worker-t1.json`；未重跑全仓构建/检查。

### 2026-09-08：必需责任授权与租户恢复循环联合运行

将实际 Effect→T1 场景装入 runTenantRuntime，同时运行真实 Operation 恢复、Publisher、消费覆盖和 Wait 恢复循环。等待全部完成一页后让授权提交后的观察回调失败，验证不合作的兄弟回调全部收到取消，已提交授权/预算不丢失且重连不重复。测试保留 Publisher 对旧冻结投递的恢复语义；队列 Port 返回未接收，发布不被误记为完成。这里只补多循环运行/收尾证据，生产队列接收消费全链路和生产安装仍待完成。

本批测试/说明变更通过 Core 全量 287 项、Action 专项 62 项、Core 类型检查及 222 处文档链接检查；隔离容器已清理。证据 `verification-2026-09-08-tenant-authorization.json`。本批未重跑整个工作区，队列未接收 Fixture 不构成原生队列全链路验收。

### 2026-09-08：内联 Artifact 当前权限受理层

新增组织级创建目标的 `storeInlineArtifact`，登记准备阶段存储权限，组合当前身份/Grant/fence、数据治理和来源引用检查，调用真实内联 Owner 原子保存 Available Artifact 与命令/审计/事件。重放检查当前权限，回传原受理引用，不重新发布已删除内容。集成验证并发去重、发布阶段整体回滚、回调参数隔离、重连、输入冲突、Tombstone 后受理回执及撤权拒绝。公开上传和 ObjectStore 路径仍未完成。

本批 Core 288 项、Contracts 229 项、Artifact 专项 7 项测试通过；Core 类型检查、Contracts/Core 构建、48 份生成产物、11 份 API 报告与 222 处文档链接通过，隔离容器已清理。证据 `verification-2026-09-08-artifact-ingress.json`；本批未重跑适配器测试或完整 pnpm check。

### 2026-09-08：公开内联 Artifact 存储与客户端

将组织级内联创建登记为 Public，新增严格 InlineArtifactStoredResponse（201）及生成协议；显式 artifactStorage HTTP 安装经真实 IdentityIngress、当前 Grant/来源/数据治理调用受理层。客户端 artifacts.storeInline 复用正式创建协议。真实数据库/HTTP 场景覆盖认证、跨组织拒绝、治理撤回、非法媒体、并发同一回执/ETag、正式正文、客户端重放、参数冲突和撤权拒绝。64 KiB 内联路径不等同于完整流式 StoreArtifact/ObjectStore 上传。

本轮全仓 pnpm check 通过：229 Contracts、288 Core、10 HTTP，共 527 项测试零失败；Artifact 专项 7 项通过。48 份生成产物、10 条公开协议路径、11 份 API 报告、222 处文档链接与工作区类型检查/构建通过，隔离容器已清理。证据 `verification-2026-09-08-artifact-http.json`。完整流式上传、ObjectStore 生命周期和高层提案自动编排仍未完成。

### 2026-09-08：高层 JSON 提案与稳定子键

新增客户端 actions.propose，组合内联 JSON 存储与正式提案；根键派生固定存储/Action 子键，预先验证两步输入、复制参数、共享期限。真实 HTTP Owner 测试模拟 Action 已提交但响应丢失，重试只保留一个 Artifact/Action；不同输入和目标仍冲突。修复 Action created 事件在 sourceProposalRef 与 payloadRef 相同时重复引用的问题。完整大对象上传、提案后服务端自动推进和生产 SDK 安装仍待完成。

本批 Core 全量 289 项测试、Core 类型检查/构建、11 份 API 报告及 222 处文档链接检查通过，隔离容器已清理。证据 `verification-2026-09-08-high-proposal.json`；未重跑完整工作区检查。

### 2026-09-08：提案与自动授权请求原子装配

抽出 ActionAuthorizationRequestOwner.accept 同 UoW 受理，由原请求入口和显式自动提案共享。proposeAction 的可选 AutomaticProposalAuthorization 在当前独立请求 Grant/来源治理下，将 Action、Intent、请求与 Audit/Outbox 放入原提案事务。HTTP actionProposal 可安装该能力，重放不重复请求并继续当前验权；旧提案缺失请求时明确拒绝，不能伪装为自动推进成功。测试覆盖请求写失败整体回滚、并发唯一请求、真实高层客户端响应丢失、取消后原回执、独立自动治理/权限撤回。

本批 Core 289 项测试、Core 类型检查/构建、11 份 API 报告与 222 处文档链接通过，隔离容器已清理。证据 `verification-2026-09-08-automatic-proposal.json`；本批未重跑整个工作区。

### 2026-09-08：公开自动提案的恢复发现与验证

真实 HTTP 高层提案场景继续进入 discoverAuthorizationRequests 与 validateRequestedAction，验证原提案 Command 作为请求来源可以正确发现 Validate、实际推进并重连重放，之后回源发现 Pin。高层客户端重试仍返回最初 Action 受理引用。加强 accept 的原提案 Command/初始版本/提案人/空断言绑定、用途目录与独立请求摘要检查，拒绝借不相关提案为其他 Action 建请求。

本批 Core 289 项通过；追加拒绝断言后 Action 专项 62 项及 Core 类型检查通过。Core 构建、11 份 API 报告和 222 处文档链接检查通过，隔离容器已清理。证据 `verification-2026-09-08-automatic-discovery.json`；未重跑完整工作区。

### 2026-09-08：实际 HTTP 停机与 Owner 收尾

新增 adapter-fastify.stopHttpIngress，可直接装配 RuntimeService.stopIngress；同步阻止新业务进入，幂等关闭传输，并等待真实认证/Owner Promise。修复 HTTP 超时已返回而后台 Owner 尚未结束时可能提前关闭数据库的装配缺口。保留原请求失败语义，不把超时当成事务回滚或完成；不合作处理器的有界收尾仍是安装责任。新增适配器超时/晚到失败/停止准入测试和真实 HTTP→RuntimeService 的关闭顺序联测。

全仓 pnpm check 通过：229 Contracts、290 Core、12 HTTP，共 531 项测试零失败；类型检查、构建、48 份契约产物、11 份 API 报告和 222 处文档链接通过。隔离测试容器无残留。证据 verification-2026-09-08-http-ingress.json。完整 V1 与生产默认运行装配仍未完成。

### 2026-09-08：HTTP 监听与进程生命周期宿主

新增 server/runHttpService，监听前安装 SIGTERM/SIGINT，监听成功后运行显式业务循环，复用 RuntimeService 的入口停止、工作 join、独立当前 drain、报告保存和依赖关闭。真实 TCP 测试暴露启动时 close 早于 listen 完成会遗留端口，已由 stopHttpIngress(app, pendingListen) 修复；准入立即关闭、监听 Promise 完成后关闭传输。覆盖端口占用、启动前取消、启动期间取消、通知失败和正常进程退出。

Core 全量 295 项测试通过；HTTP/生命周期专项 25 项通过（包含重复的 Core 场景，不与全量相加），Core/Adapter 类型检查和构建、11 份 API 报告、222 处文档链接通过，隔离容器无残留。证据 verification-2026-09-08-http-service.json。本批未重跑整个工作区；生产默认业务装配和完整 V1 仍未完成。

### 2026-09-08：HTTP 宿主直接监督租户业务循环

抽出 createTenantRuntimeLoops，保留跨循环的组织/Workspace/acting organization 绑定；runTenantRuntime 继续使用同一集合做独立 Worker 托管。runHttpService.tenant 将集合直接交给外层生命周期，要求租户与宿主使用同一 Database，消除内层 join 等待慢速同伴时 HTTP 仍继续接收的窗口。新增真实 PostgreSQL/HTTP 故障场景：身份刷新失败触发入口关闭，故意延迟同伴退出，观察实际端口已关闭但 drain 尚未开始，join 后才完成排空和依赖释放。

首次全量因 Action 测试容器端口绑定超时而启动失败（业务断言未运行）；保留日志后重跑，Core 全量 296 项通过。专项 9 项、Core 类型/构建、11 份 API 报告和 222 处文档链接通过，测试容器无残留。证据 verification-2026-09-08-tenant-http.json。未重跑整个工作区；本次故障注入不代替完整成功业务和原生队列链路验收。

### 2026-09-08：监听与 Worker 前的有界能力检查

runHttpService.startup 接收具名只读检查，校验唯一名称、函数与总期限，监听和 Worker 开始前共享同一次检查执行。回调使用 readOnly=true 的 TransactionOptions，失败、超时、SIGTERM 和晚到成功均不能开放服务；复用实际退出流程。测试覆盖有序一次执行、前置拒绝、不合作超时、取消及真实 PostgreSQL READ ONLY 事务。任意自定义回调的只读/取消行为仍由受信安装保证，生产实际身份/Pack/Policy/Secret 检查和持续 readiness 尚未完成。

Core 全量 300 项测试零失败，Core 类型/构建、11 份 API 报告和 222 处文档链接通过，隔离容器无残留。证据 verification-2026-09-08-startup-check.json；本批未重跑整个工作区。

### 2026-09-08：生命周期安装快照与启动故障定位

RuntimeService 接管时固定生命周期回调、signal、循环集合以及原队列/数据库的方法，绑定方法原实例以支持私有字段。调用方修改原配置不再替换当前服务的排空/关闭目标。具名启动检查失败新增 StartupCheckError，保留 checkName 与原 cause，方便宿主定位而不向 HTTP 发布内部错误。

Core 全量 301 项通过；最终回调接收者绑定调整后 RuntimeService 7 项、Core 类型/构建通过；11 份 API 报告、222 处文档链接通过，隔离容器无残留。专项 HTTP/RuntimeService 共 17 项在最终绑定调整前通过。证据 verification-2026-09-08-service-installation.json；未重跑整个工作区，生产默认安装与完整 V1 尚未完成。

### 2026-09-08：当前 Service 身份启动准入

新增 serviceIdentityCheck，可直接接入具名 startup 检查。固定组织/Service Principal/用途，拒绝未注册用途和 Workspace/跨组织混用；读取当前 VerifiedContext 后在只读事务内通过 currentIdentity 验证实际组织、Principal、Membership、组织停止与 scope/credential epoch。真实 PostgreSQL 测试覆盖合法当前身份、主体/用途/组织错配、credential epoch 撤销、组织停止、成员撤销及取消。测试上下文由受信 Fixture 生成，未替代生产 IdP 装配；启动通过也不签发权限或锁定未来 Grant。

Core 全量 302 项测试通过，Core 类型/构建、11 份 API 报告和 222 处文档链接通过，测试容器无残留。证据 verification-2026-09-08-service-identity.json。未重跑整个工作区；跨组织/Workspace、生产默认能力检查和完整 V1 仍未完成。

### 2026-09-08：真实身份入口到 HTTP 启动联测

扩展 Service 身份测试，使用明确 Workload 的 Fixture IdP 结果，经过真实持久身份映射与 IdentityIngress，再进入 startup 和 runHttpService。成员撤销时启动拒绝、实际 socket 从未监听、Worker 不运行；独立 drain 身份同样拒绝时不调用队列。有效成员实际监听并响应 HTTP，SIGTERM 后有序保存 Fixture drain 报告并关闭数据库。断言原数据库已不能事务、进程监听器已释放。此批新增联合证据，没有新增生产 IdP 或原生队列实现。

相关身份/HTTP 测试共 22 项通过，Core 类型检查和 222 处文档链接通过，测试容器无残留。证据 verification-2026-09-08-identity-startup-integration.json；仅测试和说明变更，未重跑 Core 全量或整个工作区。

### 2026-09-08：HTTP/身份宿主退出连接原生队列

将 Service 身份/HTTP 宿主联合测试的 Fixture drain 替换为真实 PgBossDeliveryAdapter、QueueAdmissionDirectory 和当前 drain Grant/fence。退出时通过 IdentityIngress 重取 Workload Context；正常路径取得真实空队列报告且记录时数据库仍可校验。成员撤销不启动 HTTP/Worker，启动后撤销 drain Grant 则原生 Port 拒绝且无报告，仍关闭连接。IdP 保留显式 Fixture，没有入队业务 Job，不宣称完整 Action 原生执行已验收。

相关身份/HTTP/pg-boss 测试 22 项通过；修正可选 release 回调类型后身份专项再次通过。Core 类型检查、222 处文档链接通过，测试容器无残留。证据 verification-2026-09-08-native-startup.json。本批仅测试/文档变更，未重跑 Core 全量或工作区。

### 2026-09-08：租户宿主装配投递消费 Worker

TenantRuntimeOptions 新增 deliveries，createTenantRuntimeLoops 生成共享租户绑定且直接受宿主监督的投递循环。既有冻结 Outbox/实际 Inbox 消费路径不变；onHandled 新增有界 TransactionOptions 与副本通知，取消或最长 10 秒后释放观察等待，保留 Owner 提交后队列确认。真实 pg-boss 重投测试通过宿主生成的循环确认原 Inbox；追加观察挂起取消测试验证业务消费不重复。

Core 全量 302 项通过（扩展已有用例），Core 类型/构建、11 份 API 报告和 222 处文档链接通过。Inbox 专项 13 项在最终宿主测试调整前通过，最终调整由全量覆盖。测试容器无残留，证据 verification-2026-09-08-delivery-host.json。未重跑整个工作区；完整公开业务到执行链路仍未验收。

### 2026-09-08：固定投递消费者安装

runDeliveryWorker 复制消费者 ID/事件类型并绑定原准入、Owner、身份、队列和观察方法，避免 fetch 等待时安装对象被改写导致本次消费逻辑变化。保留方法接收者和每次真实身份/权限校验，不冻结业务状态。新增真实 Inbox 场景验证改写回调不替换原准入/确认，也不重复已提交效果。

Inbox/原生投递专项 13 项、Core 类型/构建、11 份 API 报告和 222 处文档链接通过，隔离容器无残留。证据 verification-2026-09-08-delivery-installation.json；未重跑 Core 全量和整个工作区。完整 V1 仍未完成。

### 2026-09-08：HTTP 托管原生投递重启恢复

将已有 Owner 提交后确认丢失的 pg-boss 场景继续接入 runHttpService。新 Database 与新原生 Adapter 接收旧 Job 重投，宿主生成的 delivery 循环复用原 Inbox 并确认，随后真实 HTTP 请求和 SIGTERM 触发当前 Grant/QueueAdmissionDirectory 下的排空。报告保存时验证数据库可用，退出后断言连接关闭、监听端口与进程处理器释放。实际 Owner 为 Ledger，其他租户循环没有并行运行，不将此当作完整 Action 执行证据。

Inbox 联合测试 13 项及 HTTP/pg-boss 回归 21 项共 34 项通过，Core 类型和 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-http-delivery.json；本批仅测试/文档变更，未重跑 Core 全量或工作区。完整 V1 尚未完成。

### 2026-09-08：排空身份独立有界解析

QueueAdmissionDirectory.drainContexts 采用 ContextSource 与 requestVerifiedContext，在工作停止后以独立身份期限（默认 10 秒、最多 30 秒）传播只读 options/取消；取得当前身份后才开始队列排空期限。实际 IdentityIngress 测试安装转交该 options。新增真实数据库生命周期场景验证不合作身份超时后仍释放依赖，不能调用 drain 或虚构报告。

RuntimeService/身份/Inbox 相关 22 项通过，Core 类型/构建、11 份 API 报告与 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-drain-identity.json；未重跑 Core 全量或工作区。完整 V1 尚未完成。

### 2026-09-08：业务构建所需 Pack 摘要公共算法

核对 defineBusiness/Pack 设计后发现当前缺少完整 Manifest 契约和构建基础。本批先在 @abh/contracts/digest 实现 digestPackManifest：完整排除 integrity、带 kind 的文件集合按 UTF-8 ref 排序、JCS 和三层指定 SHA-256、返回 Cosign 签名原文。入口快照惰性 JSON，拒绝路径穿越/大小写别名/NFC 歧义和无效元数据；保持 Manifest 声明数组顺序。新增独立固定字符串计算及跨语言 JSON 黄金向量，覆盖非 BMP 排序、自引用避免和异步输入修改。

Contracts 全量 234 项（新增 5 项）、Contracts 类型/构建、48 份生成产物、11 份 API 报告及 222 处文档链接通过；公共 digest API 报告已更新。证据 verification-2026-09-08-pack-digest.json。未重跑 Core 或整个工作区。此算法只计算声明摘要，不验证文件字节/签名/信任；defineBusiness、完整 Manifest Schema、构建器及 Loader 仍需实现。

### 2026-09-08：Pack 原始 Payload 内容核验

新增 extensions/verifyPackContent，以显式文件/总字节/数量限制验证完整声明 Payload 集合，逐块 SHA-256 与长度核对，再返回公共 Pack 摘要结果。输入/限额/来源函数先快照；流读取共享最多 30 秒期限，过量、截断、篡改、错误完整性和超时均拒绝，失败请求迭代器清理。不解析或执行内容；归档扫描、证明文件、完整 Manifest Schema 和签名信任仍由后续 Loader 实现。

4 项 Pack 内容专项测试、Core 类型/构建、11 份 API 报告及 222 处文档链接通过。证据 verification-2026-09-08-pack-content.json；未运行 Core 全量/整个工作区。完整 V1、defineBusiness 与 Pack 启用尚未完成。

### 2026-09-08：Pack Manifest 结构与信任模式契约

新增 PackManifest、PackFileEntry、PackCapabilityReference/Requirement、PackResources 与 PackPath，复用现有 Contract 生成链。静态校验覆盖信任模式资源分支、Declarative 无网络/Secret、只有 TrustedCode 携带迁移、Payload/证明路径唯一与 NFC/大小写别名拒绝。Isolated 资源数值明确单位，0 不解释为无限。版本范围满足性、许可/签名命名空间、部署资源上限仍归 Loader，本 Schema 通过不构成 Pack 启用。

Contracts 全量 236 项、Contracts 类型/构建、Core 类型、48 份生成产物、11 份 API 报告及 222 处文档链接通过，公共 API 已更新。证据 verification-2026-09-08-pack-manifest.json；未重跑 Core 测试或完整工作区。Manifest 与字节验证的完整组合、归档/信任/CTK、defineBusiness 和完整 V1 仍未完成。

### 2026-09-08：正式 Manifest 与内容验证组合

verifyPackContent 在读取文件前强制正式 PackManifest Schema/关系校验，非法信任模式、网络权限或证明路径即使重算出一致摘要也拒绝。修复 source.open 的信号生命周期：现在覆盖整个文件读取，结束/失败/超时/外部取消均触发取消并释放监听和定时器。测试明确观察停滞读取器收到取消。

Pack 专项 5 项、Core 类型/构建、11 份 API 报告和 222 处文档链接通过。证据 verification-2026-09-08-pack-checked-content.json；未重跑 Core 全量或工作区。归档扫描、签名/来源/CTK、Pack 启用和完整 V1 仍未完成。

### 2026-09-08：受保护本地 Pack 内容扫描

新增 readLocalPackFiles，扫描不可变 staging 中声明的 Payload/证明集合，拒绝链接/特殊/额外/缺失文件，核对打开前后文件属性并限制目录项、单文件和总字节。结果私有快照接入实际 verifyPackContent，证明按引用返回副本。共享 Pack 测试 Manifest Builder。此实现要求受保护目录，不声称 Node 路径检查可以隔离并发攻击者改名；完整压缩归档/Manifest 文件解析及证明验证尚缺。

8 项本地文件/内容测试、Core 类型/构建、11 份 API 报告和 222 处文档链接通过。证据 verification-2026-09-08-local-pack.json；未重跑 Core 全量或工作区。完整 V1 尚未完成。

### 2026-09-08：Pack 部署静态准入

新增 admitPackDeployment，使用精确锁定 semver 7.7.4（ISC）与 @types/semver 7.7.1 解析兼容/依赖范围。固定 Pack ID、模式/许可允许列表、六类权限精确子集、提供能力命名空间；精确 HostProfile 引用以及 Isolated 已安装标志和六项 ceiling（含 0）分别验证。返回独立 Manifest；共享命名空间与隔离可用性来自受信安装，不自授 Grant 或代替签名/CTK。

Core 全量 314 项、Core 类型/构建、11 份 API 报告及 222 处文档链接通过，测试容器无残留。证据 verification-2026-09-08-pack-policy.json；未重跑完整工作区。依赖解析图、签名/来源/CTK、动态启用与完整 V1 仍未完成。

### 2026-09-08：Pack 能力依赖解析

新增 resolvePackDependencies，为已准入候选集解析能力 requires，生成稳定依赖优先安装顺序和精确绑定。明确部署选择解决多满足版本，不按最高版本/发现顺序猜测；缺失、不兼容、循环、自依赖、重复身份和未使用/失效选择拒绝，错误带诊断链。能力 Schema/Digest 尚未单独建模，重复能力身份不能视为等价，当前一律拒绝。安装状态、签名/Scope Release 与实际启用不在本解析器内。

Pack 相关回归 14 项（含新增依赖 3 项）、Core 类型/构建、11 份 API 报告及 222 处文档链接通过。证据 verification-2026-09-08-pack-dependencies.json；未重跑 Core 全量或完整工作区。完整 V1 尚未完成。

### 2026-09-08：本地 Pack 预检装配

新增 prepareLocalPack，将部署静态准入、受保护 staging 扫描及实际内容摘要核验接为共享期限的入口；输入先快照，输出冻结方法并只返回独立 Manifest/摘要/字节副本。候选没有执行权限，仍需签名、来源和 CTK 验证。

Pack 相关 16 项、Core 类型/构建、11 份 API 报告与 222 处文档链接通过。证据 verification-2026-09-08-prepare-pack.json；未重跑 Core 全量或工作区，完整 V1 尚未完成。

### 2026-09-08：真实 Cosign Pack 签名与独立 SLSA 来源验证

新增 verifyCosignBlob/verifyCosignAttestation、verifyPackSignature 与 verifyPackProvenance。固定部署公钥及精确 Pack ID；对重建原文运行 Cosign，来源另用 Builder 公钥验证 DSSE，再校验单一 subject 摘要/名称、Builder、buildType 和固定源码 URI/digest。显式 OfflinePublicKey 不要求透明日志；本地空 TrustedRoot 防止 --offline 仍初始化 TUF。无 shell/继承凭证环境，临时文件私有权限，最长 30 秒共享期限及 SIGKILL 后清理。拒绝错误公钥、内容/签名/来源替换、未签名 JSON 和错配发布者。

使用发布校验和匹配的 Cosign 2.6.1 实跑。Core 全量 324 项通过且无跳过，随后补充来源输入快照/截止检查，最终 Pack 专项 21 项通过；Core 类型/构建、11 份 API 报告和 222 处文档链接通过，容器无残留。测试公开证明由两个独立临时密钥生成，私钥已销毁。证据 verification-2026-09-08-pack-signature.json。未重跑完整工作区；尚缺 Fulcio/Rekor 策略、撤销/历史治理、CTK 正式报告与独立准入、完整 Loader 安装启用及 defineBusiness，完整 V1 未完成。

### 2026-09-08：CTK 正式报告与独立签名准入

新增 ConformanceReport/CaseResult/CapabilityClaim/Environment 及报告摘要政策，显式完整状态、非通过原因、唯一 case/能力、偏差引用和时间关系。verifyPackConformance 使用独立公钥 Cosign DSSE 绑定 Pack 原文，核对 subject、完整部署 case 清单、Suite/环境/fixture/seed、有效期、声明能力集合及 reportDigest；Incomplete/失败/未批准跳过/偏差拒绝。允许部署明确指定可选 Skipped，Complete 本身不等于通过。签名 Bundle 的 predicate 包含报告，避免报告进入被测 Payload 引发循环。

Contracts 全量 238 项、Pack 相关 22 项（包含真实 Cosign 临时独立签名，无跳过）、Contracts/Core 类型与构建、48 份生成产物、11 份 API 报告和 222 处文档链接通过。证据 verification-2026-09-08-ctk-report.json。未重跑 Core 全量或工作区；完整 CTK Suite/隔离 Runner/恢复/证据内容复验、Official 门禁、Loader 安装启用及完整 V1 仍待实现。

### 2026-09-08：本地 Pack 联合验证入口

新增 validateLocalPack，将受保护目录扫描/实际字节与发布签名、独立构建来源、独立 CTK 组合，完整输入策略先快照、共享最长 30 秒期限。返回固定内容门面及报告副本。扩展真实 Cosign 联合用例，三个证明来自不同签名策略，验证调用后篡改输入、目录内容变更与逐个证明替换；任一失败均不返回结果。

Pack 相关 22 项、Core 类型/构建、11 份 API 报告和 222 处文档链接通过。证据 verification-2026-09-08-validate-pack.json。未重跑 Core 全量或工作区；当前不是持久 ValidatePack/StagePack/EnablePack，无撤回/安装/迁移/依赖治理或业务授权，完整 V1 尚未完成。

### 2026-09-08：Pack 联合验证证据报告

新增正式 PackValidationReport 与摘要政策，validateLocalPack.validation 返回独立副本，绑定 Pack/内容摘要、部署策略、三份实际证明字节摘要、CTK 报告摘要及从 CTK 策略推导的期限。报告本身未签名/持久化，不授予安装权限；部署策略变化和撤回仍需当前治理查询。现有 Artifact Command 限 Action 准备用途，不绕过用途限制保存部署报告。

Contracts 全量 239 项、Pack 22 项、Contracts/Core 类型/构建、48 份生成产物、11 份 API 报告和 222 处文档链接通过。首次下游检查读取未完成构建的旧 Contracts 产物，等待完成后已重跑通过。证据 verification-2026-09-08-pack-report.json；未重跑 Core 全量或工作区。持久部署报告/安装治理及完整 V1 未完成。

### 2026-09-08：Pack 当前治理验证边界

新增 validateCurrentPack 与 PackGovernanceSource，验证前后读取当前认证部署快照，拒绝撤回 Pack/摘要、历史 ID/version 不同摘要及验证期间治理变化；核对证明/CTK 撤回和报告期限，返回独立治理 Ref。源方法绑定、快照 JSON 有界，治理读取共享取消/期限。测试采用内存治理源加真实 Cosign，覆盖中途撤回/版本变更、证明撤回、历史冲突及读取挂起。

Pack 回归 23 项、Core 类型/构建、11 份 API 报告及 222 处文档链接通过。证据 verification-2026-09-08-pack-governance.json。未重跑 Core 全量/工作区；持久治理源与 Stage 原子版本比较/授权/审计、完整安装启用和 V1 尚未完成。

### 2026-09-08：完整治理快照摘要

修正后续 Stage 只比较 policyRef 不足以绑定独立撤回/历史登记变化的问题：GovernedLocalPack 新增完整治理 JCS 摘要，拒绝重复撤回项和历史身份，明确 Stage 同事务锁内比较 Ref 和摘要。真实联合测试增加同 Ref 下撤回列表变化和重复身份拒绝。

治理/真实签名联合 2 项、Core 类型/构建、11 份 API 报告与 222 处文档链接通过。证据 verification-2026-09-08-governance-digest.json。未重跑全部 Pack/Core/工作区；持久治理源、Stage 原子比较及完整 V1 尚未完成。

### 2026-09-08：Manifest JSON/YAML 解析与 Worker 边界

新增 parsePackManifest/独立解析 Worker，锁定 yaml 2.9.0，限制 1 MiB 字节、AST 节点/深度和 Worker 堆/栈/期限；拒绝重复键、别名/标签、非法 UTF-8、非字符串键、多文档及不安全数值。validateCurrentPack 新增 manifestDocument 分支并与全部后续验证共享期限。取消/完成均等待 Worker 结束，源码及构建 JS 路径实测。

解析专项 3 项、Pack 联合回归 26 项、Core 类型/构建、构建 JS Worker smoke、11 份 API 报告及 222 处文档链接通过。证据 verification-2026-09-08-manifest-parser.json。未重跑 Core 全量/工作区；完整归档扫描、持久治理/Stage/Enable 和完整 V1 未完成。

### 2026-09-08：tar/gzip 归档验证输入

新增 validatePackArchive，锁定 tar-stream 3.2.1，压缩/展开字节及有效条目/文件限额，拒绝危险路径、重复/别名、链接和特殊文件，私有 staging 写入后解析根 Manifest 并运行全部内容/三证明/治理检查，结束清理目录。真实 gzip 到 Cosign 联合验证通过，返回内容不依赖已清理目录。类型检查使用依赖内建类型并校验流字节，移除多余 @types 包。

Pack 相关 27 项、Core 类型/构建、11 份 API 报告及 222 处文档链接通过。证据 verification-2026-09-08-pack-archive.json。未重跑 Core 全量/工作区；总内容快照仍限 64 MiB，原始扩展头数量仅由展开字节间接约束，持久治理/Stage/Enable 与完整 V1 未完成。

### 2026-09-08：隐藏 tar 元数据与结束块检查

使用 tar-stream 公开 Source.offset 计算未暴露的元数据间隙，将扩展头及其内容按 512 字节块保守计入 maxEntries，覆盖 Payload 前后；要求完整双零结束块并计入额外填充。未重写 tar 解析器。测试覆盖 PAX 重复/尾部元数据、缺结束块/截断、gzip 展开限额和取消，以及真实归档/签名联合验证。

Core 全量 332 项（无跳过）、专项 4 项、Core 类型/构建、11 份 API 报告与 222 处文档链接通过，隔离容器无残留。证据 verification-2026-09-08-archive-framing.json。未重跑完整工作区；64 MiB 快照限制、大包流式存储、持久治理/Stage/Enable 和完整 V1 仍未完成。

### 2026-09-08：发行包文件有界读取

新增 readPackArchive 与 validatePackArchiveFile：规范路径及普通无链接文件检查、分配前压缩大小限制、O_NOFOLLOW/O_NONBLOCK、分块读取和打开前后属性验证，最后关闭句柄。读取与全部解包/内容/证明/治理共享期限。真实 tar.gz 文件到完整验证联合测试通过，另测超限、链接、目录、缺失与取消。要求部署保护存储，不宣称 Node 路径检查隔离敌对改名。

相关专项 5 项、Core 类型/构建、11 份 API 报告及 222 处文档链接通过。证据 verification-2026-09-08-archive-file.json；未重跑 Core 全量或工作区，上一批全量 332 项通过。大包流式存储、持久治理及 Stage/Enable 与完整 V1 尚未完成。

### 2026-09-08：Pack 验证报告持久化 Owner

数据库清单版本 44 新增 extension.validation_reports，强制租户 RLS、运行时仅 SELECT/INSERT，报告摘要与记录字段绑定，启动检查覆盖新 Schema/verifier 权限。新增内部 PackValidationReportOwner，接收本进程真实验证候选（WeakSet 防对象伪造），保存治理 Ref/摘要并原子追加审计/Outbox；读按用途/Workspace 限制并复算摘要。登记 abh.pack-validation 与验证记录事件，生成公共协议。

真实发行包验证后入库、新连接查回、跨租户拒绝、伪造候选拒绝、数据库不可变权限及报告/审计/Outbox 回滚通过。专项 13 项、Core 全量 333 项无跳过、Contracts 全量 239 项、Contracts/Core 类型/构建、48 份生成产物、11 份 API 报告及 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-pack-report-storage.json。未重跑完整工作区。准入为测试 Fixture，正式部署治理 Command/用途/Grant/幂等/治理锁与持久 trust_policies、Stage/Enable 及完整 V1 尚未完成。

### 2026-09-08：Pack 报告审计身份固定

修复报告准入等待期间可变命令对象替换审计动作/摘要/因果 ID：存储入口先固定身份并验证格式、内部动作类型及报告摘要绑定。真实签名/数据库联合用例验证回调改写后原审计值保持，错误类型/摘要/ID 不产生报告，既有原子回滚和 RLS 继续通过。

联合专项 1 项、Core 类型/构建、11 份 API 报告和 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-pack-report-binding.json。未重跑 Core 全量/工作区；内部记录约定不等于正式 ValidatePack Command，部署用途/Grant/幂等/治理锁与 Stage/Enable 及完整 V1 仍缺。

### 2026-09-08：Pack 报告正式内部记录命令

登记 Internal RecordPackValidationCommand/Payload，target 绑定 Organization，Payload 绑定报告与治理证据，公共 digestCommandIntent 替代命令 digest 等于报告 digest 的临时约定。Owner.record 调用 executeCommand，在同事务记录报告/审计/Outbox/回执；重放仍先当前准入，同键异参拒绝。保持候选不可伪造和命令快照。

Contracts 全量 240 项、真实签名/数据库联合 1 项、Contracts/Core 类型/构建、48 份生成产物、11 份 API 报告与 222 处文档链接通过，容器无残留。联合用例验证重复返回原 Ref、准入撤回后拒绝重放、异参冲突及四类记录各一条。证据 verification-2026-09-08-pack-record-command.json。未重跑 Core 全量/工作区；当前准入仍为 Fixture，生产用途/Grant/治理锁、跨进程验证任务恢复、公开 ValidatePack 与 Stage/Enable 及完整 V1 未完成。

### 2026-09-08：Pack 记录用途与当前授权入口

新增专用 abh.pack.manage 用途及对应内部 action 登记，recordPackValidation 将同组织非 Workspace Human/Service Context、当前身份与组织 Grant、完整 fence 集合及必填部署治理检查装配到内部记录命令。参数/检查方法先快照，重放仍先重新准入。真实签名候选通过数据库身份/Grant/fence 后记录，测试用途错误、无 Grant、Workspace、成员撤回、治理拒绝和 Grant 撤回；测试身份/Grant 由维护 Fixture 创建，治理检查仍显式 Fixture。

Contracts 全量 240 项、真实签名/数据库联合 1 项、Contracts/Core 类型/构建、48 份生成产物、11 份 API 报告和 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-pack-record-admission.json。未重跑 Core 全量或工作区；真实部署 IdP/MFA、持久 Trust Policy/版本锁/撤回/保留检查、异步 ValidatePack 与 Stage/Enable 和完整 V1 仍待实现。

### 2026-09-08：持久 Pack 治理版本与事务比较

数据库清单 45 新增不可变 extension.trust_policies；PackTrustPolicyOwner 保存连续版本、固定策略 ID、完整快照摘要并保留历史身份。publish/match 使用同组织/Pack advisory 事务锁，报告记录在当前 Grant/fence 后比较数据库最高版本与摘要。databasePackGovernanceSource 每次读取先授权，再读取持久快照，无内存版本缓存。快照共享结构校验，读取验证摘要。

数据库/签名专项 13 项通过，新增双连接并发发布、历史保留/跨租户/不可变权限由 Core 全量 333 项覆盖，全部无跳过；Core 类型/构建、11 份 API 报告及 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-pack-trust-storage.json。未重跑 Contracts/完整工作区。策略发布 authorize 仍为测试 Fixture，未实现签名策略公共契约与管理 Command/Grant/审计/幂等；Stage/Enable 和完整 V1 未完成。

### 2026-09-08：治理策略独立签名与持久证明

新增 verifyTrustPolicy，独立部署管理公钥通过真实 Cosign 验证带域标识的完整组织/有效期/治理快照原文，固定组织/Pack/Policy 身份和最长有效期。publish 仅接收私有验签候选，防止裸对象或复制候选冒充，发布回调获得公钥指纹以重查当前管理授权。数据库清单 46 保存签名原文、Bundle、指纹和期限，读取拒绝旧未签名及过期最高版本，并核对原文与持久快照绑定。

Core 全量 333 项通过；随后显式收紧已签名行 expires_at 非空约束，最终数据库/签名专项 13 项通过，均无跳过。Core 类型/构建、11 份 API 报告、222 处文档链接通过，容器无残留。证据 verification-2026-09-08-trust-signature.json。未重跑 Contracts/工作区。内部签名封装尚无公共 Schema，管理根撤回/正式发布 Command/Grant/审计/幂等及 Stage/Enable 与完整 V1 未完成。

### 2026-09-08：正式治理快照与签名策略契约

新增 PackDeploymentPolicy/SignerPolicy/ProvenancePolicy/ConformancePolicy/GovernanceSnapshot/SignedTrustPolicyDocument 六类正式 Schema，字段与嵌套对象封闭，集合/字符串/资源有界，三类证明绑定相同 Pack，拒绝重复 Suite case/能力/历史身份/撤回项和签名时间倒序。Core 采用生成治理/证明类型，并在签名文档、持久策略读写及部署准入强制 Schema；数据库清单的 trust_policies 关联正式记录契约。登记 abh.pack-trust-policy 对象。

Contracts 全量 242 项（新增 2 项）、治理/数据库/签名相关 17 项、Contracts/Core 类型/构建、48 份生成产物、11 份 API 报告与 222 处文档链接通过，容器无残留。证据 verification-2026-09-08-trust-contract.json。未重跑 Core 全量/工作区。管理根撤回、正式发布 Command/Grant/审计/幂等、发行工具与 Stage/Enable 和完整 V1 仍未完成。


## 2026-09-08：签名治理策略发布 Command

新增 Internal PublishPackTrustPolicyCommand（abh.packs.publish-trust-policy），以组织为目标，payload 绑定完整签名文档的 JCS 摘要、管理公钥指纹和 expectedVersion。publishPackTrustPolicy 只接受私有验签候选，要求同组织、无 Workspace 的 Human/Service、abh.pack.manage 用途、当前身份与组织 Grant；锁定组织/主体/Grant/部署治理 fence 后执行必填当前管理签名者/撤回/引用/保留检查。重放也执行相同准入，不能利用旧 Receipt 绕过撤权。

策略追加、审计、abh.pack.trust-policy-published 事件和 Command Receipt 同事务。CAS 继续使用组织/Pack 锁，竞争发布只有一方提交；相同命令意图重放返回原策略 Ref，签名文档改变须更换幂等键。管理签名者授权仍为显式部署接口，测试中的允许/撤回值是 Fixture；尚无持久管理根/轮换/撤回 Owner，也未开放管理 HTTP 或 CLI 发行工具。Stage/Enable 和完整 V1 仍待实现。

本批验证：Contracts 243 项、Core 串行全量 333 项通过（无跳过），类型/构建、48 个生成制品、11 个 API 报告通过。首次并发回归有两项容器端口映射启动超时，日志保留；串行全量重跑全部通过，隔离容器剩余 0。证据见 [签名策略发布验证](verification-2026-09-08-trust-publish.json)。


## 2026-09-08：Pack 本地持久 staging

stageLocalPackSnapshot 将私有 GovernedLocalPack 的完整 Manifest、原验证报告、治理 Ref/摘要及所有 Payload/三类证明保存到部署控制的本地持久目录。根路径须绝对、规范、当前进程所属且权限 0700，祖先目录也须由部署保护。每次写入使用独立 UUID，不以 Pack ID/version 覆盖目录；文件 0600、目录 0700，写完读回验证字节与证明摘要，逐文件与目录 fsync 后原子 rename，再 fsync 父目录。沿用当前内存快照的 64 MiB 总内容上限，元数据单独限 2 MiB。

recoverLocalPackSnapshot 用安装控制面保留的 id/metadataDigest 回读，验证正式 Manifest/PackValidationReport、报告自身摘要与 Manifest 绑定、原 Payload 摘要和三个证明摘要；拒绝链接、超界及内容替换。恢复返回独立内存副本，不能取得 GovernedLocalPack 的私有验证身份，也不自动重签原验证时间。当前用途/Grant/信任、撤回、期限和安装状态须另行重验。

原子发布前失败清理本次临时目录；发布后父目录同步失败或取消保留完整目录，调用结果为失败/不确定，不能据此假定数据库安装成功。当前未实现遗留目录 GC，不删除无明确引用/保留依据的快照。StagePack Command、installed_packs/installation 持久状态与 deploymentVersion CAS、数据影响报告、Enable、能力 Registry 仍待装配；此模块只完成可恢复的文件 staging。该路径要求持久本地文件系统支持目录 fsync，不适用于临时容器层或多个无共享磁盘的宿主，也不替代业务 Artifact ObjectStore。

本批验证：Core 串行全量 333 项通过，无跳过；类型、构建与 2 个 Core API 报告通过。真实独立进程恢复、取消及 fsync 故障注入包含在联合测试中，见 [本地 staging 验证](verification-2026-09-08-pack-staging.json)。


## 2026-09-08：StagePack 安装事务

新增 Internal StagePackCommand（abh.packs.stage），输入为持久 validationRef、无宿主路径的 LocalPackStagingReceipt 和 expectedDeploymentVersion。安装根目录由受信部署单独提供。当前身份/同组织管理 Grant/用途与部署 fence 通过后，按组织 Deployment 锁、Pack 治理锁顺序重验原报告及最高治理版本，再读回持久快照并核对完整证据；磁盘读取后再次验证当前权限与期限。重放也执行相同准入，不以原 Receipt 绕过撤权或内容损坏。

数据库清单 47 加入 extension.installed_packs（InstalledPackRecord、RLS FORCE、运行时仅 SELECT/INSERT）。Staged 记录保留完整 Manifest、原报告 Ref/摘要、治理 Ref/摘要和持久快照 Ref。组织部署序号在同一锁内单调追加；组织/Pack ID/version 唯一且不允许覆盖或删除，不同摘要的既有身份拒绝。安装记录、审计、abh.pack.staged 事件和 Command Receipt 同事务，重复命令返回原 Ref。

当前 Staged 行作为不可变初始事实保存，不提供 Enable/Suspend/Retire 修改接口。Stage 的数据影响报告、installation 步骤/恢复事实、迁移验证、能力依赖注册及完整生命周期仍未实现；缺少这些证据不会自动启用。管理签名者撤回/引用/保留检查仍由必填部署 admission 提供。多宿主共享制品、持久 staging 遗留目录清理和真正独立 CTK 执行器仍有缺口。

本批验证：Contracts 244 项、相关数据库/真实签名 13 项通过，无跳过；类型、构建、48 个生成制品、11 个 API 报告通过。Core 全量首轮 332/333 通过，一项新增测试将 postgres.js 空 Result 与普通数组比较导致断言失败；改为行数检查后，受影响联合场景及完整数据库组 13 项重跑通过，未重复无关测试。实现代码在全量后未改变。见 [StagePack 事务验证](verification-2026-09-08-stage-command.json)。


## 2026-09-08：持久安装读取与恢复

InstalledPackOwner.read 从 extension.installed_packs 读取精确 Ref，验证正式 InstalledPackRecord、关系列、部署序号、状态及 Manifest 三项重算摘要，并要求调用方提供当前准入。stagePack 新提交与幂等重放都读取实际安装行，核对快照/验证报告/治理引用和部署序号；Receipt 不能掩盖安装行证据损坏。

recoverStagedPack 接受持久 Pack Ref，要求当前同组织、无 Workspace 的 Human/Service、abh.pack.manage 用途与 abh.packs.stage 管理 Grant。读取原验证报告、锁定管理 fence 与当前 Pack 治理，核对报告/安装/磁盘三方证据一致，读盘前后复核期限及授权。返回独立的安装元数据/字节快照，不签发新的 GovernedLocalPack、不刷新验证时间，也不授予执行权限。安装根目录来自受信部署，不来自外部 Command 字段。

Stage 与恢复读盘使用 TenantTransaction 的取消信号，事务到期后不会继续完整扫描。当前行只支持 Staged；变更治理导致原证据过时会拒绝恢复，重新验证与安装步骤续接仍待实现。数据影响报告、Enable/Suspend/Retire、Capability Registry、管理根持久撤回以及 Stage 遗留文件回收仍未完成。

本批相关数据库与真实 Cosign 联合测试 13 项通过，无跳过；Core 类型/构建与 2 个 API 报告通过。本批未重复全量测试，见 [安装恢复验证](verification-2026-09-08-installed-recovery.json)。


## 2026-09-08：治理预留与已安装身份一致性

PackTrustPolicyOwner.publish 在共同 Pack 锁内核对 reservedVersions 与 extension.installed_packs。新策略即使签名合法，也不能给本 Pack 已安装的 ID/version 预留另一个 packageDigest；失败不产生策略版本、事件或回执。只比较本策略 Pack ID 的预留，其他 Pack 的同名版本不会被错误合并。已有历史预留仍须完整保留。

Stage 与策略发布共用 Pack 锁，Stage 在锁内核对当前策略并提交不可变身份，策略发布在同一锁内读取已提交身份。该检查关闭显式预留与安装记录相矛盾的路径；不替代 Stage 的唯一键，也不意味着安装/Enable/数据影响评估或管理根撤回已完成。

本批数据库与真实签名联合测试 13 项通过，无跳过，Core 类型/构建/2 个 API 报告通过；未重跑全量。见 [预留身份一致性验证](verification-2026-09-08-pack-reservation.json)。


## 2026-09-08：数据影响差异计算

assessPackDataImpact 比较显式 baseline/target 数据定义清单，按 kind/id 对 Schema、Projection、DataTransform 的语义摘要进行确定性排序与新增/修改/删除比较。结果绑定 packageDigest、baselineDigest、targetDigest，并保留受影响定义的前后摘要与声明迁移路径。输入先快照、清单有界且拒绝重复身份/未知字段，Manifest 摘要不符拒绝。

仅当前后清单都 complete、定义无变化且没有声明 Migration 时返回 NotApplicable；任一清单不完整返回 Incomplete，完整清单下存在定义变化或 Migration 返回 Required。第一次部署可以显式提供完整空基线，不制造不存在的历史版本；新增定义仍被识别为变化。migrations 为空不能覆盖 Projection/Schema/数据转换变化。

这是内部纯计算模块，尚未形成正式签名/持久影响报告或启用授权。清单的 complete 声明及语义摘要必须由受信编译器和当前部署目录核验，不能信任 Pack 自报的无影响标记。正式库存/报告 Contracts、编译器来源绑定、环境/基线版本锁、影响报告 Owner、迁移验证和 Enable 装配仍待完成；当前函数不接受或运行包内迁移代码。

本批新增 4 项数据影响计算测试通过，无跳过；Core 类型/构建/2 个 API 报告通过。未重跑无关全量场景，见 [数据影响计算验证](verification-2026-09-08-data-impact.json)。


## 2026-09-08：数据影响正式 Contracts

新增 PackDataDefinition、PackDataInventory、PackDataChange、PackDataImpact 四个正式契约并接入统一生成类型/校验。Core 不再维护并行接口与手写结构验证；清单输入和差异输出均经 Contract 校验。清单最多 10000 个定义、差异最多 20000 项；对象关闭未知字段，条目/迁移路径唯一。

关系验证要求 Added 只有 afterDigest、Removed 只有 beforeDigest、Changed 有两个不同摘要；变化/迁移原因须与内容一致，InventoryIncomplete 必须对应 Incomplete，有必要验证项必须为 Required。不适用结果要求前后清单摘要相同，有定义变化则摘要必须不同。不同 kind 下相同 id 仍为不同定义，不误合并 Schema 和 Projection。

该批关闭“影响结构无正式 Contracts”的缺口。Schema 只验证内部一致性，不证明清单来源或完整性声明属实；受信编译器、部署基线/环境绑定、报告签名/持久 Owner、迁移执行验证、Enable/Registry 和完整 V1 仍待实现。

本批 Contracts 全量 247 项、Core 数据影响 4 项通过，无跳过；Contracts/Core 类型与构建、48 个生成制品和 11 个 API 报告通过。本批未重复 Core 全量，见 [数据影响契约验证](verification-2026-09-08-impact-contract.json)。


## 2026-09-08：影响结果重算验证

verifyPackDataImpact 从独立取得的前后清单和完整 Manifest 重算影响结果，与输入报告逐字段比较。先经正式 Schema/关系验证，再规范化变化/迁移/原因集合顺序，核对全部内容及三项摘要；合法 Schema 不能掩盖被删除的变化项、伪造“不适用”、替换基线、完整性声明变化或虚构迁移。调用期间修改输入报告不改变校验对象。

该函数验证报告与给定输入相符，不证明清单自身来自受信编译器或当前部署。报告持久 Owner、编译器来源证明、环境与部署版本锁、数据迁移验证和 Enable 仍需接入，不能将函数返回值视作启用授权。

本批数据影响相关 6 项测试通过，无跳过，Core 类型/构建/2 个 API 报告通过；见 [影响重算验证](verification-2026-09-08-impact-recompute.json)。


## 2026-09-08：数据影响持久 Owner 与管理命令

新增 PackDataImpactRecord/RecordPackDataImpactCommand，绑定精确安装 Ref、组织部署版本、Compiler CapabilityRef、环境摘要、前后来源 Ref、完整清单和重算结果。正式契约要求 compilerRef.kind=Compiler，报告 completeness 与两个来源清单一致；全部绑定字段参与 Command 意图摘要。数据库清单 48 新增 extension.data_impact_reports，RLS FORCE、运行时仅 SELECT/INSERT，存储完整报告及独立记录摘要。

recordPackDataImpact 要求当前同组织、无 Workspace 的 Human/Service、abh.pack.manage 用途及专用 abh.packs.record-data-impact Grant。锁定管理 fence、组织 Deployment 和 Pack 治理后核对当前部署版本，读取实际安装、原验证报告和磁盘快照，逐项绑定证据并重算影响。读盘前后重验当前权限/治理及期限。报告、审计、事件、Receipt 同事务；重放重做准入和计算，并验证回执所指的持久报告内容/摘要。Incomplete/Required 可作为评估事实记录，但不构成迁移完成或 Enable。

PackDataImpactAdmission.current 为必填：需核验编译器的当前受信身份、环境及两个来源 Ref 的真实内容/complete 声明，还需管理签名者撤回、引用与保留准入。联合测试中的编译器/来源检查是显式 Fixture，未冒充实际公开编译器或持久来源解析器。PackDataImpactOwner.read 是内部读取原语，调用方必须提供当前准入；其本身只校验记录摘要，不授权使用历史报告。数据影响已有正式持久事实，但实际编译器证据来源、签名、基线目录、迁移验证、安装步骤恢复、Enable/Registry 仍待完成。

本批 Contracts 248 项、Core 串行全量 339 项（相关组 19 项）通过，无跳过；类型、构建、48 个生成制品及 11 个 API 报告通过，隔离测试容器剩余 0。见 [数据影响 Owner 验证](verification-2026-09-08-impact-owner.json)。


## 2026-09-08：当前影响报告读取

readCurrentPackDataImpact 根据持久影响 Ref 执行当前身份/用途/组织管理 Grant 校验，读取安装与原验证证据，在组织 Deployment 和 Pack 锁内核对当前部署版本、编译器/来源准入及治理，再读回实际快照并重算报告。记录、新命令重放和当前读取共用同一检查实现，避免三个入口逐渐产生不同准入规则。存储摘要漂移、磁盘损坏、编译器撤权、策略换版或 Grant 撤回均拒绝读取。

底层 PackDataImpactOwner.read 仍供同事务组合使用并要求调用方准入；新入口要求与记录报告相同的管理 action，不扩大普通 Agent 读取权限。读取不产生新的报告、刷新验证时间或启用授权。实际来源解析/签名编译器证据、迁移验证、Enable 与 Registry 仍未实现。

本批相关数据库、真实签名与影响计算测试 19 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量，见 [当前影响报告读取验证](verification-2026-09-08-impact-read.json)。


## 2026-09-08：影响清单 Artifact 来源读取

verifyImpactInventoryArtifacts 从报告中的 baselineSourceRef/targetSourceRef 经真实 InlineArtifactOwner 读取，复用精确版本、Available 状态、租户/用途/Workspace、字节长度和正文摘要校验。来源要求 application/json、最多 64 KiB、规范 JCS 正文和正式 PackDataInventory；拒绝重复 JSON 键及不规范序列化，按定义 kind/id 排序后与报告中的前后清单逐字段比较。调用方必须在来源 fence 内提供 Artifact 当前所有权、区域、保留和编译器准入。

联合测试现将前后清单实际保存为 Available Artifact，由报告引用其精确 Ref，准入中读取真实正文并核对 owner/sourceRefs。覆盖正文摘要损坏、合法但不匹配的清单、重复 JSON 键和旧版本引用拒绝，沿用 Artifact 租户/用途/墓碑测试。来源内容核验已不再只靠清单内存相等断言；编译器签名/可信完整性和实际基线目录仍未实现，测试中的 owner/sourceRefs 授权是明确 Fixture。大清单仍需后续流式 ObjectStore，当前辅助函数只支持有界内联来源。

本批 Artifact 与真实签名联合测试 8 项通过，无跳过；Core 类型、构建、2 个 API 报告通过，隔离容器剩余 0。见 [影响来源 Artifact 验证](verification-2026-09-08-impact-artifact.json)。


## 2026-09-08：来源正文核验强制装配

影响报告记录/重放/当前读取的共享检查现直接调用 verifyImpactInventoryArtifacts，读快照前后均重新核对实际来源正文。PackDataImpactAdmission 新增必填 source 方法，接收真实 ArtifactRecord、Baseline/Target 角色与报告副本，负责当前编译器所有权、来源访问、区域和保留准入。宿主不再需要自行记得调用正文核验辅助函数；即使 current 回调不比较清单，来源内容不匹配也会被 Owner 拒绝。

来源授权方法和其他检查在入口绑定，外部后续替换检查对象不改变当前请求的授权方法。仍需宿主提供对应 source/governance fence，完整编译器证明与基线目录尚未实现。此装配当前支持 64 KiB 内联 JSON Artifact，不把来源可读等同于编译器可信，也不执行迁移或启用。

本批相关测试 8 项通过，无跳过；Core 类型/构建/2 个 API 报告通过，隔离容器剩余 0。见 [强制来源核验验证](verification-2026-09-08-impact-source-required.json)。


## 2026-09-08：影响来源行并发保护

InlineArtifactOwner.lockSources 在租户/用途/Workspace 可见范围内，将完整来源集合去重并按 UUID 排序获取 FOR SHARE 行锁。verifyImpactInventoryArtifacts 在读取任何清单前锁住 baseline/target 两行；锁持续到报告记录、重放或当前读取事务结束，来源正文核验后不会被其他事务更新/墓碑替换。锁本身不授予访问权，版本、Available、授权与字节校验仍经正常 Owner.read。

锁应在管理 fence/部署/Pack 聚合锁之后获取，调用者一次传入完整来源集合，不升级来源锁执行修改。不能据此省略管理资格或来源授权 fence；该保护只保证已读 Artifact 行的事务内稳定，不证明编译器输出或 complete 声明可信。

真实 PostgreSQL 竞争验证：影响来源事务持锁时另一连接 UPDATE 遇到 lock_timeout，来源事务完成后相同 UPDATE 成功。相关 Artifact 与真实签名联合测试共 8 项通过，无跳过，Core 类型/构建通过。编译器证明、基线目录、迁移验证及 Enable/Registry 仍待实现。

验证记录：[影响来源事务锁](verification-2026-09-08-impact-source-lock.json)。本批 2 个 Core API 报告通过，隔离测试容器剩余 0。


## 2026-09-08：编译器影响签名验证

verifyImpactSignature 复用实际 Cosign 离线公钥验证，原文为 JCS ["abh-pack-data-impact-v1", organizationId, PackDataImpactRecord]。部署独立固定组织与精确 Compiler CapabilityRef（含版本/摘要）及公钥，完整报告覆盖安装、部署版本、环境、前后来源和清单。成功后签发进程内 WeakMap 私有候选，matchImpactSignature 核对当前组织/完整报告并返回公钥指纹、Bundle 摘要和验签时间；伪造同形或复制对象不能取得已验签身份。输入报告、配置、Bundle 在异步调用前快照。

真实测试生成独立编译器密钥签名，验证正常证明及错误组织、编译器版本、管理者公钥替代、环境摘要篡改、候选伪造和输入并发修改。签名证明当前为内部验证能力，不证明清单 complete 声明属实；报告 Owner 的 mandatory proof 装配、Bundle 持久化/恢复、当前编译器根撤回和签名有效期策略仍待实现。不能把一次验签当成当前治理或 Enable 授权。

本批真实签名/数据库联合场景 1 项通过，无跳过，Core 类型/构建/2 个 API 报告通过。见 [编译器影响签名验证](verification-2026-09-08-impact-signature.json)。


## 2026-09-08：影响签名必需装配与持久恢复

recordPackDataImpact 现必须接收私有 VerifiedImpactSignature，签名 Bundle 不能由同形对象冒充。数据库清单 49 为 extension.data_impact_reports 增加 signature_bundle（原始 bytea）、signer_key_digest、bundle_digest，三列同时为空或完整且有界；旧未签名行不伪造证明，Owner.read 拒绝使用。记录事务保存实际已验签 Bundle，与报告/审计/事件/Receipt 一并提交。

PackDataImpactAdmission.signer 在管理/部署/Pack 锁内提供当前部署信任公钥与精确 CompilerRef。记录、重放、当前读取均用实际 Bundle 重新执行 Cosign，并核对公钥指纹及 Bundle 摘要；最后复核 signer 配置未变，公钥配置提前深拷贝。当前读取直接恢复持久 Bundle，不依赖原进程私有候选。重放要求提交原证明（相同公钥及 Bundle 摘要），不悄悄替换持久签名证据；重新签名的证明应使用新的记录请求。

低层 Owner.read 仍要求调用方准入，仅检查存储证明存在与摘要，不自行选择信任根。当前 signer/source 授权来源仍为部署接口，测试用独立编译器公钥 Fixture；持久编译器根撤回/轮换和签名有效期策略仍待实现。报告当前性另受原验证报告有效期、部署版本和当前治理约束；没有签名时间字段时不宣称完成独立编译器签名过期验证。Enable/Registry 与完整 V1 仍未完成。

本批相关测试 13 项通过，无跳过，Core 类型/构建/2 个 API 报告通过，隔离容器剩余 0。见 [持久影响签名验证](verification-2026-09-08-impact-proof.json)。


## 2026-09-08：影响编译器证明有效期

PackDataImpactRecord 正式增加 issuedAt/expiresAt，关系要求 expiresAt 晚于 issuedAt；时间字段参与完整报告签名、Command 意图摘要和存储记录摘要。ImpactCompilerSigner 必填 maxLifetimeMs（正安全整数），验签前后拒绝未来签发、已到期及超出部署最长有效期的报告。matchImpactSignature 不允许已经到期的私有候选继续用于持久记录；当前报告准入同时重验原 Pack 验证报告与编译器证明期限。

旧缺少时间字段的报告不补伪造签发时间，正式 Schema 会拒绝；重新签发需形成新报告/请求。签名最长有效期策略收紧由当前 signer 解析生效，公钥根撤回/轮换的持久 Owner 仍待实现。该批完成时间绑定与校验，不代表来源清单 complete 声明、基线目录、迁移验证或 Enable 已完成。

本批 Contracts 248 项及相关数据库/签名测试 13 项通过，无跳过；类型、构建、48 个生成制品和 11 个 API 报告通过，隔离容器剩余 0。见 [影响证明有效期验证](verification-2026-09-08-impact-expiry.json)。


## 2026-09-08：末次回调后证明到期保护

影响报告共享准入在最后一次来源读取及 signer 配置回验后，再执行私有签名候选的当前有效期检查，并复核原 Pack 验证报告 validUntil。修复最后一个异步回调跨过证明到期时间后仍能进入持久写入的窗口；记录、重放和当前读取共用该检查。

真实 Cosign 生成短期证明，第二次 signer 回调等待到实际到期；事务返回 PRECONDITION_FAILED，数据库没有留下报告、Command Receipt 或 Outbox 事件。测试不依赖模拟时钟推进此竞争路径。本批联合场景 1 项、Core 类型/构建/2 个 API 报告通过，无跳过；未重复全量。完整编译器根治理、基线目录、迁移验证与 Enable 仍待完成。

证据见 [末次回调到期验证](verification-2026-09-08-impact-late-expiry.json)。


## 2026-09-08：迁移计划静态准入

validatePackMigrationPlan 绑定完整 Manifest 摘要与声明迁移的精确 ref/digest，要求每个迁移恰好出现一次。只允许 TrustedCode，目标 Schema 必须属于该 Pack 且绑定相同专用数据库角色。Core 清单内 Schema、public/information_schema、pg_/abh_ 保留名字和保留角色拒绝；所有权重复、未知字段、超界集合、缺少证明 Ref 拒绝。计划按 Expand→Backfill→Contract 不回退，Drop 仅允许 Contract，Contract 必需 retirementRef。

每步显式声明事务性、操作类别、review/dryRun/safetyPoint/recoveryPlan/compatibility Ref。没有迁移则返回空计划，不制造空迁移。当前为内部静态规划模块，证明 Ref 仅检查结构，仍需在执行事务/作业中核验真实审查、演练、安全点、恢复方案、兼容和旧代码退出事实；SQL 的实际权限必须由 Pack 专用角色保证，不自研 SQL 安全解析器。正式计划 Contracts、schema_ownership 持久 Owner、Migration Port/Runner 以及结果验证尚待实现，不可把本函数通过当成允许执行迁移。

本批迁移计划测试 5 项通过，无跳过；Core 类型/构建/2 个 API 报告通过。见 [迁移计划验证](verification-2026-09-08-migration-plan.json)。


## 2026-09-08：迁移步骤与所有权正式契约

PackSchemaOwnership、PackMigrationStep 进入 Contracts 统一生成链，Core 直接使用生成类型与验证器，删除并行结构/集合校验。标识符限定规范小写 PostgreSQL 名字并有长度上限，schemas/operations 非空、有界且唯一；审查、演练、安全点、恢复和兼容引用必须完整。关系校验强制 Drop→Contract、Contract→retirementRef。输入结构或关系错误现统一 INVALID_ARGUMENT；跨 Pack/保留 Schema 与角色仍由 Core 当前清单准入拒绝。

契约只描述迁移步骤和所有权声明，不能证明真实 PostgreSQL 权限或证据 Ref 内容。实际 schema_ownership 注册、签名/当前治理、Migration Runner 及迁移验证仍需实现。此前“无正式计划类型”的缺口由这两个契约关闭，整套迁移执行与 Enable 不据此宣称完成。

本批 Contracts 250 项、Core 迁移计划 5 项通过，无跳过；类型、构建、48 个生成制品和 11 个 API 报告通过，见 [迁移契约验证](verification-2026-09-08-migration-contract.json)。


## 2026-09-08：迁移专用角色隔离与数据库预检

迁移计划拒绝不同 Pack 共用一个数据库角色，仍允许同 Pack 的多个 Schema 共用专用角色。新增内部 verifyPackMigrationDatabase，在直接使用专用角色登录的固定连接上读取真实 PostgreSQL 16 目录：核对 session_user/current_user、角色属性、角色成员关系、数据库 CREATE/TEMP、自有 Schema 所有权，以及外部 Schema、表/列、序列和 SECURITY DEFINER 函数权限。拒绝通过管理员连接 SET ROLE 冒充独立登录，PUBLIC 授权也参与检查。系统目录写授权同样拒绝；pg_settings 为 PostgreSQL 会话配置接口，精确排除该默认可写视图，会话配置约束由执行器负责。

真实 PostgreSQL 测试覆盖自有 Schema 建表成功、Core 写入/角色切换/临时表创建失败，以及逐项注入越权授权后预检拒绝。静态声明集合必须来自部署可信所有权来源；目前仍未持久注册 schema_ownership。预检只检查当前连接的当前权限，不构成执行授权，也不解决管理员并发改权、函数体审查、会话配置或跨数据库权限。当前 Core readiness 仍拒绝未登记的业务表，必须在持久所有权与 readiness 装配完成后才能接入正式迁移。Migration Runner、真实迁移证据验证、恢复步骤记录及 Enable 仍待实现。

本批迁移相关测试 20 项、最终全量 Core 359 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。第一次全量运行暴露 pg_settings 默认权限误判，修正后重新完整运行通过。见 [迁移角色验证](verification-2026-09-08-migration-role.json)。


## 2026-09-08：部署级 Schema 所有权持久登记

数据库清单升至 50，新增 extension.schema_roles 与 extension.schema_ownership。Schema 名在整个数据库唯一；专用角色绑定唯一 Pack，通过复合外键约束 Schema/角色/Pack 一致，避免不同租户各自声称拥有同一 PostgreSQL Schema。两表由 abh_core_owner 拥有，运行时仅 SELECT，Queue 无写入权限，不使用租户 RLS 假装物理资源可按租户拆分。

registerPackSchemaOwnership 是维护连接专用的内部登记入口：快照并验证完整声明，锁定两张全局表，核对实际 Schema Owner 及角色危险属性/成员关系，批量原子登记。冲突整体回滚；相同声明重放保留原始审查引用、登记时间与维护登录身份。登记不创建角色/Schema，不把审查引用存在等同于审查通过。审查引用内容、当前部署治理及迁移证据仍需 Migration Runner 独立验证；该入口没有运行时 Command 或普通 Agent 写入路径。

PackSchemaOwnershipOwner 在当前管理上下文及必需准入回调后读取完整部署清单。静态所有权验证复用统一实现。readiness 检查新增表的运行时只读权限、列级写授权及全局唯一/复合外键约束，约束删除会拒绝启动。migration_version 固定 0 表示仅完成登记，尚无迁移执行事实；不允许登记流程假造已完成版本。

持久登记缺口由本批关闭，尚需将当前治理/迁移计划装配到实际 Runner，并实现迁移版本与步骤结果记录。readiness 对业务表的正式登记及权限/租户规则仍未完成，当前继续拒绝未知业务表；因此不宣称已有完整 Pack Migration 或 Enable。

本批相关测试 41 项、全量 Core 368 项通过，无失败或跳过；Core 类型/构建及 2 个 API 报告通过，隔离容器剩余 0。见 [Schema 所有权验证](verification-2026-09-08-schema-ownership.json)。


## 2026-09-08：持久所有权与迁移数据库预检装配

verifyRegisteredPackMigrationDatabase 使用当前 TenantTransaction 的管理 Owner 读取完整持久 Schema 所有权，接口不再接受调用方所有权声明。输入 Manifest/步骤提前快照；当前管理准入与第一次数据库权限预检后，再执行当前准入、重读完整所有权并比较，最后重新检查专用连接实际权限及 Context 有效性。缺少登记、末次准入拒绝、持久登记中途变化或回调期间角色提权均拒绝。readiness 同时补齐部署级只读表的 Queue 列级访问检查。

真实 PostgreSQL 场景验证未登记拒绝、登记后成功、第二次准入拒绝、回调期间 BYPASSRLS 提权及登记删除后拒绝；还验证 Queue 获得单列 SELECT 后 readiness 拒绝。当前准入由部署装配并保持其权限 Fence，管理连接与专用迁移连接必须由宿主配置为同一部署。本函数不是迁移执行授权，未解决维护管理员并发改变权限的通用竞争问题，不能替代执行时的权限边界、实际审查/演练/恢复证据及 Migration Runner。业务表 readiness、迁移结果和 Enable 仍需继续实现。

本批相关测试 42 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量 Core。见 [持久迁移预检验证](verification-2026-09-08-migration-registered.json)。


## 2026-09-08：迁移角色参数授权边界

专用迁移连接预检读取 pg_parameter_acl，拒绝显式授予当前角色或 PUBLIC 的 SET/ALTER SYSTEM 权限。该类权限不需要角色继承或超级用户，不能仅依赖 pg_roles 检查。普通会话参数的默认可设置能力保持可用；预检额外要求 session_replication_role=origin、allow_system_table_mods=off，避免授权撤销后复用仍保留危险设置的连接。

真实 PostgreSQL 测试覆盖直接 SET 授权、PUBLIC SET 授权、ALTER SYSTEM 授权拒绝，以及先将 session_replication_role 设置为 replica、再撤销授权后仍拒绝预检；清理会话并撤回授权后恢复通过。测试未执行 ALTER SYSTEM 写配置。该检查不替代宿主新建专用连接、完整会话配置约束与受审查 Migration Runner，任意管理员并发改权的通用竞争问题仍未关闭。

本批相关测试 34 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [迁移参数权限验证](verification-2026-09-08-migration-parameters.json)。


## 2026-09-08：迁移连接与登记数据库的实际绑定

组合迁移预检在读取持久所有权后，使用专用连接持有一次随机 64 位 advisory lock，并要求管理事务从当前数据库的 pg_locks 看到相同后端 PID、锁键、模式和数据库。该检查不依赖相同数据库名、主机字符串或单独的数据库 OID，避免两个独立数据库的登记清单与权限结果被拼接。使用 try-lock，不等待未知锁；成功、拒绝和异常均进入 finally 尝试解锁，解锁失败拒绝预检，宿主须丢弃清理失败的连接。

真实测试覆盖同服务器不同数据库拒绝，以及独立 PostgreSQL 实例使用相同数据库名、角色名和 Schema 且通过静态权限检查后仍被组合预检拒绝。正常和拒绝路径均验证没有残留 advisory lock。该机制绑定当前已固定会话，不等于数据库管理员或恶意数据库服务器的密码学身份认证；当前授权/权限 Fence、执行证据、Migration Runner 与业务表 readiness 仍需继续装配。

本批相关测试 36 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [迁移数据库绑定验证](verification-2026-09-08-migration-database-binding.json)。


## 2026-09-08：迁移 SQL 实际字节读取

readPackMigrationContent 先验证完整迁移计划与所有权声明，再通过 verifyPackContent 校验全部 Artifact/Migration 内容。在被摘要验证的同一次流读取中复制迁移块，校验后直接从私有副本解码，不重新打开来源。返回步骤与 SQL 文本，来源缓冲区或调用方步骤后续修改不会改变结果；任一非迁移 Artifact 校验失败也不返回 SQL。

接受 application/sql、text/sql，单个迁移上限 8 MiB，整个 Pack 捕获路径上限 64 MiB；严格 UTF-8 解码并保留 BOM，拒绝 PostgreSQL text 无法表示的 NUL。继承内容校验器的完整读取期限、取消、块数与大小约束；无迁移仍校验 Pack 后返回空数组，不制造 SQL。该内部读取器不解析 SQL、不执行迁移，也不授予执行权限；正式 Runner 仍需装配当前持久所有权、受信 staging、签名/治理和实际迁移证据。

本批迁移内容/计划测试 13 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，未重复全量。见 [迁移内容验证](verification-2026-09-08-migration-content.json)。


## 2026-09-08：迁移 Buffer 别名修复

迁移流捕获原先使用 chunk.slice()，Node.js Buffer 的 slice 返回共享视图；摘要校验后源缓冲区被修改时，最终解码的 SQL 会不同于已验证字节。先加入回归测试，真实复现已验证 SELECT 1 却返回 SELECT 2 的失败，再改用 new Uint8Array(chunk) 创建普通私有副本。该复制也不调用 TypedArray 子类覆写的 slice；共享内存视图复制后验证副本，后续来源修改不影响返回 SQL。

测试覆盖 Buffer、覆写 slice 返回自身的 Uint8Array 子类及 SharedArrayBuffer 视图。此前文本读取的“私有副本”保证对 Buffer 输入不成立，由本批修复；迁移执行器和完整证据装配仍未完成。

本批相关测试 15 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，未重复全量。保留修复前失败证据。见 [迁移 Buffer 验证](verification-2026-09-08-migration-buffer.json)。


## 2026-09-08：迁移证据正式契约与实际 Artifact 读取

PackMigrationEvidence 加入正式 Contracts，绑定组织、packageDigest、stepDigest、environmentDigest、deploymentVersion、证据种类、Passed/Failed、issuedAt/expiresAt 及非空有界 supportingRefs。证据种类涵盖 Review、DryRun、SafetyPoint、RecoveryPlan、Compatibility、Retirement；闭合对象及期限顺序纳入生成验证器。digestMigrationExecution 绑定 ref/digest/schemas/databaseRole/phase/transactional/operations，排除证据引用，避免证据 Artifact 分配 ID 与报告内容互相依赖。

readMigrationEvidence 在当前 Pack 管理上下文中按完整集合锁住实际 Artifact 行，使用 InlineArtifactOwner 核对 Available、精确版本、用途及实际字节摘要，只接受有界规范 JSON。逐项核对计划引用对应种类、通过状态、组织/包/步骤/环境/部署版本及期限；全部独立验证回调结束后再复核所有报告期限和 Context。调用方必须先持有治理/权限 Fence，不得拿读取后的数组直接当执行授权。

source 与 evidence 为两个必需部署接口，分别验证 Artifact 来源权限，以及独立签发者/签名和真实支撑事实。测试使用实际数据库与 Artifact Owner，但签发者及 supportingRefs 验证回调仍为 Fixture；本批没有伪称已完成独立审查、演练、安全点与恢复事实的 Owner。生产装配、签名配置、证据最大有效期策略、完整 Migration Runner 和 Enable 仍待实现。

本批 Contracts 251 项、数据库迁移证据场景 6 项通过，无失败或跳过；Core/Contracts 类型与构建、48 个生成制品和 11 个 API 报告通过，隔离容器剩余 0。未重复全量 Core。见 [迁移证据验证](verification-2026-09-08-migration-evidence.json)。


## 2026-09-08：迁移证据分类寿命策略

MigrationEvidenceAdmission 现必填六种证据的 maxLifetimeMs，全部为正安全整数。读取前快照部署策略，对每份报告按其种类限制 expiresAt-issuedAt，并在末次验证回调后检查策略未被替换；既有到期检查仍在所有回调后重新执行。支持为 SafetyPoint/DryRun 配置比代码 Review 更短的时效。

契约时间允许微秒，比较采用 BigInt 微秒值，避免 Date.parse 截断使超过最长寿命 1 微秒的报告被接受。真实 Artifact 测试覆盖分类限期、无效配置、回调更换策略、微秒越界及末次回调期间到期。当前策略由部署接口装配；持久策略治理、签名根与支撑事实的生产验证、Migration Runner 仍需继续实现。

本批真实数据库测试 9 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [迁移证据寿命验证](verification-2026-09-08-migration-evidence-lifetime.json)。


## 2026-09-08：整份迁移计划的证据验证

readMigrationPlanEvidence 首先验证 Manifest 摘要、完整声明迁移集合、所有权及阶段顺序，再按全部证据 Ref 集合统一取得 Artifact 行共享锁。后续单步读取不会按相反步骤顺序逐渐获取新证据行锁；证据数量上限 10000，超限拒绝。包摘要直接取已校验 Manifest，环境与部署版本由当前部署装配提供。

全部步骤读取完成后重新核对寿命策略及每份证据的微秒有效期，避免后续步骤回调跨过先前证据期限仍返回成功。真实双步骤测试覆盖完整验证、遗漏迁移拒绝、第一步证据在第二步验证期间到期，以及第一步回调期间管理员更新第二步尚未读取的证据时发生锁超时。共享锁由事务结束释放。

返回结果仍是证据读取结果，不是执行许可。调用方必须使用当前持久所有权、当前环境/部署版本与治理 Fence；独立签发者和支撑事实验证仍需生产装配，Migration Runner、业务表 readiness 与 Enable 尚未完成。

本批真实数据库测试 10 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [整份迁移证据验证](verification-2026-09-08-migration-plan-evidence.json)。


## 2026-09-08：Artifact 授权回调与事实隔离

InlineArtifactOwner.read 原先把实际记录直接交给授权回调，回调修改 mediaType/ownerRef 等会影响返回值；把 Tombstoned 状态改成 Available 还会绕过读取状态检查。真实 PostgreSQL 回归测试先复现两条失败，再将 read/tombstone 授权参数改为独立深拷贝。墓碑化使用原始记录生成新版本，不持久化回调修改的元数据；输入引用提前快照，授权后及读取返回前复核事务/Context。

修复保护迁移证据及其他 Artifact 消费者的底层真实记录语义，不把授权回调当作事实修改接口。测试覆盖元数据替换、墓碑读取恢复尝试及墓碑写入元数据注入，并联合运行迁移证据场景。该修复不代表生产迁移证据签名/支撑事实装配或 Migration Runner 已完成。

本批联合测试 18 项、全量 Core 395 项通过，无失败或跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。保留修复前失败证据。见 [Artifact 授权隔离验证](verification-2026-09-08-artifact-admission.json)。


## 2026-09-08：Staged Pack 恢复与外层事务装配

recoverStagedPackInTransaction 将现有恢复逻辑开放给内部管理事务组合：实际身份/Grant、当前信任策略、原验证报告、磁盘内容与 InstalledPack 绑定保持原有检查，取得的 Fence 与 Pack 治理锁随外层事务保留。recoverStagedPack 独立入口复用该路径，并在等待事务连接前快照引用、Grant 列表、选项及准入函数，避免输入在排队期间被替换。

真实 Cosign/数据库集成测试在恢复返回后、外层事务结束前，从独立维护事务争抢同一 Pack 治理锁，得到 lock_timeout；外层结束后成功获取。原有内容篡改、当前准入、过期与重放场景一并通过。该入口仅返回恢复内容，不构成迁移执行许可；后续内容/证据/权限预检仍需组合并在执行前复核有效期。完整 Migration Runner、生产证据支撑事实与 Enable 尚未实现。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [事务内恢复验证](verification-2026-09-08-staged-transaction.json)。


## 2026-09-08：迁移证据独立 Cosign 签名

新增 verifyMigrationSignature，复用已有离线 Cosign 原始 Blob 验签，签名原文为 JCS ["abh-pack-migration-evidence-v1", completeReport]，完整组织/包/步骤/环境/部署/结论/时间/支撑引用均受保护。部署固定公钥、组织和证据种类，限定最长有效期；验签前后按微秒时间检查期限，取消/超时继承有界子进程机制。输入报告、配置及 Bundle 提前复制。

VerifiedMigrationSignature 由私有 WeakMap 识别，matchMigrationSignature 拒绝同形复制、报告替换和已到期候选，返回证明副本包含原 Bundle、公钥指纹、Bundle 摘要及验证时间。真实 Cosign 使用临时独立密钥测试错误公钥、跨组织/种类、完整字段篡改、短期签名实际到期和输入/输出副本隔离；临时私钥清理，不写入仓库。

本模块完成密码学来源验证，不代表 supportingRefs 的事实已由独立 Owner 验证。签名 Bundle 的持久 Artifact 装配、当前信任根撤回/轮换、迁移证据读取强制签名、Runner 与 Enable 仍需继续实现；不能仅凭签名产生执行权限。

本批真实 Cosign 场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，未重复全量。见 [迁移签名验证](verification-2026-09-08-migration-signature.json)。


## 2026-09-08：持久迁移签名 Bundle 验证

verifyStoredMigrationSignature 通过实际 InlineArtifactOwner 读取 Bundle Ref，要求当前同组织 Pack 管理上下文、Available 精确版本/用途/摘要与 application/json 内容；沿用 Inline 64 KiB 上限。Bundle 行共享锁保持到事务结束，当前来源权限与部署 signer 配置在真实 Cosign 前后复核，末次配置变化、签名到期或 Context 失效拒绝。多报告组合调用前仍须统一锁定完整报告与 Bundle 集合。

真实 PostgreSQL 存储 Cosign Bundle，重新从持久字节验签，不依赖原进程私有候选；测试覆盖来源撤回、公钥轮换、验签期间 signer 配置变化及 Bundle 墓碑化。signer/source 的信任配置仍由部署接口提供，测试使用临时独立密钥和当前权限 Fixture；该模块不验证 supportingRefs 的事实，尚未强制装配至全部迁移证据读取路径。生产信任根 Owner、完整 Runner 和 Enable 继续待实现。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [持久迁移签名验证](verification-2026-09-08-migration-stored-signature.json)。


## 2026-09-08：整份迁移计划强制持久签名入口

readSignedMigrationPlan 将完整计划验证、实际报告 Artifact 读取、持久 Bundle Cosign 验签与支撑事实接口组合。每个精确报告 Ref 必须有且仅有一个 Bundle 映射，缺少/重复/额外映射拒绝；完整报告与 Bundle 集合在读取前统一加行共享锁，总引用上限 10000。每份报告实际验签成功后才调用 supportingFacts，最后复核全部私有签名候选期限、寿命策略与截止时间。

真实测试生成 Review/DryRun/SafetyPoint/RecoveryPlan/Compatibility 五份独立签名并持久存储报告与 Bundle，完整计划成功；缺失签名在读取回调前拒绝，重复映射及用其他种类 Bundle 替换均拒绝，支撑事实接口拒绝不会被有效签名覆盖。生产调用方仍须持有当前信任配置与来源权限 Fence，提供当前持久所有权/环境；测试 supportingFacts 是 Fixture，不宣称已验证实际演练与安全点。

旧 readMigrationPlanEvidence 保留为底层无签名读取组件，新 readSignedMigrationPlan 是要求持久签名的组合入口。尚需在正式 Runner 中强制使用此入口，并实现生产支撑事实 Owner、持久治理和 Enable；返回结果不构成 SQL 执行许可。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [签名迁移计划验证](verification-2026-09-08-signed-migration-plan.json)。


## 2026-09-08：整份签名计划末次来源与签发者复核

readSignedMigrationPlan 在全部 supportingFacts 回调结束后，重新读取已锁定的报告 Artifact、核对实际元数据并重新调用当前来源准入；对每份持久 Bundle 使用当前 signer 公钥再验签，并要求公钥指纹与 Bundle 摘要不变。最后仍逐份复核证明期限、策略及请求截止时间。避免后续支撑事实验证期间撤回前面已验报告的来源或签发者后仍返回成功。

真实 Cosign/数据库测试在 Compatibility 支撑事实回调中分别撤回 Review 签发者、报告来源和 Bundle 来源，全部拒绝。该复核补齐组合路径的阶段边界，不替代部署权限 Fence：回调及数据库管理员任意并发变更仍需由当前治理锁/策略实现隔离。生产支撑事实 Owner、完整 Runner 与 Enable 继续待实现。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [迁移末次准入验证](verification-2026-09-08-migration-final-admission.json)。


## 2026-09-08：持久所有权、实际 SQL 与签名证据准备链

prepareMigrationContent 在一个管理事务内读取持久 Schema 所有权，校验并捕获完整 Pack 的实际 SQL 字节，重新执行当前管理准入并比对所有权，然后验证整份签名计划。全部证据完成后再次读取持久所有权，复核寿命策略、全部报告期限与请求截止时间。返回包摘要、环境/部署版本、SQL 与对应证据，调用方不能用临时所有权声明代替部署登记。

真实 Cosign/数据库测试覆盖未登记拒绝、登记后返回 SELECT 1 及五份签名报告、内容损坏时不进入证据来源回调、内容读取后授权撤回拒绝。此准备函数要求宿主提供当前恢复的已安装 Pack 与环境，尚未自行恢复 InstalledPack 或验证实际迁移数据库角色；结果不是执行许可。下一步仍需与事务内 staging 恢复、数据影响报告和专用角色预检及 Runner 执行记录装配，生产 supportingFacts 与 Enable 仍未完成。

本批真实 Cosign/数据库测试 11 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [迁移准备链验证](verification-2026-09-08-migration-preparation.json)。


## 2026-09-08：目标数据库与迁移准备链装配

prepareDatabaseMigration 在读取 SQL 与签名证据之前，使用已固定的专用登录连接检查实际数据库绑定及持久所有权/权限；准备完成后再读取当前目录与持久所有权复核，最后检查证据有效期、策略与截止时间。空迁移计划拒绝此数据库准备入口，应走数据影响不适用/验证路径。当前授权 Fence 由外层管理事务保持，末次目录检查不新增用户准入回调。

真实 PostgreSQL/Cosign 场景使用独立 hello_migrator 登录连接完成准备；初始 BYPASSRLS 在证据读取前拒绝，supportingFacts 回调期间提权在末次目录检查拒绝。联合运行数据库预检场景，覆盖跨数据库/独立服务器、角色继承、参数权限与系统/外部 Schema 越权。本入口未执行 SQL，也未制造迁移完成记录。

已安装 Pack 恢复与实际数据影响报告仍由宿主装配，生产支撑事实 Owner、正式 Migration Runner、迁移结果/恢复记录与 Enable 尚待实现；准备结果不是执行授权。

本批真实 Cosign/数据库测试 22 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [迁移目标准备验证](verification-2026-09-08-migration-target.json)。


## 2026-09-08：当前数据影响报告事务内装配

readCurrentPackDataImpactInTransaction 提供内部可组合入口，复用实际 Grant/当前治理、部署版本、来源 Artifact、staging 内容、影响重算与持久编译器 Bundle 验签的完整共享路径。独立 readCurrentPackDataImpact 入口提前快照输入并复用事务内入口；事务内读取返回后，Deployment/Pack advisory locks 与来源行共享锁随外层事务保留。

真实 Cosign/数据库场景在读取返回后用独立维护事务争抢 Deployment、Pack 锁和更新目标来源 Artifact，均得到 lock_timeout；外层事务结束后获取部署锁及更新来源成功。原有撤回、内容替换、签名期限和读取准入场景一并验证。后续组合必须在入口前收集所有新增权限 Fence 并遵守锁顺序，不能在聚合/来源锁之后补取更早阶段锁。

这一步提供数据影响与后续迁移准备共享 UoW 的基础，不等于已完成实际迁移、Runner 或 Enable。组合入口仍需绑定 installed Pack、影响报告、准备计划与当前环境，生产 supportingFacts Owner 仍待实现。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [事务内影响报告验证](verification-2026-09-08-impact-transaction.json)。


## 2026-09-08：影响报告与实际安装快照联合恢复

recoverImpactCheckedPack 在当前数据影响准入事务内返回已核验的 installation、impact 及同一次实际磁盘恢复得到的快照文件。checkCurrentImpact 复用原有真实 Grant/治理/部署版本、源 Artifact、影响重算和编译器签名检查，并返回其内部已验证快照；不再要求组合调用方另外拼接包来源。最终核对安装 Ref 与报告 packRef、实际 Manifest packageDigest 与 impact.subjectDigest。

readCurrentPackDataImpactInTransaction 复用联合恢复路径，仅取 impact 副本，独立读取语义保持不变。联合恢复返回的 report/installation 方法均给出副本；真实集成测试读取实际 abc 字节并验证安装、影响报告、包摘要一致，调用方修改副本不影响恢复对象。原有撤回、来源/签名篡改、期限及事务锁测试一并运行。

当前返回的是实际影响事实与恢复内容，Required/Incomplete/NotApplicable 不自行转换成迁移完成或执行权限。下一步仍需与迁移准备和所有权/数据库预检组合，明确拒绝 Incomplete，并实现正式 Runner、生产支撑事实 Owner 与 Enable。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [影响与安装恢复验证](verification-2026-09-08-impact-pack-recovery.json)。


## 2026-09-08：已安装 Pack 准备入口与无 SQL 影响分流

prepareInstalledPack 从当前持久影响报告直接恢复安装、Manifest、实际内容、环境和部署版本，不接受调用方另传这些绑定。仅允许 Staged，Incomplete 明确拒绝；没有 migrations 且报告 NotApplicable 时返回 NotApplicable；没有 SQL 但定义/投影变化导致 Required 时返回 DataVerificationRequired，不制造空 SQL 或把缺少 SQL 误当无数据影响。

有声明迁移时必须提供专用连接、完整计划、签名映射与证据准入，调用目标数据库准备链并在结束后重新验证影响/安装当前性及报告期限。调用方须在进入前取得全部迁移权限 Fence；这仍是内部准备接口，结果不等于执行许可。当前组合分支尚需有迁移 TrustedCode Pack 的完整 staging→impact→准备集成验收，以及最终执行前统一权限/签名复核。

真实 Cosign/数据库测试覆盖已安装无变化返回 NotApplicable、不完整编译器签名报告拒绝、投影变更但无 SQL 返回 DataVerificationRequired、来源撤回拒绝。报告均通过实际编译器签名、Artifact 内容及影响重算；没有通过 Fixture 状态直接跳过当前报告验证。生产 supportingFacts、Migration Runner、结果验证和 Enable 仍未完成。

本批真实 Cosign/数据库联合场景 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离容器剩余 0。未重复全量。见 [已安装准备入口验证](verification-2026-09-08-installed-preparation.json)。


## 2026-09-08：TrustedCode 已安装迁移准备集成与末次权限复核

新增真实发行夹具，将包含 SQL 的 TrustedCode Pack 经独立 release、SLSA builder、CTK 签名、持久治理策略、实际管理 Grant、validation 和 durable staging 安装，再写入实际来源 Artifact 与编译器签名影响报告，调用 prepareInstalledPack。入口返回 MigrationPrepared，SQL 字节为实际已安装内容，并复用五类持久签名迁移证据及专用 hello_migrator 连接。覆盖 durable SQL 替换、Grant 撤销、末次影响准入期间角色提权和有效期策略变更拒绝。

回归测试证明旧组合入口会漏过末次影响准入回调期间的 BYPASSRLS 提权。修复后，在该回调链完成后再次核验真实数据库绑定、持久 Schema 所有权和专用角色权限；以入口快照比较证据有效期策略，拒绝过程中修改策略。最后再检查证据期限、截止时间和事务活性。没有增加自研 SQL 安全解析器。

治理发布使用显式 Fixture 管理员准入回调；治理持久化、发行/编译器/迁移密码学验证、管理 Grant 和 staging 路径均为真实实现。来源、签名者配置及 supportingFacts 的生产治理仍待装配；本次末次数据库复核不代表所有外部准入事实均已固定，也不能防止其后的并发维护权限变更。迁移结果仍仅是准备信息，尚未执行 SQL；Runner、执行前统一授权/签名复核、持久执行与恢复记录、业务表 readiness 登记、结果验证及 Enable 仍未完成。

本批定向真实数据库/Cosign 联合测试 2 项、Core 全量 396 项通过，均无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。包含修复前失败日志。见 [TrustedCode 已安装迁移验证](verification-2026-09-08-installed-migration-e2e.json)。


## 2026-09-08：迁移执行前持久领取与独立观察日志

新增 PackMigrationAttemptRecord / PackMigrationObservationRecord 契约及 maintenance-only 的 migration_packages、migration_attempts、migration_observations 表。物理迁移按数据库全局 Pack ID/version/migration ref 去重；同 ID/version 的 packageDigest 永久固定，并由唯一键和组合外键约束。领取完整计划时重验 Manifest/计划与持久 Schema 所有权，事务一次提交全部领取记录；记录绑定组织、环境、部署版本、影响报告、步骤摘要和证据引用。

claimPackMigrationAttempt 返回 created=false 的重复领取不能触发 SQL，即便观察日志为空。响应丢失或进程退出之后必须从实际数据库状态恢复，不能根据日志缺失推断没有执行。recordPackMigrationObservation 追加 CommitAcknowledged 或 OutcomeUnknown，保留首次领取和原有观察；观察的相同身份与证据可重放，不同证据拒绝覆盖。此日志不提供 Verified/Enabled 状态，也不会把提交回执转换成结果验证。

三张表属于 Core，仅维护连接可操作；运行时、Queue 和跨组织 verifier 均无读取或写入权限，避免全局日志暴露其他组织证据引用。readiness 检查表/列权限、主键、去重键和外键。低层维护调用记录的是调用方提供的事实，尚不承担当前治理/Grant、来源 Artifact、签名或恢复事实准入；已有真实安装准备夹具将其实际绑定写入日志并验证领取重放。维护连接不是业务 Pack SQL 执行连接。

正式 Runner 仍需把持久领取、执行前统一准入、专用角色事务执行、超时/取消及提交不确定性、实际结果验证和恢复流程装配。此批未执行 Pack SQL，未生成迁移验证通过或 Enable，非事务迁移恢复和业务表 readiness 登记仍待完成。

本批 Core 全量 403 项、Contracts 252 项通过，无跳过；随后追加整批领取回滚场景和新连接重放断言，定向 8 项及 Core 类型检查通过。Core/Contracts 构建、类型、生成一致性和 11 个 API 报告通过，隔离测试容器剩余 0。见 [迁移持久日志验证](verification-2026-09-08-migration-journal.json)。


## 2026-09-08：迁移恢复日志一致性读取

readPackMigrationJournal 使用维护连接的 REPEATABLE READ / READ ONLY 事务读取原始领取、全局版本摘要登记及全部执行观察。入口固定 attemptRef 类型和版本；校验领取记录与数据库键、步骤执行摘要、版本摘要，以及观察的主键、类型和父领取绑定。观察最多两类，重复类型或超量记录拒绝。追加观察的重放也复用同一绑定校验。

空观察仅表示没有已记录的观察，不能证明 SQL 未执行；CommitAcknowledged 也不等于结果验证通过。接口不产生重试、执行或 Enable 权限。返回数据是独立读取结果，调用方修改副本不会改变持久历史。运行时和 Queue 仍无全局日志访问权限。

真实 PostgreSQL 测试覆盖无观察领取、两种观察完整读取、副本修改隔离、错误版本/不存在引用、运行时拒绝、步骤摘要篡改及观察父引用/身份/类型替换。并发测试用维护表锁确认读取已等待，再提交观察更新：当前调用返回旧快照，下一调用读取新值。记录读取一致性不代替目标数据库状态、实际 Artifact/签名、当前治理权限和恢复事实验证；正式 SQL Runner、非事务恢复、结果验证、业务表 readiness 登记和 Enable 仍待实现。

本批真实数据库日志测试 11 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移恢复读取验证](verification-2026-09-08-migration-recovery-read.json)。


## 2026-09-08：一次性领取与专用角色事务执行原语

claimPackMigrationAttempt 在数据库确认领取事务提交后，为本进程返回的新领取对象保存私有一次性出处；复制、修改、重复使用或从持久日志恢复的对象均不能通过 consumeNewMigrationClaim。此出处仅证明新领取，不能替代当前治理或执行授权。

executeNewMigrationClaim 提供内部事务执行原语：要求独占、全新的专用角色连接和销毁连接的宿主 disposer；绑定组织、Pack 身份/摘要及完整计划中的确切步骤，只接受 transactional 步骤。宿主 prepare 提供当前已准入 SQL，原语重算实际字符串字节摘要，再以持久所有权和实际数据库绑定预检。BEGIN 后执行 SQL，调用实际结果/当前权限检查，再次核验角色权限和同一事务 ID，最后接收 COMMIT 回执。没有引入自研 SQL 安全解析器。

所有失败保守返回 OutcomeUnknown；CommitAcknowledged 只表示客户端收到了提交回执，不是迁移验证通过。专用连接在成功、错误、超时或取消后均销毁；disposer 失败或不响应由 connectionClosed=false 明确表达，宿主必须处理残留连接，不能重发 SQL。超时使后续执行器查询失效，并向准入回调传递 AbortSignal；宿主回调须遵守该生命周期。SQL 若自行提前 COMMIT，事务 ID 检查会拒绝正常回执，但不能撤销它已经提交的效果，因此必须走实际状态恢复。

真实 PostgreSQL 测试执行自有 Schema 的建表和写入，核验结果后提交；验证复制/修改/重复领取与持久重放不能执行，错误字节与非事务步骤不执行，越权 Core DDL、结果拒绝及末次角色提权导致未提交 DDL 回滚，超时销毁连接且迟到准备回调不执行 SQL。网络代理截断真实 PostgreSQL COMMIT CommandComplete 消息，确认数据已经持久化而调用方只收到 OutcomeUnknown；观察日志仍为空且不能再次执行。该测试同时发现并修复在已断开的 reserved 连接补发 ROLLBACK 引发驱动异步异常的问题；改为销毁独占连接清理未提交事务。

此原语尚未作为生产安装 Command 装配，测试中的当前 prepare/beforeCommit 准入是显式 Fixture；真实角色、内容摘要、持久领取、SQL 事务和网络故障均已执行。完整已签名安装准入、结果 Artifact/观察持久化、跨步骤验证与恢复、非事务 Runner、业务表 readiness、最终迁移验证和 Enable 仍待完成。不能将此批执行测试声明为完整 Pack 安装生命周期验收。

本批定向真实数据库/网络故障与日志测试 21 项通过；最终代码 Core 全量 417 项通过，无跳过。Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。保留了断线清理修复前失败日志。见 [迁移事务执行验证](verification-2026-09-08-migration-execute.json)。


## 2026-09-08：已安装迁移执行装配与早期失败清理

executeInstalledMigrationClaim 将真实 prepareInstalledPack 接到一次性执行器，执行前和提交前均恢复当前已安装内容、验证影响报告与持久迁移签名；绑定领取记录的环境、部署版本、确切步骤及报告/Bundle 引用集合。执行器从同一次准入结果取得 Manifest、计划和 SQL，不再接受独立拼接的 Manifest/SQL。宿主实际结果检查先于提交前重新准入，固定原有准入函数并比较有效期策略；目标连接上的迟到查询受取消/期限约束。

修复执行器在进入清理作用域前序列化 Manifest/计划的问题：BigInt 或循环数据曾直接抛错，跳过独占连接销毁。输入捕获移到一次性领取消费之后、受控执行作用域内，失败返回 OutcomeUnknown、sqlStarted=false 并销毁连接；保留修复前回归失败证据。

真实集成夹具使用独立发行、SLSA、CTK、编译器与迁移签名，完成 staging、影响报告和持久领取；以新 hello_migrator 连接执行实际已安装 SELECT 1，检查真实会话角色后再次执行安装准入并收到 COMMIT 回执。持久领取重放没有执行 SQL。其他执行测试覆盖实际 DDL、权限拒绝回滚、超时、提前 COMMIT 和真实提交回执丢失。

本入口仍是内部装配，需宿主事先持有全部迁移权限 Fence。来源/签名配置及 supportingFacts 生产 Owner、实际结果验证器仍待完整实现；准备链的外部准入回调不保证所有外部事实原子固定。尚未自动存储执行结果 Artifact/观察，也未完成跨步骤验证、非事务恢复、业务表 readiness 和 Enable。SELECT 1 集成不能替代完整业务迁移验收；不把提交回执当成结果验证。

本批真实数据库/Cosign/网络故障联合测试 23 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [已安装迁移执行验证](verification-2026-09-08-installed-migration-execute.json)。


## 2026-09-08：真实执行结果 Artifact 与观察持久化

执行器为已消费真实领取的返回对象保存内部私有出处，绑定原领取、原始执行结果、观察时间和稳定 Command ID。persistMigrationExecutionResult 仅接受该原始对象，复制、修改或未消费领取的返回对象拒绝；在新管理事务中保存规范 JSON 的原始执行结果 Artifact，并在维护连接上追加同类观察。内容使用 abh-pack-migration-execution-v1 域标记，绑定完整领取、sqlStarted、connectionClosed 和 CommitAcknowledged/OutcomeUnknown，不包含 SQL 文本、凭据或驱动错误。

持久化前核对实际领取历史和组织；Artifact Owner 经独立证据捕获准入、引用准入与读取准入，Command 幂等重放验证实际内容后再写观察。Artifact 与观察属于两个事务，故障中间窗口可能仅留下 Artifact；同进程、同 Actor/输入重试复用稳定 Command 和实际 Artifact，不调用执行器。已撤销执行权限不自动取消历史证据责任，生产捕获身份/准入仍由宿主治理。

真实签名安装夹具注入观察 INSERT 失败，确认 Artifact 已提交；恢复后多次持久化返回相同 Artifact/观察且 Artifact 数保持 1。实际网络 COMMIT 回执丢失场景将 OutcomeUnknown 保存为观察，确认数据库数据已提交却不会被改写为 CommitAcknowledged，篡改返回值及拒绝捕获准入均无法写观察。重试持久化不重发 SQL。

当前保存的是未签名原始执行观察，不是迁移结果验证或 Enable 凭证。私有出处和稳定 Command 仅存于进程内；崩溃后仍需实际数据库状态及已持久 Artifact 的独立恢复入口，不能通过制造返回对象恢复写入。跨 Actor 捕获重试、自动 Runner 调度/结果落盘责任、正式结果 Schema 与签名、业务表 readiness、跨步骤/非事务恢复和 Enable 仍待完成。两个数据库事务不能被宣传为与专用 SQL 提交原子一致。

本批真实数据库/Cosign/网络故障联合测试 23 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移执行结果持久化验证](verification-2026-09-08-migration-result.json)。


## 2026-09-08：持久执行结果 Artifact 恢复读取

readStoredMigrationExecutionResult 在管理事务中固定领取与 Artifact 引用、锁定实际来源行，读取 Available Artifact 原始字节并通过当前来源准入。校验规范 JSON、域标记、封闭结果字段、时间、完整领取绑定、Artifact owner 和来源集合。CommitAcknowledged 必须伴随 sqlStarted=true，不接受 Verified/重试授权字段。读取只返回原始历史观察，不生成私有执行结果出处或执行权限。

真实已签名安装/执行/持久化夹具完成读取，覆盖来源拒绝、领取版本绑定变化、返回副本修改，以及恢复结果不能重新送入依赖进程内出处的持久化入口。篡改场景同时重算 Artifact 摘要和字节长度，验证结果域、类型、字段、时间、环境绑定及非规范 JSON 仍被拒绝，避免仅靠内容摘要测试掩盖解析缺口。

本入口要求宿主从维护日志提供实际领取，校验记录内容与归属，不证明其真实性或当前目标数据库状态；没有自动补写观察，也未签署结果验证。进程重启后的实际状态核验、独立恢复授权、正式结果 Schema/签名、跨步骤与非事务恢复及 Enable 仍待完成。

本批真实数据库/Cosign 聚合集成测试 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [持久迁移结果读取验证](verification-2026-09-08-migration-result-read.json)。


## 2026-09-08：从已保存 Artifact 恢复缺失观察

recoverMigrationObservation 接受持久领取 Ref 和实际结果 Artifact Ref，读取维护日志中的领取，通过独立恢复授权和来源/捕获者准入，在管理事务中锁定来源并读取原始结果。随后锁定维护领取行，对比当前领取与之前读取的完整记录，补写或重放同类观察。维护写入完成前来源行共享锁一直由外层事务保留；读取过程中的领取变化会拒绝写入。没有传入或制造进程内执行结果对象，也没有 SQL 执行入口。

recordPackMigrationObservation 新增锁内准入回调，插入与重放都会调用，传入隔离的领取副本。恢复补写的是原始历史观察，CommitAcknowledged 不等于实际迁移验证完成；来源准入必须独立证明捕获者/来源权限，不能仅凭 JSON 结构认定可信。

真实签名安装夹具先注入观察写入失败，让结果 Artifact 单独提交；再仅凭持久引用恢复观察，多次恢复和原持久化重试返回同一观察。覆盖恢复权限拒绝、捕获来源拒绝，以及来源回调期间实际领取记录变化导致 VERSION_CONFLICT。此测试模拟进程内出处不参与恢复，并非杀死进程的整机恢复验收。

维护观察提交与外层管理事务并非一个原子提交；若管理事务随后失败，观察可能已存在，再次恢复必须重新准入后幂等读取，不可重跑迁移。实际目标状态核验、正式捕获治理 Owner、结果签名、自动 Runner 恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。

本批真实数据库/Cosign 联合测试 12 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [缺失迁移观察恢复验证](verification-2026-09-08-migration-observation-recovery.json)。


## 2026-09-08：迁移执行结果正式契约

Contracts 新增 PackMigrationExecutionResult 与 PackMigrationExecutionRecord，统一实际执行结果、完整领取和观察时间的封闭结构。CommitAcknowledged 必须包含 sqlStarted=true；OutcomeUnknown 允许执行尚未开始或连接未关闭。连接清理失败与提交回执分开表达，不凭 connectionClosed 推断执行结果。契约不提供 Verified、RetryAllowed 或 Enable 状态。

观察时间不得早于领取，跨字段比较保留微秒精度；嵌套结果和步骤同样经过关系校验，不能通过外层结果绕过迁移阶段约束。Core 结果类型复用生成类型，持久化和恢复读取使用同一契约校验，替换内部手写字段检查。既有 abh-pack-migration-execution-v1 JSON 域标记与内容格式保持兼容；来源锁、摘要、owner/来源集合和实际领取绑定继续校验，恢复读取也按微秒精度拒绝未来观察时间。

本批为原始执行结果统一格式，不增加结果真实性、来源签名或启用权限。结果签名、实际目标数据库验证、生产捕获治理、自动恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。

本批 Contracts 253 项、Core 真实数据库/Cosign 联合测试 23 项通过，无跳过；两包类型、构建、生成一致性和 11 个 API 报告通过，隔离测试容器剩余 0。未重复 Core 全量。见 [迁移结果契约验证](verification-2026-09-08-migration-result-contract.json)。


## 2026-09-08：迁移执行结果独立 Cosign 验签

verifyMigrationResultSignature 对正式 PackMigrationExecutionRecord 使用 abh-pack-migration-execution-v1 JCS 域标记验签，与现有原始 Artifact 内容一致。签名者必须由部署方独立配置，绑定组织和 Pack ID，限制最大历史年龄；时间判断保留微秒精度，拒绝未来结果。验签前固定记录、配置和 Bundle 字节，复用 Cosign；验证后再次检查年龄与截止时间。

已验证结果使用私有 WeakMap 保存出处，matchMigrationResultSignature 核对完整记录并重新检查原始年龄策略。返回记录和证明均为副本，复制候选对象不能伪造出处。签名证明完整领取、SQL 开始状态、连接清理状态与提交回执/未知结果未被替换，不把原始结果变成 Verified/Enable 或恢复权限。

真实已签名安装/执行/持久化夹具新增独立 capture 密钥，为实际结果生成 Bundle 并验签；覆盖替换结果、错误组织/Pack、公钥不匹配、超龄拒绝和候选/证明副本隔离。生产签名者治理、持久 Bundle 来源锁与当前配置复核尚未接入恢复入口；实际目标数据库结果验证、自动恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。

本批真实数据库/Cosign 聚合集成测试 1 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移结果验签验证](verification-2026-09-08-migration-result-signature.json)。


## 2026-09-08：持久结果 Bundle 验签与签名恢复入口

readSignedMigrationExecutionResult 在同一管理事务先按统一顺序锁定结果和 Bundle Artifact，再读取实际结果内容与签名字节。Bundle 必须属于同一领取、引用确切结果 Artifact，媒体类型为有界 JSON。以当前捕获签名者配置完成真实 Cosign 验签后，再次核对两类来源准入、签名配置及结果年龄/截止时间，返回私有已验证签名证明。

recoverSignedMigrationObservation 组合恢复授权、完整来源锁集合和强制持久签名认证；观察补写与重放均经过认证。底层 recoverMigrationObservation 的可选认证钩子在实际结果读取后、维护观察写入前调用；原低层无签名入口保留，不能视为生产签名恢复入口。宿主仍须事先保留恢复和捕获治理 Fence。

真实签名安装夹具将独立捕获 Bundle 存入实际 Artifact，覆盖联合读取、密钥策略在验签期间变化、结果/Bundle 来源末次撤回、Bundle 原始字节损坏，以及已存在观察的签名恢复重放和恢复授权拒绝。签名入口的缺失观察插入复用既有经过故障测试的底层写入路径，本批未额外进行进程崩溃重启验收。

签名认证证明原始观察来源，不证明实际目标状态、业务数据正确性或 Enable；生产捕获者治理 Owner、自动恢复调度、实际结果验证、跨步骤/非事务恢复、业务表 readiness 与 Enable 仍待完成。不能用已有 CommitAcknowledged 或签名回执跳过结果验证。

本批真实数据库/Cosign/网络故障联合测试 23 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [持久迁移结果验签验证](verification-2026-09-08-migration-result-stored-signature.json)。


## 2026-09-08：恢复观察写入末次准入与验签时序

修复 recordPackMigrationObservation 仅在观察读写前检查准入的问题。现在插入完成后、重放返回前再次调用锁内准入；最终拒绝会回滚维护事务中新插入的观察，既有观察保持不变。恢复入口将认证移到取得维护领取锁后，并在最终检查再次执行，避免锁等待消耗签名年龄或期间配置撤回后仍使用旧验证。

真实 PostgreSQL 回归先证明旧实现缺少预期拒绝，修复后验证首次插入末次准入失败不留下观察、重放末次准入失败不能成功返回。签名安装夹具在观察查找后的再次认证撤回 capture key，签名恢复拒绝。每次认证复用持久结果/Bundle 来源锁、当前准入与实际 Cosign 验证，原有缺失观察恢复、来源拒绝、内容篡改等场景一并通过。

末次校验之后数据库提交仍可能发生连接失败或不可控管理员修改；这不是跨连接原子授权协议。治理 Fence、生产来源/捕获身份、实际目标结果验证、完整恢复调度、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。

本批真实数据库/Cosign 联合测试 13 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。包含修复前失败日志，未重复全量。见 [恢复末次准入验证](verification-2026-09-08-migration-recovery-final.json)。


## 2026-09-08：迁移连接会话边界检查

修复执行器接收已开启事务的专用连接时，BEGIN 仅给出警告并沿用原事务、最终 COMMIT 将原写入一并提交的问题。一次性领取消费后、任何宿主 prepare 回调之前，执行 PostgreSQL 原生 DISCARD ALL：打开或失败的事务会被 PostgreSQL 拒绝，执行器返回 OutcomeUnknown/sqlStarted=false 并销毁独占连接；空闲会话则清理历史会话设置。此操作使用简单协议，不新增 SQL 安全解析器。

真实 PostgreSQL 回归先证明旧执行器对已有事务返回 CommitAcknowledged；修复后既有写入与迁移 DDL 均不存在，prepare 未调用。追加验证未分配写事务的只读事务、失败事务也在准备前拒绝；空闲连接的 default_transaction_read_only 设置被清理，随后受准入迁移正常执行。真实签名安装、提交回执丢失和原事务执行场景继续验证。

宿主仍必须提供专用、独占的新连接；DISCARD ALL 不是允许共享连接池复用的承诺，不能同步驱动已有 prepared-statement 缓存，也不能阻止宿主回调违规新开事务。原始领取失败后不允许重试 SQL。实际结果验证、生产治理、跨步骤/非事务恢复、业务表 readiness 和 Enable 仍待完成。

本批初始定向测试 13 项通过；追加会话场景后的 Core 全量 422 项中 421 项通过，1 项因 Testcontainers 端口绑定超时未进入 Artifact 业务测试，该测试文件单独重跑 8 项全部通过。两份原始结果均保留，不声明全量一次通过。Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。见 [迁移会话边界验证](verification-2026-09-08-migration-session.json)。


## 2026-09-08：实际迁移表结构检查

verifyMigrationTables 在专用角色的只读 REPEATABLE READ 事务中读取 PostgreSQL 16 实际目录，比较明确列出的普通/分区表：存在性、表 Owner、RLS/Force RLS、列顺序/类型/类型修饰/非空/identity/generated/default，以及约束定义/验证/延迟属性。返回实际形状、逐字段差异及预期摘要；不存在表和要求不存在的表均显式处理，视图等其他 relation 类型不冒充表通过。

期待值为封闭、有界结构，最多 100 个表、每表 1600 列与 1000 约束、总预期 1 MiB；重复表/列/约束、未知字段拒绝。所有名称作为参数查询目录，不执行预期表达式；pg_get_expr/pg_get_constraintdef 使用固定 pg_catalog search_path。要求直接登录的 Pack 角色、实际 Schema Owner 以及只读重复读事务，防止把多个读时点的结构拼接成结果。

真实 PostgreSQL 测试创建并修改自有表，覆盖完整预期匹配、列/默认值/额外列/未验证约束/Force RLS 差异、存在性、视图拒绝、错误角色/事务模式/Schema Owner、重复和未知字段及取消。预期由测试手写，并非复制当前目录后与自身比较。

这是结构结果检查原语，不是完整迁移验证：未检查业务数据、索引、策略正文、触发器、分区边界或整个 Schema 的额外表。宿主仍需绑定实际目标数据库、读取持久所有权、验证预期来源/签名与当前治理、控制事务取消/连接销毁；该原语不负责打开或关闭连接。正式结果契约/签名装配、数据验证、业务表 readiness 登记、跨步骤/非事务恢复与 Enable 仍待完成。

本批实际 PostgreSQL 结构检查测试 6 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移表结构验证](verification-2026-09-08-migration-tables.json)。


## 2026-09-08：实际索引与 RLS 策略正文检查

迁移表结构预期新增必填 indexes 和 policies 数组，空数组表示明确预期无对应对象。读取 pg_index 的规范索引定义及 valid/ready/live/unique/primary/replicaIdentity 状态，读取 pg_policy 的命令、宽松/限制模式、角色集合、USING 与 WITH CHECK 正文；继续在同一只读重复读事务中检查。角色按名称输出，PUBLIC 显式表示，不以易变 OID 做跨环境比较。

预期结构封闭、有数量上限且拒绝同名重复索引/策略与重复角色，实际目录超量或角色不能解析时拒绝。表达式只由 PostgreSQL 反编译后比较，不执行预期提供的表达式，也不自研 SQL 安全解析器。

真实测试确认 RLS/Force RLS 不变时，策略改成 PUBLIC USING(true)、SELECT 改 UPDATE、限制模式及 WITH CHECK 变化均可识别。手写表达式/部分索引预期与真实索引匹配；同名索引由 lower(label)/id>0 替换为 upper(label)/id>1 后仍报告 indexes 差异。维护连接注入 invalid 索引状态的夹具也被检测，随后恢复状态。

这一步检查索引定义/状态及策略文本，不证明索引物理一致性、策略实际租户隔离行为、角色继承或表达式依赖函数安全。业务数据、触发器、分区边界、Schema 完整清单、当前签名预期治理、结果契约持久化及 Enable 仍待完成。

本批实际 PostgreSQL 结构检查测试 8 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移索引与策略验证](verification-2026-09-08-migration-index-policy.json)。


## 2026-09-08：迁移后触发器与直接函数摘要检查

表结构预期新增必填 triggers 数组，读取非内部触发器的定义、启用模式和直接函数摘要。摘要覆盖函数 Schema/name/参数、语言、Owner、SECURITY DEFINER、leakproof/strict、volatility/parallel、配置、正文与二进制引用；使用规范 JSON 与 SHA-256，避免仅按函数名匹配而漏过 CREATE OR REPLACE。预期封闭且最多 1000 个触发器，拒绝重复名称、未知字段与非法摘要/启用模式。

真实 PostgreSQL 测试以手写函数元数据计算预期摘要，验证初始触发器匹配；禁用触发器、同名函数正文替换、SECURITY DEFINER 变化均报告 triggers 差异，恢复后匹配。既有列、约束、索引与策略检查一并通过。

当前只覆盖非内部触发器和直接函数属性/正文；不递归校验依赖函数、外部二进制内容、执行权限或实际触发行为，内部约束触发器仍通过约束层检查其声明，未单独验证内部实现。业务数据、分区边界、完整 Schema 清单、正式结果契约/签名装配、业务表 readiness 和 Enable 仍待完成。

本批实际 PostgreSQL 结构检查测试 9 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移触发器验证](verification-2026-09-08-migration-triggers.json)。


## 2026-09-08：实际分区键、父表与边界检查

表结构预期新增 partition，包含分区键、分区边界和按继承顺序排列的父表 Schema/name/detachPending。普通独立表显式使用 null 键、null 边界及空父表；分区父表和叶表各自读取 PostgreSQL 的 pg_get_partkeydef、relpartbound 和 pg_inherits。在同一只读重复读事务中比较，避免只看 relkind 或列定义而漏过挂接关系变化。

真实 PostgreSQL 测试使用手写 RANGE 父表和叶表预期，覆盖范围变更、迁移到另一父表、解除挂接、错误预期分区键、DEFAULT 分区和 LIST 分区边界。新增预期字段封闭，父表最多 100 个且不允许重复身份。未把 OID 纳入跨环境预期。

当前比较明确列出的对象，不自动验证父表的所有子分区清单，也未验证并发 DETACH 的完整运行流程、分区内实际数据路由或整个 Schema 完整性。业务数据、结构预期治理/签名、正式结果契约持久化、业务表 readiness、完整迁移恢复与 Enable 仍待完成。

本批实际 PostgreSQL 结构检查测试 10 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移分区验证](verification-2026-09-08-migration-partitions.json)。


## 2026-09-08：受检 Schema 关系清单完整性比对

verifyMigrationInventory 对显式选择的自有 Schema 比较完整表类对象清单，覆盖普通表、分区父表/叶表、视图、物化视图、外部表和序列，输出实际清单、缺失、额外及类型变化。清单允许为空以表达预期空 Schema；Schema 必须实际存在并由专用登录角色拥有。要求 PostgreSQL 16 的只读 REPEATABLE READ 事务，可与详细结构检查使用同一事务快照。

预期最多 100 个 Schema、每 Schema 10000 对象、总 1 MiB；拒绝重复 Schema/关系名称、未知字段和非法类型。名称仅用于参数化目录查询。真实测试覆盖手写单表清单匹配、额外表/序列/视图、缺失对象、同名类型不符、空清单不匹配、越权 Schema 与重复预期拒绝，清理额外对象后重新匹配。

清单仅覆盖所选 Schema 的指定 relation 类型，不检查函数、类型、ACL、序列参数或对象内部定义；索引/TOAST 不在此清单内。宿主必须组合详细结构、当前持久所有权、实际数据库绑定及签名预期治理。业务数据验证、正式结果契约持久化、业务表 readiness、完整恢复与 Enable 仍待完成。

本批实际 PostgreSQL 结构与清单测试 11 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移清单验证](verification-2026-09-08-migration-inventory.json)。


## 2026-09-08：清单与详细表结构联合检查

verifyMigrationStructure 固定整个预期与所有权输入，要求清单中每张普通/分区表均有且仅有一个详细结构预期，类型必须一致；明确不存在的表不能同时出现在清单，详细检查不能越出选定 Schema。组合复用同一只读 REPEATABLE READ 事务中的清单与表结构检查，返回联合预期摘要和两类实际结果。

matched 仅表示当前结构检查范围匹配，不等于完整迁移验证。序列、视图、物化视图及外部表等目前只做清单比对的对象明确返回 requiresAdditionalVerification，后续不能忽略这一范围。空详细表集合仅在预期清单没有普通/分区表时允许，实际多出的表仍会产生清单差异。

真实 PostgreSQL 测试验证手写清单/表预期联合通过；遗漏、重复、存在性矛盾拒绝；声明序列会列入待验证范围，未声明序列导致联合不匹配；实际默认值变化使联合匹配失败。既有结构、索引、策略、触发器、分区和清单场景一并运行。

宿主仍需绑定实际数据库、当前持久所有权、预期来源/签名和连接生命周期。正式结构契约与结果持久化、剩余对象详细验证、业务数据、readiness 登记、跨步骤/非事务恢复与 Enable 仍待完成。

本批实际 PostgreSQL 结构与清单联合测试 12 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。未重复全量。见 [迁移结构联合验证](verification-2026-09-08-migration-structure.json)。


## 2026-09-08：序列详细结构核验

新增 verifyMigrationSequences，读取 PostgreSQL 16 的 pg_sequence 与 pg_depend，比较序列所有者、整数类型、起始值、步长、上下界、缓存、循环以及所属表列；区分普通 OWNED BY（a）与 identity 内部依赖（i）。整数元数据统一为精确十进制字符串，避免 bigint 上界被 JavaScript Number 舍入。不读取运行计数作为结构证据，不调用 nextval 或 setval。

统一 verifyMigrationStructure 现在强制要求清单中的每个 S 对象具备唯一详细预期，sequences 为必填数组；缺失、重复或与清单矛盾会拒绝。序列结果参与联合 matched；视图、物化视图和外部表仍返回 requiresAdditionalVerification。此项替代上一批“序列只有清单检查”的限制。

真实 PostgreSQL 结构测试 13 项通过，无跳过，覆盖生成参数漂移、OWNED BY NONE、identity 绑定、bigint 精度、存在性、错误对象类型、权限、取消及检查不推进序列计数。Core 类型、构建、API 检查与文档链接检查通过，隔离测试容器剩余 0。未重复全量 Core。

这仍是内部结构检查：实际数据库绑定、当前持久所有权、预期来源与签名、正式结构契约与结果持久化、业务数据验证、readiness、恢复和 Enable 装配尚未完成。完整 ABH V1 仍有其他模块缺口。验证记录：[序列结构验证](verification-2026-09-08-migration-sequences.json)。


## 2026-09-08：结构核验接入持久所有权与实际数据库绑定

新增内部 verifyRegisteredMigrationStructure：读取全局持久 Schema 所有权，复用随机 advisory lock 跨连接证明管理事务与目标角色连接确实指向同一数据库，再执行统一结构检查。结构清单必须精确覆盖完整迁移计划声明的 Schema，不能遗漏变更范围。检查前后均重新执行准入与数据库预检，比较持久登记是否变化。

准入接收固定的组织、Pack ID/版本、packageDigest、完整计划摘要与结构预期摘要；每次传递冻结副本，调用方异步修改原始预期不能替换核验内容。结果带同一 binding。宿主仍负责根据已安装制品、实际签名及部署状态认证该 binding，并持续持有治理 fences；这里没有用回调接口冒充已完成签名装配。调用方仍管理目标只读 REPEATABLE READ 事务和连接生命周期，未提供数据验证、正式报告持久化、readiness 或 Enable。

本批真实 PostgreSQL 数据库预检及结构测试 35 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档链接检查通过，隔离测试容器剩余 0。未重复全量 Core。验证记录：[持久登记结构核验](verification-2026-09-08-migration-registered-structure.json)。


## 2026-09-08：结构预期签名与实际目标核验

新增 verifyStructureSignature，以独立部署公钥执行真实 Offline Cosign 验证。签名域为 abh-pack-migration-structure-expectation-v1，覆盖组织、Pack ID/版本、packageDigest、完整迁移计划摘要、结构预期摘要、环境摘要、部署版本及有效期；有效期使用微秒精度比较。验证凭证使用私有对象身份保存，复制对象不能冒充已验证凭证，返回内容为独立副本。

verifySignedMigrationStructure 将签名与持久登记/实际数据库结构核验组合。每次治理准入前后匹配签名所绑定的结构摘要，并重新读取当前环境与签名者配置；密钥或策略轮换、来源撤回、检查期间过期不能继续得到通过结果。签名有效但数据库有未声明对象时，仍返回结构不匹配。

报告暂为内部类型，尚未进入正式 Contracts；报告/Bundle 的实际持久制品读取、已安装包与当前来源认证仍由宿主提供，不能视为这些装配已完成。签名只证明结构预期来源，业务正确性、数据验证、结果持久化、readiness、恢复与 Enable 仍待实现。

真实 Cosign 与 PostgreSQL 联合测试 39 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档链接检查通过，隔离测试容器剩余 0。未重复全量 Core。验证记录：[结构预期签名验证](verification-2026-09-08-migration-structure-signature.json)。


## 2026-09-08：持久结构预期报告与 Bundle 读取

readSignedStructureExpectation 在管理事务内同时锁定报告和 Bundle 来源，读取 InlineArtifactOwner 的实际字节。验证双方所有者、媒体类型和大小，Bundle 必须引用该报告；报告必须为规范 JSON 签名域封装，且完整 binding 与目标组织/包/计划/结构摘要一致。随后执行真实 Cosign 验证，并在返回前刷新两个来源准入与签名者配置、重新检查有效期。原始 options 与管理事务的取消信号共同控制验签。

真实 PostgreSQL Artifact Store Command 写入报告和 Bundle 后可成功读取；缺少引用、所有者版本不符、非规范 JSON、报告替换、密钥策略轮换及后期来源撤回均拒绝。本批签名与持久读取测试 5 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0。未重复全量。

这里只认证结构预期，未产生实际迁移完成证据。已安装包、部署状态和来源权威仍由宿主准入提供；尚需将持久读取与目标核验直接装配，补齐正式契约、数据验证、实际结果持久化、恢复及 Enable。验证记录：[持久结构预期验证](verification-2026-09-08-migration-stored-structure.json)。


## 2026-09-08：持久签名预期到实际数据库的装配

新增 verifyStoredMigrationStructure，直接接受报告/Bundle 的 Artifact Ref、结构预期与迁移计划，组合持久字节读取、真实 Cosign 验证、全局 Schema 所有权以及实际目标数据库结构检查。返回结构差异、精确报告/Bundle Ref 与签名证据。调用方替换结构预期会因签名 binding 不匹配而拒绝；真实多出的序列仍使 matched=false。

每次准入重新读取报告和 Bundle 并执行验签；部署准入回调结束后再验证来源与密钥，保证该回调中的撤回/轮换不会被忽略。整个调用的签名者配置固定比较，环境和部署版本必须符合签名报告，检查期间有效期持续生效。这一实现有重复验签开销，尚未做缓存优化。

真实 Artifact/Cosign/PostgreSQL 测试 5 项通过，无跳过，包括目标结构检查之后的部署变化、来源撤回和密钥策略轮换。Core 类型、构建、2 个 API 报告及文档链接检查通过，隔离测试容器剩余 0。未重复全量。安装/部署权威及 fences、连接生命周期仍由宿主承担，正式契约、业务数据检查、实际结果持久化、恢复和 Enable 尚待完成。验证记录：[持久预期目标装配](verification-2026-09-08-migration-stored-inspection.json)。


## 2026-09-08：结构预期报告正式 Contracts

新增 PackMigrationStructureBinding 与 PackMigrationStructureReport 正式契约，统一组织、精确 Pack 版本、包/计划/结构摘要、环境、部署版本及有效期。字段封闭且必填，部署版本限定正安全整数；关系校验按微秒精度要求 expiresAt 严格晚于 issuedAt。报告级摘要策略覆盖全部字段，包括完整嵌套 binding。Core 的结构签名校验与绑定类型现使用该正式契约，移除重复本地字段校验。

Contracts 全量 255 项测试通过，48 项生成制品及一致性检查通过；类型和构建通过，9 个 API 报告已更新并检查。Core 真实 Cosign、Artifact 和 PostgreSQL 联合回归 40 项通过，无跳过，类型、构建、2 个 API 报告及文档检查通过。隔离测试容器剩余 0，未重复全量 Core。

此契约描述签名结构预期元数据，不证明实际迁移完成。详细表/序列预期仍是内部类型，安装与部署权威、业务数据验证、实际结果持久化、恢复及 Enable 尚待完成。验证记录：[结构预期正式契约验证](verification-2026-09-08-migration-structure-contract.json)。


## 2026-09-09：实际结构观察结果持久化

verifyStoredMigrationStructure 现在仅为真实返回的原始对象保存私有生产者记录，包括捕获快照、所有者、观察时间和稳定 commandId。persistMigrationStructureResult 拒绝复制或修改结果，使用独立管理事务写入 Artifact 并读回核对内容、所有者及来源引用。重复保存复用命令身份，重验捕获准入，不重复检查或执行目标 SQL；末尾准入撤回会使写入事务回滚。

持久载荷使用 abh-pack-migration-structure-observation-v1，包含实际结构结果、差异、未覆盖对象范围、签名报告和公钥/Bundle 摘要。Bundle 字节由原持久 Ref 与摘要标识，不重复嵌入。matched=false 的观察同样可以保存，不将结构不匹配丢弃或改写为成功。

真实 Artifact/Cosign/PostgreSQL 测试 5 项通过，无跳过，覆盖原始对象限制、修改拒绝、准入回滚、重试同 Ref、重放准入拒绝、实际内容读回及不匹配保存。Core 类型、构建、2 个 API 报告与文档检查通过，隔离测试容器剩余 0。未重复全量 Core。

这仍是未签名的结构观察，不能替代完整迁移验证或 Enable。详细观察契约与恢复读取尚待完善，Inline Artifact 大小限制仍适用，大结果对象存储未实现；安装/部署与捕获权威、业务数据验证及 Enable 装配仍待完成。验证记录：[实际结构观察持久化](verification-2026-09-09-migration-structure-persist.json)。


## 2026-09-09：持久结构观察重新核验读取

readRevalidatedStructureResult 锁定观察、报告及 Bundle 来源，读取真实观察 Artifact，再要求回调在同一管理事务中产生新的原始 verifyStoredMigrationStructure 结果。私有生产者记录增加事务身份；其他事务的旧返回对象不能冒充当前重新核验。逐项比较持久观察与当前完整结构、binding、摘要、报告和来源 Ref，仅允许验签执行时间不同；观察时间和验签时间检查使用微秒顺序。

数据库发生真实结构漂移时，先前 matched=true 的观察无法继续通过；持久观察 matched 被篡改会拒绝。历史与当前均不匹配时允许读取该观察，但 current.matched 保持 false。返回前重新验证观察来源，撤回不能被初始读取掩盖。该流程不重放 SQL，也不签发执行或 Enable 权威。

真实 Artifact/Cosign/PostgreSQL 测试 5 项通过，无跳过，包括旧事务结果拒绝、内容篡改、末尾来源撤回、额外序列漂移及不匹配恢复。Core 类型、构建、2 个 API 报告与文档检查通过，隔离测试容器剩余 0。未重复全量 Core。

宿主仍负责真实目标回调、连接与治理 fences；独立历史观察契约/签名、业务数据验证、完整恢复与 Enable 尚未完成。验证记录：[结构观察重新核验](verification-2026-09-09-migration-structure-revalidate.json)。


## 2026-09-09：普通视图与物化视图定义核验

新增 verifyMigrationViews，在专用角色的只读 REPEATABLE READ 事务中读取 pg_get_viewdef、列类型、所有者、reloptions 及 relispopulated，比较普通视图与物化视图定义。search_path 固定 pg_catalog，选项排序后比较，列保持实际顺序；不执行视图表达式、不读取物化业务数据、不触发 REFRESH。

真实 PostgreSQL 测试覆盖手写预期、同名替换定义、security_barrier/security_invoker、列类型变化、WITH NO DATA 与刷新后状态变化，以及不存在、错误对象类型、重复预期、权限和取消。初次测试发现 CREATE OR REPLACE VIEW 未指定选项会同时重置选项，已将测试 DDL 改为明确保留选项以分别验证定义与选项漂移。最终结构套件 14 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

本批为独立详细检查器，尚未接入统一签名结构预期，因此统一入口中的视图仍保留 requiresAdditionalVerification。视图依赖行为、触发器/规则、物化索引、ACL 与业务数据正确性尚未覆盖，不能据此宣称完整迁移验证或 Enable 完成。验证记录：[视图定义验证](verification-2026-09-09-migration-views.json)。


## 2026-09-09：视图核验接入签名结构流程

MigrationStructureExpectation 增加必填 views 数组；清单中每个普通/物化视图要求唯一详细预期，遗漏、重复或存在性矛盾均拒绝。统一检查在同一只读 REPEATABLE READ 事务中执行视图核验，视图字段进入预期摘要、联合 matched、实际结果持久化与恢复比对。现有旧预期不能静默跳过新增字段，需要重新提供并治理新的摘要。

真实签名制品测试使用实际视图作为预期对象，验证同名定义漂移使联合结果不匹配，旧成功观察恢复拒绝，新不匹配观察可持久保存并重验保持 false。清单覆盖、签名、Artifact、数据库权限及结构回归共 41 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0。未重复全量 Core。

普通/物化视图仍保留 requiresAdditionalVerification，因为依赖行为、规则/触发器、物化索引及 ACL 尚未完整检查；业务数据验证和 Enable 装配也未完成。验证记录：[视图签名装配验证](verification-2026-09-09-migration-views-integrated.json)。


## 2026-09-09：视图规则与物化索引核验

MigrationViewShape 增加必填 rules 与 indexes，读取 pg_rewrite 中非 _RETURN 规则的定义/启用模式，以及 pg_index 中索引定义、valid/ready/live、唯一性、主键和 replica identity 标志。_RETURN 查询定义仍通过 pg_get_viewdef 检查。新增字段进入现有签名预期摘要、持久观察和恢复比对，列表上限与字段/名称唯一性封闭校验同步加入。

真实测试创建并替换同名视图规则，检查 DO INSTEAD 与 DO ALSO 定义差异；创建物化唯一索引后替换为部分表达式索引，并在隔离实例注入/恢复 indisvalid=false 验证状态读取。PostgreSQL 不支持对视图使用 ALTER TABLE DISABLE RULE，测试已改为受支持的规则替换。规则内容仅检查定义，未执行其业务行为。

结构及实际签名/持久化/恢复联合测试 19 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0，未重复全量。视图依赖、触发器、ACL、业务数据和 Enable 仍待完成，requiresAdditionalVerification 继续保留。验证记录：[视图规则索引验证](verification-2026-09-09-migration-view-rules.json)。


## 2026-09-09：视图触发器与共享函数指纹

从表检查提取 readMigrationTriggers，表与视图共用非内部触发器定义、启用模式和直接函数指纹读取。视图预期增加必填 triggers，沿用闭合字段、摘要格式和数量/名称唯一性约束；触发器差异进入统一签名预期、实际观察持久化和恢复比对。

真实 PostgreSQL 测试创建 INSTEAD OF INSERT 视图触发器，比较手写触发器定义与独立计算的函数指纹，验证同名函数体替换、SECURITY DEFINER 切换以及恢复原函数后的匹配。既有表触发器、签名和持久恢复场景一并回归，共 19 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

函数指纹只覆盖直接函数定义/配置，不递归验证依赖与二进制内容；视图依赖、ACL、实际业务数据及 Enable 仍未完成，额外验证标记继续保留。验证记录：[视图触发器验证](verification-2026-09-09-migration-view-triggers.json)。


## 2026-09-09：对象与列级直接 ACL 核验

新增 verifyMigrationAcl，在专用角色只读 REPEATABLE READ 事务中比较对象及列级 ACL，展开 NULL relacl 对应的默认所有者权限，保留授权者、被授权者（含 PUBLIC）、列名、权限及 grant option，返回缺失和额外授权。真实测试发现序列 relkind 与 acldefault 类型代码不同，已使用正确的小写 s 展开序列默认权限。

真实 PostgreSQL 测试覆盖默认所有者权限、PUBLIC SELECT、列级 UPDATE WITH GRANT OPTION、撤销 grant option 及序列 USAGE 授权。最终结构测试 15 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

本批为独立检查器，尚未装配到签名结构预期。直接 ACL 不能替代角色继承、超级用户、RLS、函数间接权限及 Schema/数据库权限验证；完整迁移验证与 Enable 仍未完成。验证记录：[直接 ACL 验证](verification-2026-09-09-migration-acl.json)。


## 2026-09-09：直接 ACL 接入统一签名结构核验

MigrationStructureExpectation 增加必填 acl 数组，清单中每个关系对象必须具有唯一、类型一致的权限预期。遗漏、重复、清单外对象及类型不符均拒绝；ACL 检查在统一只读 REPEATABLE READ 事务内执行，实际差异参与 matched、预期摘要、持久观察与恢复比对。新增必填字段要求重新提供和治理签名预期，不静默接受旧摘要。

真实测试在已签名预期对应视图上增加 PUBLIC SELECT，确认整体核验不匹配、此前成功观察不能恢复，新不匹配观察可保存并重验保持 false。表、序列及视图的 ACL 清单覆盖与签名/Artifact/数据库权限回归共 42 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量 Core。

直接 ACL 不证明角色继承或间接权限安全，也不验证实际业务数据；视图依赖及外部表定义仍保留额外验证范围，完整迁移验证和 Enable 尚待实现。验证记录：[ACL 签名装配验证](verification-2026-09-09-migration-acl-integrated.json)。


## 2026-09-09：Core 全量回归

在当前工作树运行 Core 完整 test/*.test.ts，配置固定本地 Cosign v2.6.1、真实 PostgreSQL/Testcontainers 和默认测试并发 2。443 项全部通过，失败/跳过/取消均为 0，耗时 76,195 ms；隔离测试容器剩余 0。这次全量包含近期结构契约、表/序列/视图/ACL、签名 Artifact、观察持久化与重新核验，以及既有 HTTP、Owner、Durable/Wait 和执行链路测试。

此前多个结构批次未重复全量的限制，现由本次当前工作树证据补充；历史日志仍按原记录保留。测试通过仅证明现有测试覆盖，不能证明 V1 全部实现。重新核对 V1 Mission Controller 设计及当前数据清单，Mission/Run 实际 Owner 仍未实现；生产治理/默认服务、Pi/Gateway、ObjectStore、Projection/Workbench、SDK/CLI 及完整 Pack Enable 等也仍有缺口，不将迁移结构工作等同于整个目标。

验证记录：[Core 全量回归](verification-2026-09-09-core-full.json)。


## 2026-09-09：已安装 Pack 的结构核验装配

新增 verifyInstalledMigrationStructure，从 prepareInstalledPack 当前持久安装记录推导 Manifest 与结构报告所有者，从已签名数据影响报告推导环境及部署版本，再执行持久签名结构预期与实际数据库核验。组合固定输入和回调方法，持续检查迁移证据有效期策略；每轮结构准入重验 staging、治理/Grant、签名 compiler impact 和完整迁移准备，安装或影响内容变化拒绝。

真实安装集成 fixture 以已签名 SELECT 1 迁移和空 Schema 预期验证成功路径，结构来源撤回及核验期间的 impact 准入撤回均拒绝。现有执行、观察 Artifact、签名恢复场景随同一个集成测试运行通过：1 项通过，无跳过。Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0。本批之后未重复 Core 全量，前一批 443 项证据单独保留。

该入口补齐安装/影响到结构核验的组合，不产生 Enable 或业务数据正确性结论。宿主仍负责权威回调、fences 与专用只读连接生命周期，重复准备存在验签/文件读取开销；实际 DDL/ACL 变更由独立结构套件覆盖，生产迁移编排与完整数据验证仍待完成。验证记录：[安装态结构核验](verification-2026-09-09-migration-installed-structure.json)。


## 2026-09-09：包内真实 DDL 与 TOAST 预检修复

安装 fixture 从 SELECT 1 改为包内实际 CREATE TABLE（整数主键与带默认值 text 列），所有 SQL 长度/摘要、包签名、迁移证据、staging 和后续校验均使用真实字节。结构预期在执行前独立编写并签名；执行前缺表拒绝，执行后核对列、主键、索引、ACL 并持久读取实际观察，修改默认值后报告列差异。

该实质场景暴露并修复了 verifyPackMigrationDatabase 的 TOAST 误判：PostgreSQL 会在 pg_toast 为 text 等列生成内部存储及索引，旧预检把它们当作外部所有权。现在仅豁免通过 reltoastrelid/pg_index 明确关联到专用角色自有已登记 Schema 表、且内部对象所有者相同的 TOAST 对象。其他外部对象继续拒绝；隔离测试通过注入外部表 TOAST 所有者变化验证无法借用豁免。

真实安装签名、迁移执行与专用角色数据库预检联合测试 38 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0。未重复全量 Core。本批替代安装测试此前只有 SELECT 1/空 Schema 的限制，但不代表业务数据验证或 Enable 已完成。验证记录：[安装真实 DDL 验证](verification-2026-09-09-migration-installed-ddl.json)。


## 2026-09-09：实际数据不变量检查

新增 verifyMigrationData，对已登记 Pack 的普通非继承表检查精确行数、指定列空值数及指定键重复组数，计数使用十进制字符串。只接受固定不变量和受限标识符，不接受 SQL/谓词表达式；复合键中的 NULL 按分组相等语义检查，要求键值完整时需同时声明 nonNull。

要求专用角色、真实表及 Schema 所有权和只读 REPEATABLE READ 事务，拒绝超级用户/BYPASSRLS；设置 row_security=off 并拒绝强制 RLS，不能把策略隐藏后的零行当成全表通过。当前拒绝继承关系及分区表，未声称支持跨分区数据范围。

真实 PostgreSQL 测试创建/更新/删除数据，检出行数缺失、空值、单键及含 NULL 复合键重复；强制 RLS、继承、缺列、表达式注入、重复语义键、越界 Schema、事务模式与取消均覆盖。结构/数据套件 16 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

此为独立基础检查器，签名数据预期、安装态装配、结果持久化和完整领域验证仍未完成，不能据此 Enable。验证记录：[实际数据不变量验证](verification-2026-09-09-migration-data.json)。


## 2026-09-09：数据检查的表身份与快照稳定性

verifyMigrationData 在目录检查前取得目标表 ACCESS SHARE 锁，保持到调用方事务结束，并比较当前名称解析得到的 OID 与快照目录对象，避免将不同对象的目录与数据拼接为一次通过结果。该锁阻止 DROP/结构 ALTER，不阻止普通数据写入；REPEATABLE READ 保证本次全部计数使用同一数据快照。

真实并发测试在目录读取边界通过独立连接执行 ALTER TABLE，确认因锁超时拒绝；同一边界执行 INSERT 成功，本次核验仍匹配旧快照，下一次核验看到新增行而不匹配。事务结束后 ALTER 可以执行。数据/结构测试 16 项通过，无跳过；Core 类型、构建、2 个 API 报告与文档检查通过，隔离测试容器剩余 0，未重复全量。

签名数据预期、安装态数据装配、完整领域验证与 Enable 仍未实现。验证记录：[数据检查并发验证](verification-2026-09-09-migration-data-lock.json)。


## 2026-09-09：数据不变量接入持久登记与实际目标

新增 verifyRegisteredMigrationData，读取持久 Schema 所有权，复用跨连接随机锁证明实际目标与管理事务为同一数据库，再执行数据不变量检查。检查前后重新运行准入和数据库预检、比较持久所有权，绑定固定 DataInvariants 类型、组织、Pack ID/版本、packageDigest、完整迁移计划及数据预期摘要。检查对象必须位于迁移声明的 Schema 内。

真实 PostgreSQL 联合测试 40 项通过，无跳过，覆盖另一台同名数据库拒绝、迁移范围外 Schema、后期准入撤回、调用方输入修改隔离及实际空值/重复数据。Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0，未重复全量。

该入口仅覆盖明确列出的表，完整数据范围仍需治理认证；准入回调不是实际签名验证，签名数据报告、安装态数据装配、结果持久化与 Enable 仍待完成。验证记录：[持久登记数据核验](verification-2026-09-09-migration-data-registered.json)。


## 2026-09-09：数据预期签名与实际核验

新增 verifyDataSignature 和 verifySignedMigrationData。真实 Offline Cosign 签名使用独立 abh-pack-migration-data-expectation-v1 域并要求 DataInvariants binding，覆盖组织、Pack、完整计划、数据预期摘要、环境、部署版本及有效期。使用私有凭证身份、输入副本和持续有效期检查；结构签名 Bundle 不能替代数据签名。

组合入口在当前持久登记/实际目标数据核验前后匹配凭证、刷新环境与签名者配置并执行来源/安装准入。数据报告暂为内部类型，复用正式结构报告的身份、环境和时间字段约束，独立正式数据契约尚未生成。宿主仍提供报告/Bundle 字节及权威配置，持久数据报告读取与安装态组合仍待实现。

真实 Cosign/PostgreSQL 联合测试 6 项通过，无跳过，覆盖跨签名域替换、摘要篡改、错误组织/密钥、复制凭证、输入修改隔离、实际重复键漂移、配置变化和后期来源撤回。Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。此结果不证明完整领域验证或 Enable 完成。验证记录：[数据预期签名验证](verification-2026-09-09-migration-data-signature.json)。


## 2026-09-09：持久签名数据预期读取

新增 readSignedDataExpectation，在管理事务中锁定数据报告和 Bundle 来源，读取实际 Artifact 字节；验证所有者、媒体类型/大小、Bundle 对报告的引用、规范签名域封装以及完整 DataInvariants binding。使用真实 Cosign 验签，返回前再次执行两个来源准入与签名者配置比较、有效期检查；调用方与管理事务取消信号共同生效。

真实 Artifact Store Command 写入报告/Bundle，测试覆盖合法读取、结构报告替换、报告内容篡改、错误所有者、缺少来源引用、非规范 JSON、同 Ref、后期来源撤回及密钥策略变化。现有结构/数据签名与目标验证联合测试 6 项通过，无跳过；Core 类型、构建、2 个 API 报告及文档检查通过，隔离测试容器剩余 0，未重复全量。

该读取器只认证数据预期，正式数据契约、持久报告到实际目标的直接组合、安装态数据验证、结果持久化和 Enable 仍待完成。验证记录：[持久数据预期验证](verification-2026-09-09-migration-data-stored.json)。


## 2026-09-09：持久签名数据预期到实际扫描的装配

新增 verifyStoredMigrationData，直接接收数据报告/Bundle Ref 和明确数据不变量，组合真实 Artifact 读取、独立 Cosign 验签、持久 Schema 所有权和同库目标数据扫描。扫描前后各准入均重读来源；部署准入回调结束后再次认证报告和 Bundle，整个调用固定比较签名者配置，避免遗漏回调期间撤回或轮换。

真实测试覆盖合法数据扫描、调用方修改行数预期导致摘要拒绝、实际重复行导致 matched=false，以及扫描后的部署版本变化、来源撤回与签名策略轮换。签名/持久数据及既有结构回归 6 项通过，无跳过；Core 类型、构建、2 个 API 报告和文档检查通过，隔离测试容器剩余 0，未重复全量。

宿主仍提供安装/部署权威及目标连接生命周期；重复读取和验签尚未优化。正式数据契约、安装态数据装配、实际数据观察持久化、完整领域验证和 Enable 仍待完成。验证记录：[持久数据预期扫描验证](verification-2026-09-09-migration-data-composed.json)。


## 2026-09-09：安装态数据核验与观察恢复

新增 verifyInstalledMigrationData，从当前 Staged 安装、签名数据影响报告和迁移证据装配实际数据扫描。包清单、所有者、环境与部署版本来自当前安装；扫描期间重新准备安装并检查签名来源、策略和部署变化。真实已提交 DDL 后插入两行，验证空值漂移可独立于结构检查失败，后期影响报告撤回会拒绝核验。

新增 persistMigrationDataResult 和 readRevalidatedDataResult。实际扫描输出保存私有生产者身份、不可变观察副本与稳定命令 ID；复制或篡改输出不能保存，重试返回同一 Artifact，匹配及不匹配观察均可审计。恢复锁定实际观察和签名来源，并要求当前管理事务重新扫描目标；比较全部数据、绑定、报告与签名摘要，仅允许验签时间变化。旧事务结果和实际数据漂移不能恢复为原观察，不重放迁移 SQL。

安装态、签名与实际数据联合测试 7 项通过，无跳过；Core 全量 447 项通过，失败和跳过均为 0，类型、构建与 2 个 API 报告通过。该全量执行在后续正式数据契约替换前完成。

这仍是明确表范围内的数据不变量观察；报告与观察的独立正式契约、生产目标连接生命周期、完整领域/回填/投影验证、ObjectStore 大结果和 Enable 装配仍待完成。Mission/Run/Pi、Gateway、生产治理与服务、Projection/Workbench、SDK/CLI 的整体设计缺口继续保留，不能据此宣布 ABH 完成。验证记录：[安装态数据核验与恢复](verification-2026-09-09-migration-installed-data.json)。


## 2026-09-09：独立数据预期正式契约

新增 PackMigrationDataBinding 与 PackMigrationDataReport，要求 DataInvariants 类型、组织、精确包版本、包/计划/数据预期摘要、环境和部署版本，以及按微秒严格递增的签发/过期时间。封闭字段并将全部报告字段纳入契约摘要；Core 直接使用生成的数据类型与校验器，独立数据签名域保持不变。

Contracts 全量 258 项通过，生成的 48 个产物一致性与 9 个 API 报告检查通过。契约替换后真实安装态/签名/持久观察恢复回归 7 项通过，无跳过；Core 类型、构建及 2 个 API 报告通过，隔离测试容器剩余 0。此前本批次 Core 全量 447 项已通过，契约替换后未重复全量。

已完成数据报告独立正式契约；数据观察本身的正式契约、生产生命周期和完整 Enable 仍未完成。验证记录：[正式数据契约验证](verification-2026-09-09-migration-data-contracts.json)。


## 2026-09-09：实际数据观察正式契约

新增 PackMigrationDataObservation，描述明确表范围内的实际计数、空值、重复键组、匹配状态、签名报告及来源 Ref。计数保持十进制字符串并限制为非负 PostgreSQL bigint；校验重复表/列/语义键、计数可能性、聚合匹配一致性、完整报告 binding 和微秒时间顺序。摘要覆盖实际观察与时间，签名仍仅认证预期报告，不认证实际数据。

persistMigrationDataResult 保存前使用正式契约；readRevalidatedDataResult 解析实际 Artifact 时使用同一契约，并继续要求同管理事务的新实际扫描和私有生产者凭证。规范 JSON 或契约校验通过本身不产生可信实际验证、完整领域验证或 Enable 权限。

Contracts 全量 262 项通过，类型、构建、48 个生成产物一致性、9 个 API 报告通过；真实 PostgreSQL/Cosign 安装态与签名回归 7 项通过，覆盖非法持久计数拒绝及原有数据漂移/恢复。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0，本批未重复 Core 全量。

数据观察正式契约缺口已补齐；结构观察契约、结构与数据统一装配、完整领域/回填/投影验证、生产生命周期、ObjectStore 和 Enable 仍待实现。ABH 整体目标继续保留。验证记录：[实际数据观察契约](verification-2026-09-09-migration-data-observation.json)。


## 2026-09-09：安装态结构与数据统一核验

新增 verifyInstalledMigrationState，将两个独立签名预期装配到同一安装快照、同一管理事务和同一目标只读 REPEATABLE READ 事务。包、计划、环境、部署版本与所有者来自当前安装；每次准入重新验证安装和影响报告。数据扫描期间及结束后重读结构签名预期并固定比较签名者配置，随后再次认证数据预期；分别保留原有结构/数据观察的持久化生产者凭证。

目标连接的后端进程、事务起始时间、快照和事务模式在准备及返回时比较，中途结束并重启目标事务会拒绝。返回的 matched 是结构范围和明确数据不变量的合取，不表示完整领域/回填/投影完成。来源与安装权威仍必须在管理事务中保留准入 fences，宿主负责目标连接生命周期。

真实 PostgreSQL/Cosign 安装迁移集成测试通过（1 个顶层测试内含联合核验用例），覆盖合法组合、结构通过而数据空值导致总体失败、数据阶段结构来源撤回、目标事务中途重启，以及既有迁移执行/恢复和到期拒绝回归。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0。长集成夹具的常规证据有效期调整至 180 秒，显式短期到期拒绝用例保留。本批未重复 Core 全量。

结构/数据统一检查入口已补齐；组合观察的持久化恢复、结构观察正式契约、完整领域/回填/投影验证、生产执行生命周期、ObjectStore 和 Enable 仍待实现。ABH 其他模块的整体设计缺口继续保留。验证记录：[统一安装态核验](verification-2026-09-09-migration-state.json)。


## 2026-09-09：联合迁移观察持久化与实际恢复

verifyInstalledMigrationState 现在为原始联合结果记录私有生产者身份、两个原始子结果身份、不可变观察副本和稳定命令 ID。新增 persistMigrationState，将结构/数据观察及四个签名来源 Ref 保存到同一规范 Artifact；命令重试返回同一 Ref，同时重查当前来源准入。复制、篡改和替换子结果不能获得联合生产者凭证。

新增 readRevalidatedMigrationState，锁定联合观察及四个预期来源，在当前管理事务中要求重新执行同目标事务的结构/数据核验。恢复比较完整观察、签名报告、摘要、来源与所有者，只允许两次验签时间变化；校验时间顺序及报告有效期，不重放迁移 SQL。旧事务联合结果和真实数据漂移不能恢复旧观察，不匹配观察可保存并恢复为不匹配。

真实 PostgreSQL/Cosign 安装迁移测试通过（1 个顶层集成测试包含上述用例），覆盖稳定重试、来源撤回、原始身份检查、合法恢复、旧事务拒绝、数据漂移拒绝与不匹配恢复，并保留原有安装、执行、签名到期及目标事务重启回归。Core 类型、构建和 2 个 API 报告通过，隔离测试容器剩余 0；本批未重复 Core 全量。

联合观察目前为内部格式，结构和联合观察的正式契约、ObjectStore 大结果、完整领域/回填/投影验证、生产安装生命周期和 Enable 仍待完成。宿主继续负责来源 fences 和目标连接生命周期；单次范围核验不能替代 ABH 整体设计验收。验证记录：[联合观察恢复](verification-2026-09-09-migration-state-recovery.json)。


## 2026-09-09：迁移检查目标连接生命周期

新增 inspectMigrationTarget，接管新建独占目标连接。使用 DISCARD ALL 拒绝已有事务，创建只读 REPEATABLE READ 快照，固定目标进程、事务起点和快照，在检查返回后再次确认并回滚。无论成功、错误、取消或超时，均调用宿主销毁专用连接池；只有销毁确认后才返回观察结果。销毁等待限制为 1 秒，失败或未确认不能返回成功。查询代理在任务停止后拒绝迟到回调的新查询，组合管理事务取消和调用方取消。

真实安装态联合核验的成功路径已通过该入口运行，并继续完成联合观察持久化与实际恢复。生产宿主仍负责提供独占连接与真实销毁实现，此入口不提供 SQL 沙箱、目标连接创建配置、安装 Worker 或 Enable。

目标生命周期及安装态 PostgreSQL/Cosign 联合回归 7 项通过；补齐资源回收用例后生命周期专项 9 项通过（两次命令覆盖有重叠，不累加为 16 项）。覆盖已有事务拒绝、事务替换拒绝、只读写入拒绝、取消迟到回调、取消执行中查询、无响应回调到期、销毁失败与销毁不确认。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0，本批未重复 Core 全量。

完整领域/回填/投影验证、结构与联合观察正式契约、ObjectStore、生产安装调度和 Enable 仍待完成，整体 ABH 目标保持未完成。验证记录：[检查目标生命周期](verification-2026-09-09-migration-inspection-target.json)。


## 2026-09-09：检查目标延迟查询派发保护

复核锁定的 postgres 3.4.9 驱动发现，PendingQuery 在 await/then/游标消费时才派发，原先仅在创建查询时检查生命周期不足。inspectMigrationTarget 现在在实际查询 handler 再次检查活动状态；拒绝使用当前 Query 的 reject 回调，兼容游标接管错误处理。任务结束前创建、结束后消费的普通、unsafe/simple、values 和 cursor 查询不能触及已关闭目标。

驱动 file 接口会在异步读取文件后直接调用底层派发，检查入口因此明确拒绝该接口；实际结构/数据核验仅使用固定查询文本。宿主仍是受信代码，该保护不构成 SQL 或进程沙箱。实现依赖锁定驱动的 PendingQuery 行为，驱动升级必须保留相关真实回归。

生命周期与实际安装、签名、观察保存恢复联合回归 11 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。目标连接创建和真实销毁仍由宿主提供；完整领域/回填/投影验证、生产安装 Worker、正式结构/联合观察契约、ObjectStore 与 Enable 仍待完成。验证记录：[延迟查询保护](verification-2026-09-09-migration-lazy-query.json)。


## 2026-09-09：安装核验运行流程

新增 runInstalledMigrationInspection，将管理事务、独占目标生命周期、安装态联合核验和独立观察 Artifact 保存装配为一次调用。输入与回调方法在进入异步流程前固定；新观察在目标回滚/销毁确认及管理事务提交后保存。恢复模式从实际 Artifact 读取旧观察，在当前事务与受控连接上重新核验，不重放迁移 SQL，并返回同一观察 Ref。

联合核验私有凭证新增具体目标连接身份。运行流程检查回调结果来自当前管理事务及其受控目标，不能用普通对象或其他事务结果代替。目标清理由流程接管：输入准备或管理事务准入失败时也执行有界销毁，正常交接后由检查原语负责销毁。

实际生命周期与已安装签名迁移联合回归 11 项通过；扩展启动失败专项 11 项通过（两次命令覆盖有重叠，不累加）。覆盖实际新观察保存、稳定重试、旧观察恢复、数据漂移拒绝、不匹配恢复，以及事务启动前到期、输入快照失败、伪造回调结果拒绝和目标清理。Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0；本批未重复 Core 全量。

运行入口仍是内部安装核验流程，宿主提供受控目标和真实安装核验回调；尚无完整生产安装 Worker/任务发现、领域/回填/投影完成证明、ObjectStore 大结果、正式结构/联合观察契约和 Enable。持久保存失败后可以重新检查实际状态，无自动迁移 SQL 重放；整体 ABH 目标继续保持未完成。验证记录：[安装核验流程](verification-2026-09-09-migration-inspection-run.json)。


## 2026-09-09：Staged 安装恢复发现

新增 discoverStagedPacks，为同组织 Pack 管理流程按不可变 deploymentVersion 有界扫描实际 Staged 安装。每页最多 100 个扫描记录，使用 InstalledPackOwner 检查记录、Manifest 摘要与物理列一致性。内部数字游标仅供管理恢复使用；隐藏记录仍消耗扫描名额并保留后续游标，扫完后可重新开始一轮。

调用要求当前组织级数据影响管理 Grant，持有组织、主体、Grant 与部署提供的来源 fences。空页同样执行部署准入；返回前重验当前准入和 Grant，回调期间撤权会拒绝。来源可见性独立裁剪，传给回调的是副本。此入口返回发现候选，不产生工作租约、迁移完成证明或 Enable；后续阶段仍须认证签名、安装、环境、部署与来源。

真实 StagePack 后调用发现入口，额外构造一致的存储行仅用于分页及跨租户隔离验证，不能被解释为额外包已通过签名或执行准入。实际发现与原有安装签名/执行/核验/恢复联合测试通过（1 个顶层集成测试包含上述用例）；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复 Core 全量。生产安装 Worker/租约、影响报告选择、完整领域/回填/投影验证、ObjectStore 和 Enable 仍待完成，ABH 整体设计目标不变。验证记录：[Staged 安装发现](verification-2026-09-09-staged-pack-discovery.json)。


## 2026-09-09：当前影响报告唯一选择

新增 selectCurrentPackDataImpact，以完整安装 Ref、环境摘要和部署版本筛选当前有效的持久报告，最多读取两个候选以区分 Missing、Ambiguous 与唯一候选。多个候选不会按时间或 ID 任意选取。Missing/Ambiguous 只是恢复提示，不表示迁移不适用、完成或可 Enable；无候选时也必须执行选择准入。

唯一候选通过 recoverImpactCheckedPack 认证实际签名 Bundle、来源 Artifact、治理、安装内容及当前部署。选择准入结束后再次完整恢复认证，比较报告与安装一致性；最后在已持有的部署锁下重查候选集合，拒绝新增歧义或绑定变化。宿主选择准入需授权发现并按顺序保留所有后续影响报告治理 fences。

验证覆盖真实签名持久报告的唯一选择、其他环境 Missing、无结果时准入拒绝，以及第二次真实记录同一报告后的 Ambiguous。返回前来源撤回测试与已有安装/执行/核验/恢复联合回归通过（1 个顶层集成测试包含上述用例）；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。生产安装调度与工作租约、完整领域/回填/投影验证、ObjectStore、正式结构/联合观察契约和 Enable 仍待实现，ABH 整体目标保持未完成。验证记录：[影响报告选择](verification-2026-09-09-impact-selection.json)。


## 2026-09-09：安装只读检查 Worker

新增 runPackInspectionWorker，按页发现当前 Staged 安装，固定同组织 Service 身份，持续刷新上下文；宿主准备唯一影响报告、明确预期及独占目标后，直接调用实际安装核验/保存/恢复流程。回调返回结果必须匹配当前候选的安装 Ref、包摘要、管理事务和受控目标连接。Missing/Ambiguous 计数只作诊断，不代表完成；实际观察 Ref 可通过有界通知回调交给宿主持久登记。

取消、上下文刷新失败、任务参数准备失败时清理尚未交接的目标；准备回调取消后才返回的目标也执行销毁。任务参数和回调在交接前固定，清理责任随后转给 runInstalledMigrationInspection。Worker 只运行只读核验，不创建执行租约、不重放迁移 SQL；并行 Worker 可以重复观察，后续状态仍依赖实际 Artifact 与当前重验，不能使用内存游标推进 Enable。

真实 Service 场景从发现进入已有联合观察恢复，并验证保留原 Artifact Ref；身份切换拒绝并销毁目标，准备期间取消的迟到目标得到清理。Core 全量在本 Worker 修改前执行，458 项通过、无失败跳过；本次 Worker 及既有安装/签名/执行/核验/恢复集成通过（1 个顶层测试含多个实际场景），Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本入口尚未作为生产默认托管服务安装；完整安装调度/租约、领域/回填/投影证明、ObjectStore、结构与联合观察正式契约及 Enable 仍待完成。验证记录：[安装检查 Worker](verification-2026-09-09-pack-inspection-worker.json)。


## 2026-09-09：安装检查的租户宿主装配

TenantRuntimeOptions 新增显式可选 packInspection。createTenantRuntimeLoops 将检查 Worker 纳入与其他循环相同的组织/Workspace/acting organization 绑定及 joinRuntimeLoops 取消监督；未配置时不创建 Pack 检查循环。检查身份仍要求同组织管理用途 Service，不从其他用途的 Worker 身份推导权限。

宿主/服务关闭测试验证可选安装、无响应身份源被取消、错误用途/主体在调用准备前拒绝，并保留既有同伴失败、HTTP 停入站、排空和依赖关闭顺序回归。真实安装场景改为通过租户宿主生成的 Pack 循环完成联合观察恢复并退出。该集成只启动实际 Pack 循环，其他循环各有既有测试，不能据此证明全部生产 Worker 同时运行。长集成上下文有效期从 60 秒调整至 180 秒，独立超时/到期拒绝用例保留。

宿主/服务回归 12 项和真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复全量。生产默认配置、真实 Secret/身份提供器和所有 Worker 联合运行仍待完成；本装配不执行迁移 SQL，不产生租约或 Enable。完整领域/回填/投影验证、ObjectStore 和正式结构/联合观察契约继续保留为缺口。验证记录：[安装检查宿主](verification-2026-09-09-pack-inspection-host.json)。


## 2026-09-09：Pack 检查宿主配置固定

createTenantRuntimeLoops 在生成循环时固定 Pack 检查配置，而非等循环启动后重新读取 input.packInspection。Grant 列表深复制，身份源、发现准入、准备和通知方法保存原方法并绑定接收者，页大小、周期与期限也固定。运行期间依旧通过原治理回调查询当前权威状态；配置快照不冻结真实 Grant 或治理有效性，也不隔离回调内部可变状态。

新增方法私有字段接收者及配置替换回归；真实安装场景在循环创建后替换身份源、准备、可见性、Grant 列表和页大小，验证已安装循环仍走原始签名/治理与观察恢复流程。宿主/服务测试 13 项和真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。该修改只覆盖 Pack 检查配置，其他循环的配置生命周期需要分别核对。

生产默认配置、完整领域/回填/投影验证、迁移执行租约、ObjectStore、结构与联合观察正式契约、Enable 及 ABH 其他模块的整体缺口仍待完成。验证记录：[宿主配置固定](verification-2026-09-09-pack-host-snapshot.json)。


## 2026-09-09：执行与检查共享延迟查询保护

抽取 guardMigrationConnection，统一用于 inspectMigrationTarget、executeNewMigrationClaim 及 executeInstalledMigrationClaim 给宿主回调的连接。查询创建和 postgres 3.4.9 PendingQuery 实际派发两处均检查生命周期，当前游标拒绝回调保持有效；异步 file 加载执行入口拒绝。执行停止后的回调查询不能因提前创建而越过连接关闭边界。

新增真实安装态执行回调先创建查询、等实际 COMMIT 与连接关闭后才消费的回归，要求 DEPENDENCY_TIMEOUT。既有实际提交、丢失 COMMIT 响应保留 Unknown、角色提升拒绝、超时清理、检查游标/延迟消费和安装观察恢复一并回归。真实 PostgreSQL/Cosign 联合回归 26 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复 Core 全量。该共享保护仍依赖锁定驱动行为，受信宿主可以持有原连接，因此不是沙箱或 SQL 解析器。

完整迁移执行 Worker/租约、领域/回填/投影验证、生产默认装配、ObjectStore 与 Enable 仍待完成，ABH 整体目标保持未完成。验证记录：[迁移执行延迟保护](verification-2026-09-09-migration-execution-guard.json)。


## 2026-09-09：执行结果捕获最终准入

persistMigrationExecutionResult 在实际 Artifact 读回后增加最终捕获准入，并比较实际 sourceRefs 与原始证据来源；期限/取消配置在入口固定并在提交前检查。最终准入失败会回滚新建 Artifact，不会进入独立维护观察写入；已有 Artifact 重试也必须通过最终准入。此处准入仍是独立结果捕获权限，不要求已撤回的 SQL 执行权限重新有效。

真实 PostgreSQL 执行回归 14 项通过，无失败或跳过。实际丢失 COMMIT 响应用例验证已提交数据仍存在、OutcomeUnknown 不变，读回期间撤回捕获准入时新 Artifact 与维护观察均未留下；之后合法重试只保存证据，不重放 SQL。重试读回后撤权同样拒绝，原有日志保持一条。Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0。本批未重复 Core 全量。

完整执行 Worker/租约及执行到捕获的生产调度仍待实现，领域/回填/投影验证、ObjectStore、正式结构/联合观察契约与 Enable 保持未完成。验证记录：[执行捕获最终准入](verification-2026-09-09-execution-capture-admission.json)。


## 2026-09-09：维护日志恢复的持续准入

recoverMigrationObservation 在维护事务获得锁后的准入和提交前准入中重新执行恢复权限检查，并重读实际执行 Artifact、重新比较完整记录。签名恢复继续在这些检查后执行当前捕获签名认证，避免最初合法读取被当作整个锁等待期间持续有效。调用的期限配置也在入口固定。

新增实际提交但丢失 COMMIT 响应场景下的恢复撤权回归：锁后权限撤回、锁后来源撤回以及维护提交前权限撤回均拒绝；合法恢复返回原 Artifact/观察，日志仍仅一条，SQL 不重放。执行回归 14 项与真实安装/签名恢复集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复 Core 全量。恢复准入必须保留当前权限 fences，且重复调用保持幂等；读回不是数据正确性或 Enable 证明。

生产执行调度/租约、完整领域/回填/投影验证、ObjectStore、结构与联合观察正式契约及 Enable 仍待完成。验证记录：[维护恢复准入](verification-2026-09-09-execution-recovery-admission.json)。


## 2026-09-09：专用迁移连接工厂

新增 connectMigrationTarget，由受信部署 URL 创建仅含一个连接的新池并独占 reserve，返回幂等 dispose。连接建立受调用期限/取消控制，失败销毁池；连接配置/驱动错误映射为 Core 错误，不返回包含端点或认证信息的驱动诊断。调用成功后的连接归执行/检查生命周期所有，获取阶段取消不会替代后续生命周期的取消机制。

真实检查生命周期和已安装迁移的 createTarget 已使用该工厂。测试覆盖无响应 PostgreSQL 握手被取消和到期后套接字关闭、重复销毁、错误凭据隐藏，以及原有只读快照、延迟查询、执行与观察恢复。生命周期专项 13 项与真实安装集成 1 项通过，无失败或跳过；Core 类型、构建、2 个 API 报告通过，隔离测试容器剩余 0，本批未重复全量。URL 必须由宿主部署配置提供，不能接受 Pack 自带连接配置；该工厂不授予权限，角色/同库/Schema 权限仍由实际迁移准入验证。

Secret 提供器、默认生产配置、完整执行 Worker/租约、领域/回填/投影验证、ObjectStore、结构与联合观察正式契约及 Enable 仍待完成。验证记录：[专用迁移连接](verification-2026-09-09-migration-target-connect.json)。


## 2026-09-09：迁移连接显式身份绑定

connectMigrationTarget 要求部署 URL 显式包含用户名和数据库，避免驱动回退到进程默认身份/数据库；解析百分号编码后，在返回专用连接前查询 session_user、current_user 和 current_database，与显式目标比较。数据库查询参数覆盖等导致实际身份不一致时拒绝并销毁池。实际身份检查包含在获取连接的期限和取消范围内。

真实 PostgreSQL 生命周期专项 13 项通过，无失败或跳过，覆盖省略身份/数据库拒绝、百分号编码用户名正确解析、查询参数把目标数据库替换为 postgres 后拒绝，以及原有超时、取消、清理和延迟查询。Core 类型、构建、2 个 API 报告通过；隔离测试容器剩余 0。本批未重复完整安装或 Core 全量。

显式连接身份不替代持久 Schema 所有权、同库证明或角色权限准入。部署 Secret、生产默认配置、完整执行 Worker/租约、领域/回填/投影验证、ObjectStore 及 Enable 仍待完成。验证记录：[连接身份绑定](verification-2026-09-09-migration-target-identity.json)。


## 2026-09-09：逐 Pack 安装阻塞诊断

PackInspectionWorker 新增可选 onBlocked(candidate, reason, options)，逐项报告 Missing 或 Ambiguous，保留原有分页计数；Ready 的检查结果和证据 Ref 继续通过 onObservation 返回。通知只提供恢复诊断，不是持久验证证据。宿主在创建循环时固定回调并保留原接收者；Worker 传入候选副本，并限制通知的期限和取消。通知失败仍让循环失败并交由宿主管理，不吞掉诊断故障。

新增真实 Service/数据库回归覆盖两种阻塞、分页计数、禁止产生观察、装配后替换回调无效，以及通知挂起时取消退出。验证结果见[逐项诊断](verification-2026-09-09-pack-inspection-diagnostics.json)。

持久安装 Job、doctor 查询、完整执行 Worker/租约、领域/回填/投影验证及 Enable 尚未完成。


## 2026-09-09：安装检查准备装配

新增 preparePackInspection，组合当前部署的唯一实际影响报告选择、专用连接工厂及签名结构/数据联合检查。Missing/Ambiguous 在创建目标连接前返回；Selected 必须与发现的完整安装记录一致。检查事务内重新选择相同影响 Ref，持有当前部署锁后执行原有真实安装验证，防止把准备阶段选择当作持续有效的凭证。准备阶段固定配置、方法接收者、Grant、签名期望和观察来源。

宿主真实安装恢复用例改用该装配，保留原 Artifact Ref，覆盖缺报告时不打开无效 URL、选择拒绝与配置替换。结果见[准备装配验证](verification-2026-09-09-pack-inspection-preparation.json)。返回 Ready 后，调用者必须运行检查或销毁目标；Worker 已承担该生命周期。

此装配仅处理已声明 SQL 迁移的安装检查，不能将无 SQL 的数据影响标记为完成。生产 Secret、持久 Job/doctor、执行调度/租约、完整领域/回填/投影验证和 Enable 仍未完成。


## 2026-09-09：结构与联合观察正式契约

新增 PackMigrationStructureObservation、PackMigrationStateObservation 及复用的子结果 Schema，沿统一生成链输出验证器、类型、摘要规则和 API 报告。结构证据关闭并限制目录、表、序列、视图、ACL 及详细差异格式；关系校验约束来源 Ref、绑定、签名时间、重复对象与组件匹配状态。联合观察要求同组织、包版本、包摘要、计划、环境及部署，四个来源不同，并递归校验结构和数据观察。

结构及联合观察持久化与恢复已接入正式契约，原有 Artifact envelope 不变。Schema 校验不能替代原始 producer provenance、签名验证、当前权限、真实数据库复查或完整领域验证。RequiresAdditionalVerification 保留在结构结果中，不会因 matched=true 被清除。

新契约接入前 Core 全量 462 项通过；Contracts 全量 266 项通过。最终类型、生成链、API 和真实安装恢复证据见[观察契约验证](verification-2026-09-09-migration-observation-contracts.json)。本批将结构与联合观察格式从内部 JSON 提升为正式契约；生产 Job/doctor、执行租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：持久联合观察发现

新增 discoverMigrationState，按当前组织、Pack owner 和四个精确来源查询 Available 的 JSON Artifact，并在有界页内读取实际字节、验证摘要和正式联合观察契约。只返回目标包摘要、环境、部署匹配的观察 Ref、时间和 matched；其他环境占扫描槽位，不能让游标跳过潜在结果。UUID 游标仅供内部恢复使用。ArtifactStore 提供按 owner/source 的内部 keyset 扫描，权限由上层发现准入和逐 Artifact 读取准入承担。

查询开始及返回前均验证管理 Grant/准入，空页也不得绕过权限；先保留权限 fences，再锁定整页 Artifact 与四个来源。不会按时间或顺序替多条结果选一个，返回 Ref 只用于下一步 readRevalidatedMigrationState 真实状态复查，不能证明签名持续有效、当前数据库正确或 Enable。数据库扫描仍受事务期限约束，尚无专用生产观察索引。

真实安装宿主恢复改用发现出的 Ref。新增验证覆盖唯一观察、环境不匹配、非法边界、缺 Grant、读取拒绝、最终准入撤回、空查询拒绝、重复 Artifact 分页及墓碑过滤。结果见[持久观察发现验证](verification-2026-09-09-migration-state-discovery.json)。生产自动选择/调度、持久 Job/doctor、领域/回填/投影验证、ObjectStore 和 Enable 仍未完成。


## 2026-09-09：有界观察选择与自动恢复装配

新增 selectMigrationState：完整有界页中的唯一结果才返回 Selected，无匹配返回 Missing；已发现多个匹配返回 Ambiguous，仍有未扫描内容且匹配数不足两个则返回 Incomplete。单页最多读取 100 个候选，零个或一个匹配不能在扫描截断时证明不存在或唯一。选择仅为当前发现时刻的恢复提示，不是持久租约；后续仍执行真实证据与目标状态复查。

preparePackInspection 新增显式 recoveryDiscovery 配置，与手动 recovery Ref 互斥。唯一观察进入原 Ref 恢复，完整扫描无观察进入新的实际检查；多观察和截断分别返回 ObservationAmbiguous、ObservationSearchIncomplete，均在创建目标连接前返回。Worker 将这两类阻塞传给 onBlocked，并在 onPage 独立计数。配置在准备入口固定。

真实安装用例的首次观察与宿主重启恢复均使用此装配；重复真实 Artifact 场景验证两类阻塞不会打开无效目标 URL，截断且没有当前环境匹配也不会误报 Missing。证据见[观察选择与自动恢复](verification-2026-09-09-migration-state-selection.json)。严格恢复中发现旧证据与当前状态不一致仍拒绝，不自动替旧证据生成新事实。

生产默认配置/配额、持久 Job/doctor、观察索引、执行租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：观察发现索引与就绪约束

新增第 51 批数据库迁移：data.artifacts 的 owner_lookup/sources_lookup 为 PostgreSQL 存储生成列，使用 JSONB 等值哈希；部分 B-tree 索引按组织、owner/source 查找键和 Artifact id 排序，只包含未删除 Available JSON Artifact。查找仍保留完整 owner/source JSON 等值条件、目的与 workspace 范围，哈希只定位候选，内容完整性仍由原 SHA-256 验证。JSON 数字 1 与 1.0 的等值表示不会因文本不同而漏查。

实际 RLS 执行计划证明普通表达式索引只利用组织条件，因此最终实现使用存储生成列；未修改 RLS、函数泄漏属性或运行身份权限。就绪校验登记并验证生成表达式、类型、索引完整定义、所属表/Owner 及 valid/ready/live 标志。缺索引、同名弱索引或普通列替代均拒绝启动；应用不能写入生成列。

真实 PostgreSQL 测试使用 4,000 个其他 owner 的 Artifact 存储夹具、100 项来源列表，以及实际生产 scanOwnedSources 查询。首查询、游标后续空页和 JSON 等值表示变化后的查询均使用 owner/source 索引条件，未额外过滤行。现有数据库安全与真实安装恢复同时回归，结果见[观察发现索引验证](verification-2026-09-09-artifact-discovery-index.json)。

生成列迁移会计算既有记录的派生值并构建索引；尚未验证生产规模迁移窗口或生产负载 SLO。持久 Job/doctor、生产调度/租约、领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：Pack 检查租约 Owner 装配

新增 claimPackInspectionLease、renewPackInspectionLease、releasePackInspectionLease 和 requirePackInspectionLease，复用 runtime.work_leases 唯一租约来源及现有 Command/Receipt/Audit 事务。管理 Service 必须拥有当前组织的 data-impact Grant，实际 Staged 安装记录须与候选完整一致；各次租约变更前后重新验证。工作占用不授予 SQL 执行、迁移完成或 Enable 权限。

同 Worker 的重复有效认领不续期、不增加 token；其他 Worker 竞争被拒绝。续约更新 Ref 版本且保持 fencing token，释放后接管增加 token。require 检查按当前 token 识别所有权，旧 Worker 迟到操作不能借旧 Ref 或队列回执继续。调用提交前检查时，调用者须先获取其余 control/deployment 锁，再获取租约聚合锁；租约上限仍是 30 秒。

实际安装记录/Service/Grant 测试覆盖重复与竞争认领、失效候选、缺 Grant、Human 拒绝、续约 CAS、释放和接管后旧 token 拒绝；并回归通用租约的真实数据库时间过期和身份撤回。证据见[Pack 检查租约验证](verification-2026-09-09-pack-inspection-leases.json)。

本批完成租约 Owner 操作及检查入口，尚未把周期心跳、失租取消、结果事务 fencing 和退出释放装入 PackInspectionWorker。持久 Job/doctor、生产调度、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：检查与观察结果事务 fencing

InstalledMigrationInspectionRun 新增显式 lease 绑定，经 preparePackInspection 和 Worker 固定传递。真实检查/恢复完成且专用目标已关闭后，在管理事务提交前验证当前租约；新观察的独立 Artifact 事务在 Command 准入和最终读回后再次检查。检查使用实际 producer 的 ownerRef 与包摘要约束租约目标，不能借其他 Pack 的有效租约提交。租约 Ref 版本可因续约变化，所有权仍由实际 fencing token 判断。

真实集成发现 Pack 治理锁先于原 DurableExecution 租约锁会违反全局锁顺序，因此 WorkLeaseOwner 对 installed-pack 目标统一使用后置 WorkLease 聚合命名空间；所有认领/续约/释放/检查使用同一键，其他目标维持既有顺序。没有放宽锁顺序检查。

实际 Service 宿主恢复使用显式租约，并验证准备期间更换 token 配置不会重定向检查。另验证释放后旧租约恢复拒绝、实际 Artifact 写入期间租约到期导致事务回滚、合法新 token 重试只保留一份观察、旧 token 即使重放已有 Artifact 仍拒绝，以及错误 Pack 绑定拒绝。证据见[检查结果 fencing](verification-2026-09-09-pack-inspection-fencing.json)。

本批只在显式提供 lease 时启用这些检查；Pack Worker 的自动认领、周期心跳、失租取消和退出释放仍待装配。Control fences 当前使用排他行锁，后续心跳调度必须考虑检查事务的锁占用及租约期限，不能假设可以在持锁期间无限续约。持久 Job/doctor、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。


## 2026-09-09：Pack Worker 租约生命周期

PackInspectionWorker 新增可选 lease 配置，workerId 标识运行实例，默认每 10 秒续约 30 秒租约。每个候选先认领，再进入准备、真实检查和观察事务；实际租约绑定由 Worker 注入并使用既有提交 fencing。竞争认领通过明确的 WorkLeaseBusyError 区分，不吞掉其他权限/存储错误；仅认领竞争转为 LeaseBusy 诊断与分页计数，已进入工作后的错误仍传播。宿主创建循环时固定租约配置。

新增 withPackInspectionLease 生命周期：续约失败或本地租约期限到达会取消 scoped signal；操作期限取单次预算与已知租约期限的较早者，不因心跳无限延长。退出时停止并等待续约，再用独立的 10 秒清理期限取得同一 token 的最新 Ref 版本并释放，避免续约提交/取消竞态。已过期或被接管的旧 token 不释放新所有者；其他清理失败保留错误，未能释放的租约仍由数据库期限回收。

真实测试覆盖续约 Ref 版本增长、双实例竞争、实际接管后的旧任务取消且新租约保留、Worker 准备取消后释放、宿主配置替换无效，以及自动认领后恢复原观察并释放。手动 run.lease 与 Worker 自动 lease 不可混用。证据见[Worker 租约生命周期](verification-2026-09-09-pack-inspection-lifecycle.json)。

此能力由显式配置启用，不是持久安装 Job 或默认生产服务。Control fences 的排他锁可能延迟续约，工作仍受既有租约和事务期限限制；生产心跳容量/延迟 SLO 尚未验证。持久 Job/doctor、完整领域/回填/投影验证、ObjectStore 与 Enable 仍未完成。

本批最终 Core 全量 463 项通过，无失败或跳过；类型、构建与 API 检查通过。清理只忽略 WorkLeaseNotCurrentError 这一明确失去所有权的结果，其他权限/完整性/上下文错误继续传播；非 Error 的抛出值也保留。专项日志在最终清理错误分类前生成，最终源代码以本批全量日志为准。


## 2026-09-09：安装检查 Job 契约与状态一致性

新增 PackLoader 所有的 PackInspectionJob 状态机和 PackInspectionJobRecord，沿用规范 §10 的 Pending、Running、Waiting、Succeeded、Failed、Cancelled，以及补充条款允许的 Pending → Failed/Cancelled。终态没有重开边；重新检查须创建新 Job。正式 Ref 固定安装、包摘要、环境与部署版本，保存请求来源、期限、累计尝试/耗时预算及诊断 Artifact 引用。

Running 必须持有租约绑定，Waiting 必须保留阻塞证据且仍有重试预算；Succeeded 必须保存实际观察 Ref 与 matched，matched=false 仍可代表检查技术工作完成。取消/失败需要正式诊断；到期和预算超支不能转为成功。新增内部前后快照校验，约束版本递增、安装与请求绑定不变、预算上限不变、每次启动增加一次尝试、累计耗时不回退。

这些是数据契约和本地一致性检查。所有迁移守卫仍为 OwnerRequired，尚未实现持久 Job 表、事务 CAS/权限与观察来源验证，也尚未接入 Worker、队列和 doctor。此状态不证明 Pack 已 Enable。验证结果见[安装检查 Job 契约](verification-2026-09-09-pack-inspection-job-contracts.json)。


## 2026-09-09：安装检查 Job 存储与读取

新增 extension.inspection_jobs，数据库 manifest 升至 52。表由 PackLoader 管理，启用并强制租户 RLS，禁止 workspace、墓碑和运行身份 DELETE，保存正式 Job 记录、版本及安装/包/环境/部署定位列。数据库身份 CHECK 使用 IS TRUE 拒绝缺失字段引起的 NULL 通过；状态 CHECK 与生成状态机保持一致。按租户和 UUID 建立非终态扫描索引，索引与状态约束纳入 readiness 检查。

新增内部 PackInspectionJobOwner 读取与有界分页扫描。读取要求组织内管理上下文、精确 Ref 版本、正式记录及定位列一致，并执行调用方准入检查。扫描最多 100 条，空页也在查询前后执行准入，返回带版本的 Ref；过期非终态仍可被发现以供后续失败处理，终态不参与扫描。返回候选不是认领，后续执行仍须重新读取、准入与 fencing。

真实 PostgreSQL 测试覆盖租户隔离、跨租户写拒绝、版本冲突、准入拒绝、记录损坏、缺失身份字段、DELETE 禁止、分页及终态过滤、索引/状态约束缺失导致 readiness 拒绝。测试记录是直接存储夹具，不证明真实安装来源或检查证据。验证见[Job 存储验证](verification-2026-09-09-pack-inspection-job-storage.json)。

本批没有实现创建/迁移 Command 的事务 Owner、Audit/Outbox、实际 Grant/证据/租约校验，也尚未装配 Worker、队列与 doctor；状态守卫仍为 OwnerRequired。完整安装验证和 Enable 仍待实现。

本批 Core 全量执行 466 项，464 项通过；唯一根因是新状态 CHECK 的 SQL 空格未逐字采用生成片段，连同父测试计为 2 项失败。改用生成片段后，数据库与新增存储共 13 项复测通过，无失败/跳过；此次只修改格式，未重复全量。类型、构建、API、文档检查通过，隔离测试容器清理完成。


## 2026-09-09：安装检查 Job 创建 Command

新增内部 RequestPackInspectionCommand（abh.packs.request-inspection）及独立管理 Grant 动作。请求固定安装 Ref、包/环境摘要、部署版本、绝对期限和预算；最多 1000 次尝试、86400000 毫秒累计工作预算，调用方不能指定 Job 状态、已耗预算或成功证据。

requestPackInspection 在 Command 幂等锁、当前 Control fences 和部署锁下读取真实 Staged 安装，匹配包与部署版本，执行宿主提供的当前环境/部署准入，并在写入前后复查 Grant 和数据库时钟期限。服务器生成 Pending Job、请求人 Ref 和时间；Job、CommandReceipt、Audit、Outbox 在同一事务提交。相同意图的重放核对当前 Job 中的不可变请求字段，返回原创建 Ref；即使 Job 已推进，也不重置状态或累计预算。到期请求的重放仍拒绝。

验证使用真实签名安装夹具，覆盖单次写入/幂等重放、缺 Grant、意图冲突、部署版本不符、到期、最终准入失败的完整回滚，以及已有进度后的创建重放。进度推进部分采用明确的直接存储夹具，不冒充取消 Owner 或真实取消证据。结果见[Job 创建验证](verification-2026-09-09-pack-inspection-job-request.json)。

当前完成的是 Pending 创建事务；Running/Waiting/终态迁移 Owner、租约与观察证据验证、队列/Worker/doctor 和完整安装流程仍未完成。部署必须提供当前环境/治理准入，创建请求本身不证明检查通过或 Pack 已 Enable。


## 2026-09-09：租约约束下的安装检查 Job 启动

新增内部 StartPackInspectionCommand（abh.pack-inspection-jobs.start）及独立 Grant 动作，要求精确 Job expectedVersion 和正式 leaseRef/workerId/fencingToken，禁止调用方提供已耗预算或目标状态。startPackInspection 仅允许当前组织管理 Service 执行 Pending/Waiting → Running，锁定 Control fences、Deployment、Job 与实际 Pack 租约，校验当前安装/包/部署及宿主环境准入，使用数据库时钟拒绝到期工作。

启动递增 Ref 版本和累计尝试，保留累计耗时/预算上限，清除旧等待诊断并保存租约绑定；CAS、CommandReceipt、Audit、Outbox 同事务提交，最终准入或租约失败全部回滚。幂等重放必须仍处于原 Running 版本且持有当前租约，不能用旧回执重新启动已推进或失去租约的工作。

数据库 manifest 升至 53，新增每组织/Pack 至多一个 Running Job 的部分唯一索引；避免同一个 Pack 租约同时启动多个 Job。索引完整定义纳入 readiness，Owner 同时返回明确的竞争前置条件失败。

真实签名安装夹具验证当前权限、租约、版本、回滚、竞争和释放后旧重放拒绝；Waiting 恢复边使用直接存储夹具，验证累计尝试和耗时保留，不冒充 Waiting 的证据生产或事务 Owner。结果见[Job 启动验证](verification-2026-09-09-pack-inspection-job-start.json)。

Waiting/终态迁移、实际观察与诊断证据验证、失租/崩溃后的持续预算结算、Worker/队列/doctor 及完整安装验证与 Enable 仍未完成。注册表继续声明 OwnerRequired，由具体命令入口执行其已实现的启动检查。


## 2026-09-09：安装检查 Job 超时/预算耗尽收尾

新增内部 ExpirePackInspectionCommand（abh.pack-inspection-jobs.expire）及独立管理 Grant。当前组织 Service 在 Control/Deployment/Job 锁和精确 CAS 下，由数据库时钟判定 Pending/Running/Waiting 是否到期或累计工作时长耗尽。Running 按原 updatedAt 到判定时间的墙钟间隔向上取整到毫秒，加入既有耗时；Pending/Waiting 不计入工作耗时。优先保留 BudgetExhausted 超支事实，否则必须实际到达绝对期限才可 Expired。

Owner 自行生成 PackInspectionTimeoutEvidence，包含原 Job 快照、判定时间、累计耗时与原因，保存为受控 Artifact；随后同事务提交 Failed Job、CommandReceipt、诊断/Job Audit 与 Outbox。诊断引用原 Job、安装和原租约，Failed 清除活动租约绑定且不改变累计尝试。最终准入失败回滚诊断和所有状态/日志。重放读取并锁定原诊断，校验实际字节、正式契约、元数据、预算推导与终态一致，不重复计时或生成新 Artifact。

超时清理由独立当前权限控制，不要求旧 Worker 租约仍有效，也不续约/释放他人的租约；Job 失败不证明原 Worker 已停止或任何 SQL 已成功。失租但尚未超时的工作仍不能通过此命令随意失败。Evidence 契约校验微秒舍入、时间顺序和到期/耗尽依据；不可换算的时间返回正式校验错误。

真实签名安装流程验证释放租约后的 Running 预算收尾、最终准入回滚、幂等、缺权限/诊断读取拒绝，以及真实 Pending 创建后的到期收尾且耗时仍为零。结果见[超时收尾验证](verification-2026-09-09-pack-inspection-job-expire.json)。

尚未实现一般 Waiting/Cancelled/InspectionFailed/Succeeded 提交、未到期失租恢复、Worker 取消与预算驱动、队列/doctor、完整领域/回填/投影验证和 Enable。此批冻结的是截至数据库判定点的 Running 墙钟预算，不宣称已停止旧进程或完成实际业务验证。


## 2026-09-09：安装检查 Job 技术完成提交

新增内部 CompletePackInspectionCommand（abh.pack-inspection-jobs.complete）及独立管理 Grant，输入仅为精确版本、租约和观察 Ref；matched、耗时和成功状态均由 Owner 生成。completePackInspection 要求原始 InstalledMigrationState 的 WeakMap 来源证明，拒绝复制对象和手写观察；实际检查必须晚于当前 Running 开始，且绑定同组织、安装、包摘要、环境和部署。

事务锁定 Control/Deployment/Job/实际租约及观察与四个源 Artifact。读取真实字节、当前可用性和权限，校验报告/Bundle Ref、完整联合观察契约与原始结果等价；允许真实复查后的等价旧观察 Ref，仅验证时间可不同。宿主必须复查当前签名/来源/环境治理，Owner 同时检查报告与 Job 期限和最终租约。

Succeeded 保存实际观察 Ref 和 matched，包括 matched=false。CAS、回执、Audit、Outbox 同事务提交，最终来源准入后再次结算 Running 墙钟耗时，保持同一提交版本；到期或耗尽预算拒绝成功，等待超时收尾命令处理。失败回滚全部进度写入；重放重新检查当前权限、源证据和租约，不重复结算或重开终态。

真实签名安装测试覆盖匹配与实际数据不匹配的技术完成、旧检查结果拒绝、新复查复用旧观察、来源对象伪造拒绝、最终准入回滚、幂等、缺权限/观察与源报告读取拒绝，以及释放租约后的重放拒绝。证据见[技术完成验证](verification-2026-09-09-pack-inspection-job-complete.json)。

技术检查完成不等于领域/回填/投影全量验证，也不产生 Enable。一般 Waiting/Cancelled/InspectionFailed、未到期失租恢复、持久 Job 与 Worker/队列/doctor 装配仍未完成；当前源码入口要求宿主提供当前治理和证据读取准入。


## 2026-09-09：真实准备阻塞到 Waiting 事务

preparePackInspection 为实际 Missing/Ambiguous/ObservationAmbiguous/ObservationSearchIncomplete 结果保留私有 WeakMap 来源，绑定组织、原安装、包/环境摘要、部署、执行人和数据库观察时间。阻塞返回不获取目标连接；matchPackInspectionBlock 拒绝复制对象、手写原因及修改后的结果。结果仅证明当时的有界准备检查，后续重试必须重新准备。

新增内部 WaitPackInspectionCommand 与独立管理权限，在当前 Service、Control/Deployment/Job 锁和真实 Pack 租约下执行 Running → Waiting。命令不能指定原因/耗时；Owner 要求原始准备阻塞来自本次 Running、同执行人及安装环境。剩余尝试/时长不足或到期时拒绝等待。

Owner 生成 PackInspectionWaitingEvidence，保存原 Running 快照、准备阻塞和初次判定时间/耗时；诊断 Artifact、Job CAS、回执、Audit/Outbox 原子提交。最终准入后将其开销计入 Job 累计耗时，重放从诊断里的原快照与最终 Job 时间重新推导，不重复累计；过预算则全部回滚并由超时收尾处理。Waiting 移除活动租约绑定但不代替 Worker 的实际释放。重放仍要求当前租约和诊断读取权限。

真实签名安装夹具覆盖缺少指定环境报告产生 Missing、禁止旧结果/复制结果、事务回滚、幂等、缺 Grant、再次 Running 保留累计预算、第二次 Waiting 及释放后重放拒绝。LeaseBusy 没有取得执行租约，不作为此路径的证据生产者。结果见[Waiting 验证](verification-2026-09-09-pack-inspection-job-wait.json)。

Worker 的 onBlocked 仍是普通通知接口，会重建状态对象，不承载来源证明；持久 Job 调度应直接使用 preparePackInspection 的原结果调用 Waiting Owner。持久 Worker/队列/doctor、Cancelled/一般 InspectionFailed、未到期失租恢复、完整领域/回填/投影验证和 Enable 仍未完成。

本批最终 Core 全量 468 项通过，无失败或跳过；Contracts 全量 281 项、类型、构建、API 和文档检查通过，隔离测试容器清理完成。最终全量包含 Waiting 的最终准入耗时结算。


## 2026-09-09：有依据的安装检查 Job 取消

新增内部 CancelPackInspectionCommand（abh.pack-inspection-jobs.cancel）及独立管理 Grant。允许当前组织 Human/Service 提交 OperatorRequested、Superseded 或 Shutdown，必须提供实际可读的依据 Artifact。Owner 在 Control/Deployment/Job 锁下按 expectedVersion 处理，读取依据真实字节，由部署提供的 current 准入验证其语义、Job 范围和取消理由；仅有 Ref 或字符串不视为取消依据已验证。

数据库时钟结算截至取消判定点的 Running 墙钟耗时，Pending/Waiting 不计入闲置时间。未耗尽时终结为 Cancelled；已达到累计时长上限则保留 Failed/BudgetExhausted，避免取消掩盖超支。正式 PackInspectionCancellationEvidence 绑定原 Job、实际依据 Ref、理由、执行人、命令 ID、判定时间、耗时和终结类型。诊断 Artifact、Job CAS、CommandReceipt、Audit/Outbox 同事务提交，最终准入失败全部回滚。

取消不要求旧 Worker 租约仍有效，也不释放、续约或替换它。Job 终态阻止旧版本继续启动或提交，但不声称进程已停止或 SQL 已无效果。重放重新检查当前权限、依据/诊断可读性及其与终态的一致性，返回原 Ref，不重新累计耗时。再次发起新取消命令不能重开终态。

真实签名安装夹具验证 Human Pending、Service Waiting/Running、超预算 Running 的取消，覆盖依据拒绝、缺权限、最终准入回滚、幂等、旧启动回执拒绝和原租约保持有效。依据内容及语义准入由测试宿主显式提供，不声明生产治理策略已部署。结果见[取消事务验证](verification-2026-09-09-pack-inspection-job-cancel.json)。

仍待完成一般 InspectionFailed、未到期失租恢复、持久 Job Worker/队列/doctor 和完整领域/回填/投影验证及 Enable。取消计时截止于记录的数据库判定点，不包括判定之后的清理工作，也不代表已向旧 Worker 送达停止通知。


## 2026-09-09：最后一次阻塞尝试的立即终结

修复 waitPackInspection 在尝试次数已用完时只能拒绝 Waiting、使 Running 留到绝对超时的缺口。当前真实准备结果已证明本次仍阻塞，且 attempts=maxAttempts 时，Owner 生成 PackInspectionRetryExhaustedEvidence 并原子提交 Failed/BudgetExhausted；有剩余次数仍提交 Waiting。仅达到次数上限而尚无阻塞结果，不提前失败运行中的最后一次尝试，成功结果仍可正常完成。

新诊断保留原 Running、精确准备阻塞、AttemptsExhausted 原因及初次判定时间/耗时，实际失败保存最终准入后的累计耗时，并保留同时发生的时长超支。仍要求当前执行人、相同安装/环境、原始准备对象、当前租约、未到绝对期限及管理权限。读取重放按诊断类型核对 Failed 或 Waiting，并重新验证全部预算推导。过绝对期限或失租的工作继续交给相应收尾路径。

实际安装夹具以 maxAttempts=1 创建并启动 Job，实际 Missing 后验证即时失败、未到绝对期限、原始原因保留、最终准入回滚、单一诊断/失败事件、幂等和终态禁止启动。契约测试覆盖用未耗尽预算冒充失败、旧阻塞、环境不符、耗时错算及同时超时长；迁移测试保留最后一次尝试成功的合法边。结果见[重试耗尽验证](verification-2026-09-09-pack-inspection-retry-exhaustion.json)。

这不是一般异常处理或持久调度完成。通用 InspectionFailed、未到期失租恢复、持久 Job Worker/队列/doctor、领域/回填/投影验证与 Enable 仍待实现。


## 2026-09-09：单个持久安装检查 Job 执行装配

新增 runPackInspectionJob，以精确 Pending/Waiting Job Ref 为输入，不隐式创建、不重启 Running 或终态。入口读取真实 Job/安装并校验当前启动权限和宿主读取准入，固定配置与上下文身份，再进入既有 Pack 租约生命周期，自动认领、心跳、失租取消和退出释放。

取得租约后调用正式 Start 命令，读取提交后的 Running 时间与累计预算，以剩余工作时长、Job 绝对期限、租约期限和单次操作上限共同约束后续工作。使用宿主当前 context 和原始准备结果：阻塞直接提交 Waiting（最后一次阻塞则 Failed/BudgetExhausted）；Ready 执行实际只读检查、持久化/恢复观察，再通过正式 Complete 命令提交 Succeeded。所有 Owner 仍各自执行 CAS、当前权限、证据和租约验证。

准备回调有界取消；Ready 转交前失败会关闭目标，超时后迟到的目标也关闭。宿主不得额外配置独立 run.lease。配置、回调 receiver、授予引用与诊断保留设置在入口固定，Context 刷新不能换组织或执行人。异常/取消不会伪造 Job 成功或重置尝试，保留已经提交的 Running 供显式超时/取消/恢复路径处理；返回后租约生命周期完成清理。

真实安装夹具覆盖 Missing 的 Waiting→重试耗尽、真实检查成功、过期版本/终态拒绝、配置替换无效、无限准备回调受 Job 预算取消、运行进度保留及数据库超时收尾、取消后迟到真实连接关闭。证据见[Job 执行装配验证](verification-2026-09-09-pack-inspection-job-execution.json)。

本入口执行一个精确版本，不是队列消费者或默认生产服务。尚未装配持久发现/投递/确认、跨进程取消通知、一般异常失败、未到期失租恢复、doctor、完整领域/回填/投影验证及 Enable。本地时钟用于保守调度，提交时仍以各 Owner 的数据库时钟判定预算。

本批最终 Core 全量 469 项通过，无失败或跳过，包含预算超时和迟到真实目标连接关闭。类型、构建、API 与文档检查通过，隔离测试容器清理完成。


## 2026-09-09：巡检 Job 旧投递的当前进度解析

新增 PackInspectionJobOwner.readCurrent：以投递 Ref 为最低版本提示读取实际记录，拒绝未来版本，并复用组织隔离、管理上下文、存储字段一致性和当前准入检查；原 read 保持精确版本语义。

resolvePackInspectionDelivery 读取真实 Job 后区分 Execute、Progressed、Running、Terminal、Expire。只有投递版本与当前 Pending/Waiting 精确一致才返回 Execute；旧投递遇到新 Waiting 不直接启动下一次尝试。非终态预算使用数据库时间与既有累计耗时规则判定，超时优先交给正式 Expire 命令；终态同样需要宿主授权读取。结果只是快照，后续命令仍执行 CAS、权限和租约检查。

验证覆盖真实 PostgreSQL 中的精确可执行版本、旧版本推进、未来版本拒绝、Running 保留、绝对到期、运行耗尽时长、终态读取拒绝和跨租户隔离。本批不增加队列确认或自动重试；持久发现/投递/确认 Worker、一般异常失败、未到期失租恢复和取消通知仍待完成。不能把 Running 或 Progressed 当作执行成功，也不能仅凭此快照证明检查通过或 Enable。

本批定向测试 6 项通过，类型、构建、API 和文档检查通过；未重跑 Core 全量。证据见[当前进度解析验证](verification-2026-09-09-pack-inspection-delivery-resolution.json)。


## 2026-09-09：持久巡检 Job 管理恢复 Worker

新增 runPackInspectionJobWorker，并通过 TenantRuntimeOptions.packInspectionJobs 可选装配。Worker 从 extension.inspection_jobs 分页发现非终态，只保留宿主当前可见的 Job；即使空页也检查实际组织级 data-impact 管理 Grant 与发现准入。随后逐项读取当前进度，检查启动 Grant 与读取准入，再调用正式执行或到期命令。隐藏记录仍消耗扫描槽位，游标可在进程重建后从头恢复。

Pending/Waiting 的精确版本执行一次，下一轮扫描才发现后续 Waiting 版本；Running 未到期保持原状。租约竞争跳过本次候选，版本冲突必须重新读取并确认 Job 已推进才能跳过。准备超时后重新用数据库时间判定，实际预算耗尽则提交正式 Expire 与证据，其他异常继续交给运行时监督器。所有页面之间都有可取消间隔，不以循环计数、回调或游标保存业务进度。

宿主装配前固定回调 receiver、配置、Grant 与诊断参数，上下文刷新固定组织和执行人。停止时使用既有执行器的取消与租约清理；仍不保证跨进程取消已经到达所有活跃检查。发现、解析和执行各自有短事务，检查不进入 Inbox 消费事务。

这部分提供数据库恢复调度；尚未接入 Job 队列投递/确认，也未完成一般 InspectionFailed、未到期失租恢复、doctor、领域/回填/投影验证与 Enable。

本批 Core 全量 470 项通过，无失败或跳过，包含真实安装中的 Worker 重建继续 Waiting、预算超时正式收尾、Grant/发现准入拒绝和读取回调输入隔离；宿主验证配置固定、实例方法 receiver 和取消。类型、构建、API 与文档检查通过，隔离测试容器无残留。证据见[持久 Job Worker 验证](verification-2026-09-09-pack-inspection-job-worker.json)。


## 2026-09-09：巡检 Job 队列契约与冻结路由

JobEnvelope 新增 abh.pack-inspection-job.advance 与精确 PackInspectionJobRef；DurableExecutionPort.enqueue 登记该目标类型。关系校验要求事件 causeRef/version=1 与原始 commandRef/version=1，拒绝错误 Owner 目标、倒置时间窗口及 Mission/ExecutionAuthority。消息只传递调度意图，管理授权在执行入口重新获取。其他已有 Job 类型与 Wait Port 目标范围保持原契约。

createPackInspectionJobRouter 只接收实际已提交的 requested/wait 事件，在当前 runtime Service 组织范围回读事件并核对完整内容，派生目标版本、causation command、事件 cause 和 event/consumer 去重键。队列时间窗口来自数据库时钟，Waiting 带已安装的重试延迟；窗口不是业务预算。OutboxOwner 在当前发布准入下冻结路由，重放复用原消息。宿主配置与 consumerRef 在创建时固定。

pg-boss 将巡检推进消息映射到 background 队列，以已有原生交付身份、重放与确认机制传输，避免占用 control/reconcile 容量。此变化尚未提供巡检业务消费者；不可把队列适配器完成确认的测试视为真实检查完成。

后续仍需接入实际巡检消费者与 Owner 结果确认、处理长时间工作与 Inbox 短事务边界、可靠恢复和取消；现有数据库恢复 Worker 继续可独立装配。一般 InspectionFailed、未到期失租恢复、doctor、完整安装阶段、领域/回填/投影验证与 Enable 仍未完成。

本批 Contracts 全量 286 项、Core 真实安装/pg-boss 定向 13 项通过，均无失败或跳过；工作区类型、构建、API、49 项生成产物与文档检查通过，隔离测试容器无残留。未重跑 Core 全量。实际测试覆盖事件/命令/目标绑定、waiting 延迟、冻结路由复用、当前发布准入撤销、配置隔离和后台队列原生重放。证据见[巡检队列路由验证](verification-2026-09-09-pack-inspection-queue-routing.json)。


## 2026-09-09：巡检投递的可靠接收与执行衔接

新增不可变 PackInspectionDeliveryRecord，绑定组织、精确 Job 版本、源事件及摘要、原始命令、数据库接收时间和自身摘要。extension.inspection_deliveries 使用强制租户 RLS、仅 SELECT/INSERT、无 workspace/删除；事件唯一和 Job/version 唯一索引纳入 readiness，数据库清单升级为 54。完整身份 CHECK 拒绝缺字段，不能用孤立接收记录代替实际 Inbox。

createPackInspectionJobConsumer 作为标准 InstalledEventConsumer，只接收真实 requested/wait 事件，同时验证 abh.runtime.consume-event 和新的 abh.pack-inspection-jobs.accept-delivery 权限。它在 Inbox 的事务内调用 PackLoader 写接收记录、Audit 和 Outbox，全部成功后才允许 runDeliveryWorker 确认原生队列消息。接收不是 Succeeded；记录不授予管理执行权限，不启动租约或长时间检查。重放仍检查当前权限、事件内容和已有接收记录摘要。

PackInspectionJobWorker 默认 requireDelivery=true：Pending/Waiting 必须存在精确版本的接收记录及其已提交 Inbox，才进入既有管理权限、租约、Start/Wait/Complete 链路。旧请求版本的接收不能启动更新的 Waiting；Running 不重开；到期清理不要求接收记录。显式 requireDelivery=false 仅用于单独装配的管理恢复模式。Worker 的游标和进程重建不会改变业务预算。

宿主使用已有 publisher.router 接入 createPackInspectionJobRouter，将该 consumer 放入 background DeliveryWorker 的 consumers，并装配 packInspectionJobs。Runtime 的发布/消费/有限接收 Grant 与管理 Worker 的管理 Grant 分别验证；不复用运行时用途执行管理命令。实际检查继续在 Inbox 事务外运行，通过原有 Owner 保存终态与观察。

本批完成调度意图的发布、可靠接收、队列确认与管理执行衔接，不表示整个安装管线已完成。仍缺一般 InspectionFailed、未到期失租恢复、跨进程取消通知、doctor、统一生产配置与背压策略、完整安装阶段和领域/回填/投影验证及 Enable。接收记录、源事件和 Inbox 的清理必须保留未终结 Job 的恢复依据；本批没有实现清理器。

验证结果：Contracts 全量 287 项通过；Core 全量执行 472 项，其中 471 项通过，唯一失败是旧 Artifact 索引测试依赖清单第一项，已改为按名称选择并单独复测通过（未再重跑整个 Core）。真实链路覆盖原生发布/入队、Inbox 前故障全事务回滚、提交后确认、重复接收、权限撤销、接收记录篡改、精确版本门槛与实际后续检查。类型、构建、API、生成产物和文档检查通过，隔离测试容器无残留。结果与修复复测分别保留，见[可靠接收验证](verification-2026-09-09-pack-inspection-acceptance.json)。


## 2026-09-09：运行中巡检对已提交取消的持续观察

runPackInspectionJob 在正式 Running 后启动只读状态检查，按已配置 heartbeatMs 间隔、在当前同组织/执行人 Context 下检查精确 Running 版本。PackInspectionJobOwner.assertRunning 仅作为内部停止条件，读取最小版本/状态字段，不返回业务记录、不获取 Control/聚合写锁、不授予执行权限。租约心跳和各提交 Owner 继续独立执行实际权限、租约与 CAS 验证。

另一事务提交取消、超时收尾或其他版本变化后，状态检查中止当前准备/检查的有界信号；未主动返回的准备回调不再使 Worker 等到整个 Job 预算耗尽。迟到 Ready 的真实目标沿用既有关闭路径。提交 Wait/Complete 前停止并等待状态检查退出，之后以 Owner CAS 处理竞争，避免将自身正常状态提交当作外部取消。

任务退出前等待检查循环停止，再清理租约；父任务、预算或租约本身的取消保留原错误语义，不被轮询 delay 的 AbortError 替换。这是对持久取消事实的轮询响应，时效受轮询间隔、上下文获取和数据库有界访问影响；并非立即杀死远程进程，也不证明对方已停止全部工作。正式取消预算仍按取消证据中的数据库判定时刻结算。

一般 InspectionFailed、未到期失租恢复、doctor、生产背压和完整安装/领域验证管线仍待完成。

本批定向 2 项、Core 全量 472 项通过，均无失败或跳过。实际独立事务取消覆盖不返回的准备回调、未触发父级 AbortSignal 的 Worker 停止、迟到真实目标只关闭一次、租约释放及无成功事件；原有正常完成、等待和预算超时链路继续通过。类型、构建、API、文档检查通过，隔离测试容器无残留。证据见[运行状态检查验证](verification-2026-09-09-pack-inspection-progress-watch.json)。


## 2026-09-09：未到期失租的正式失败与可选恢复装配

新增 PackInspectionLeaseLossEvidence 和内部 fail-lost-lease 命令及独立管理权限。证据保存原 Running Job、同一安装目标的实际租约快照、数据库判定时刻、累计耗时、Expired/Replaced 原因及最终诊断。校验原租约身份、版本/token 单调关系、同 token 的 worker 绑定和微秒级到期边界；只有续约导致版本推进而 token 仍有效时，不允许判为失租。

WorkLeaseOwner.observe 在与认领/续约相同的目标锁下读取租约，再读取数据库时间；没有租约行不能作为失租证明。读取同时补上 leaseRef.id 与物理行 id 的一致性校验。failLostPackInspection 在现有 Control、Deployment、Job 和租约锁顺序下调用观察，原子写失败 Artifact、Failed、Receipt、Audit 与 Outbox；保留全部 Running 累计耗时。若判定时已经时长超支或到绝对期限，诊断保留 BudgetExhausted/Expired，否则为 InspectionFailed。终态不重开，也不释放后来接管者的租约。

重放验证实际保存的诊断内容、原 Job 与租约绑定、预算推导、Artifact 字节和当前准入，不要求历史租约仍存活。PackInspectionJobWorker 可显式安装 leaseLoss 准入；Running 候选会调用正式失租检查，只有明确的仍有效租约结果被视为正常保留，其他权限或完整性错误继续上抛。未安装此选项时保留既有到期恢复行为。新 leaseLost 页面计数不作为业务事实。

本批收尾依据是租约过期/被替换，不是异常消息或队列超时；不证明旧进程或远程工作已经停止。一般 InspectionFailed 异常来源、doctor、生产配置/背压、完整安装阶段和领域/回填/投影验证及 Enable 仍待完成。

本批 Contracts 全量 288 项、Core 全量 473 项通过，无失败或跳过；真实安装用例覆盖有效续约拒绝、到期前失租失败、接管后旧 Job 收尾且保留新租约、最终准入回滚、幂等单一失败事件、终态禁止重开及恢复 Worker 不重新准备旧尝试。租约行引用篡改测试通过。工作区类型、Contracts/Core 构建、API、生成产物和文档检查通过，隔离测试容器无残留。证据见[失租恢复验证](verification-2026-09-09-pack-inspection-lease-loss.json)。


## 2026-09-09：巡检诊断查询后端

新增内部 inspectPackInspectionJob，作为后续 doctor 的查询后端。在当前 Service 管理 Context、组织级 data-impact 管理 Grant 和宿主当前准入下，读取当前精确 Job；按既有 Deployment/Job/租约锁顺序观察状态，验证已提交 Inbox 接收记录与实际结果 Artifact 字节，仅返回引用及预算摘要。

输出区分 AwaitDelivery、AttemptExecution、ObserveRunning、SettleExpired、SettleLostLease、Terminal，并给出实际当前 Job Ref、已接收记录/租约/证据 Ref、失租原因、数据库判定时间和累计/剩余预算。旧版本提示可解析到最新进度，未来版本拒绝。终态耗时固定为已提交预算，不继续累计；还有剩余预算也不能重开终态。下一步是诊断建议，执行仍需对应命令的当前权限与 CAS；并发提交可在诊断后改变条件。

查询不写业务记录、Receipt、Audit、Outbox，不续租、不入队、不执行修复；当前准入与结果证据读取权限在每次调用中验证。它不证明检查语义完整、Enable 或远程工作已停止。本批未提供 abh doctor CLI/HTTP 路由或生产运维 UI，也未实现一般异常失败。

真实签名安装链路定向测试通过，覆盖全部六种诊断建议、回调输入隔离、当前权限/证据拒绝、未来版本拒绝和业务记录不变；未收到投递但到期的 Pending 通过正式 Worker 收尾，尝试和累计耗时均为零。类型、构建、API、文档检查通过，隔离容器无残留；本批未重跑 Core 全量。证据见[巡检诊断验证](verification-2026-09-09-pack-inspection-diagnostic.json)。


## 2026-09-09：恢复 Worker 不再依赖启动权限

修复 PackInspectionJobWorker 的进度解析提前检查 start Grant，导致只有到期/失租清理权限的服务无法恢复任务的问题。解析现在检查组织级 data-impact 发现权限和既有宿主读取准入，执行分支仍交给 runPackInspectionJob 检查 Start、实际安装与租约；到期和失租分支分别由正式 Owner 验证各自独立权限。发现授权不允许开始新尝试。

真实夹具分别签发不含 Start 的 expiry-only 和 lease-loss-only 管理 Grant（均保留发现权限），验证未投递到期 Pending 和失租 Running 能正式收尾。同时尝试以 expiry-only Grant 执行未到期 Pending，必须在准备之前拒绝，状态与尝试数保持原值。

本批修复权限装配，不扩展一般异常失败、doctor CLI 或完整安装验证的完成范围。

真实安装链路定向测试通过，确认仅清理授权能够收尾对应任务、不能启动新尝试；类型、构建、API 和文档检查通过，隔离容器无残留。本批未重跑 Core 全量。证据见[恢复权限验证](verification-2026-09-09-pack-inspection-recovery-authority.json)。


## 2026-09-09：巡检与共享租户运行时的统一装配

新增内部 installPackInspectionRuntime，接收现有 TenantRuntimeOptions 和巡检安装配置，输出可交给 createTenantRuntimeLoops/runTenantRuntime 的完整配置。它把巡检 requested/wait 路由合入现有 Publisher，使用宿主指定的新组合规则 Ref；把可靠接收消费者合入唯一 background DeliveryWorker；安装固定配置的管理 Job Worker，并强制 requireDelivery=true。

该入口保留一个共享 Publisher 和一个 background 原生领取器，避免独立循环竞争彼此的冻结路由或队列消息。已有消费者和路由继续按原订阅处理，未知事件拒绝；已有巡检 Worker、重复巡检消费者、重叠事件订阅、缺失或多个 background 领取器在装配时拒绝。巡检投递使用独立 runtime Context 并核对消息组织；现有租户宿主继续把各循环绑定到同一组织。

在装配时固定巡检 Worker、Grant、回调 receiver、消费配置和发布入口。创建配置不打开连接、不启动工作、不关闭依赖；宿主原有监督器和 drain 管理生命周期。队列准入目录仍须由宿主登记 abh.pack-inspection-job.advance 及对应 runtime Grants；管理 Worker 的执行/恢复权限继续由各 Owner 检查。本批没有自动签发权限或生成生产连接配置。

验证范围为配置合并、拒绝冲突、原订阅保留、配置替换隔离、组织拒绝与有界停止；实际队列和 Owner 行为沿用此前链路，未将配置测试算作新的端到端数据库验证。一般异常失败、doctor CLI、生产配置/背压及完整安装验证仍待实现。

本批配置/宿主定向测试 9 项通过，无失败或跳过；类型、构建、API、文档检查通过。未重跑 Core 全量或新增数据库端到端测试。证据见[共享运行时装配验证](verification-2026-09-09-pack-inspection-installation.json)。


## 2026-09-09：真实共享运行时、扩展存储启动检查与锁竞争恢复

完整巡检夹具使用新建 runtime 连接、真实 pg-boss 队列和独立运行时 Grant，同时启动 Publisher、Delivery、InspectionJob、Recovery、Consumption 五个循环。验证 requested 事件的冻结路由、持久 Inbox 接收、一次真实签名／目标检查、Succeeded 观察记录、消费覆盖和租约释放；在传输空闲边界停止并检查实际 drain 结果。强制取消已领取工作时保留 remainingRefs 的语义沿用独立关闭测试。

新连接暴露已迁移 Pack 表被启动检查误认作未登记表的问题。现在只有维护登记与实际所有权一致、角色非特权且无角色继承、runtime／queue／verifier 对 Schema、表、列、序列均无访问权的隔离 Pack 存储可通过检查。授权漂移、错误所有者与损坏登记拒绝启动。这不是扩展业务表准入、迁移完整性证明或 Enable；扩展函数仍受原函数清单约束。

实际签名检查持有 Control fence 时，可靠消费者曾因正常锁竞争超时退出。增加显式数据库冲突恢复，仅装配在可幂等恢复的发布、消费和消费覆盖操作；识别 PostgreSQL 55P03／40P01／40001，初次之后最多三次，按 1／2／4 秒基线加入有界抖动并受总期限和取消信号约束。每次重新读取当前权限与持久事实。不会自动重跑队列领取／确认、外部 Provider 副作用或巡检尝试；不放宽数据库锁超时。

生产凭据与宿主配置、一般检查异常证据、doctor CLI、背压及完整安装验证／Enable 仍有缺口。

本批 Core 全量运行 480 项：479 通过，1 项在 Docker 端口绑定阶段超时、未进入业务断言；该 Artifact 索引测试单独补跑通过。真实共享运行时端到端、隔离 Pack 存储启动检查与冲突重试定向验证通过；类型、构建、API、文档检查通过。全量首次失败与补跑日志均保留，未将首次运行记作全绿。证据见[共享运行时真实验证](verification-2026-09-09-pack-inspection-runtime.json)。


## 2026-09-09：可执行的只读数据库 doctor

新增工作区 @abh/cli 与 abh bin，仓库可通过 pnpm abh doctor data 调用。该命令通过公开的 @abh/core/diagnostics 入口检查真实 PostgreSQL 安全清单，专用连接固定只读、单连接、语句和总期限，结束或 SIGINT／SIGTERM 时关闭连接。它不加载迁移凭据、不执行修复，也不读取租户业务行。

连接仅来自显式 ABH_DATABASE_RUNTIME_URL。URL 必须声明主机、用户和数据库，只接受 sslmode=disable／require／verify-full；未知或重复查询参数及 fragment 拒绝，PG* 环境不会重定向连接或覆盖只读／日志设置。CLI 拒绝未知命令、未知／重复 flag 和非法超时，JSON 与稳定错误码日志分别输出到 stdout／stderr。退出码覆盖成功、输入配置、权限、前置清单和依赖错误。

DatabaseDiagnosticResult 与 CliDoctorDataResult 登记在事实 Schema，经统一生成器产生类型和校验器；Core 复用生成类型，CLI 在输出前验证合同。成功结果禁止错误或违规项，只有清单不匹配可带正违规项计数。只读诊断的 commandRef 固定为 null、evidenceRefs 固定为空，不生成虚假回执／证据。普通日志和结果不含原始数据库错误、SQL、连接 URL 或目录对象名称。

本批只提供 doctor data。doctor pack／operation、完整配置 Schema、Secret Ref 解析、init／dev、Pack 操作、升级／导入导出与发行打包仍未完成；既有巡检内部诊断后端尚未接入 CLI。完整 V1 目标保持未完成。

本批契约全量 290 项通过，Core 真实诊断测试 2 项、CLI 测试 2 项通过；工作区构建、类型／CLI 语法、生成漂移、API 和文档检查通过。Core 公开 API 为 3 个入口，Contract Package 保持 9 个入口。实际 SIGTERM 测试验证阻塞诊断退出码为 6、输出 DEPENDENCY_TIMEOUT 且连接关闭；隔离容器无残留。本批未重跑 Core 全量。证据见[doctor data 验证](verification-2026-09-09-doctor-data.json)。


## 2026-09-09：巡检诊断 HTTP 与公开 SDK

登记 PackInspectionDiagnostic、PackInspectionDiagnosticResponse 与 abh.pack-inspection-jobs.inspect 查询合同，公开 GET /v1/queries/abh.pack-inspection-jobs.inspect?id=...。CoreHttpInstallation.packInspectionDiagnostic 必须显式提供候选 Grant 解析与当前部署／证据准入，默认没有该路由。HTTP 使用真实 IdentityIngress，后端继续要求同组织 Service、abh.pack.manage 用途、组织级 data-impact 发现权限与当前 Artifact 读取准入。

每次查询从当前 Job 版本解析 AwaitDelivery／AttemptExecution／ObserveRunning／SettleExpired／SettleLostLease／Terminal；合同约束状态、实际 lease／delivery Ref 和非负预算，不输出证据正文。权限拒绝与不可见 Job 返回 RESOURCE_NOT_FOUND，认证失败仍走统一身份入口。支持默认与 Strong，Projection 返回 SCHEMA_UNSUPPORTED。QueryMeta.asOf 使用同次数据库评估时间，pack-inspection-source 摘要仅为该次来源结果指纹，不是连续消费水位或修复权限。

公开客户端新增 packInspections.inspect({id, consistency?}, options?)，复用原有认证头、截止时间、取消、响应字节上限、禁止重定向和生成协议校验。安装时固定诊断回调并保留 receiver，替换宿主配置不能重定向已创建的应用。查询不提交 Receipt、Audit、Outbox，不修改 Job 或租约。

同时移除查询权限生成器按 Owner 在 Action／Decision 间猜测目标与用途的逻辑，全部查询显式登记 targetTypes／purposeNames。生成器拒绝缺失、未知登记或借查询扩大既有内部 action 的授权范围。巡检查询沿用现有 data-impact 发现权限，没有被错误合并进 Action 准备用途。

本批实现 HTTP／SDK 诊断查询；CLI doctor inspection／pack、真实生产 IdP 与凭据配置、一般异常失败证据及完整安装验证仍未完成。HTTP 夹具使用显式测试 IdP 和数据库中的真实身份／Grant／Pending Job，不能作为生产 IdP 或 Pack 已安装验证证据。

本批契约全量 292 项、HTTP／SDK 定向 13 项、真实签名巡检链路 1 项通过，无失败或跳过。构建、Core 类型、生成漂移、API 和文档检查通过；隔离容器无残留。本批未重跑 Core 全量。证据见[巡检查询验证](verification-2026-09-09-inspection-query.json)。


## 2026-09-09：巡检 Job 的可执行 CLI 诊断

新增 abh doctor inspection --id <Job UUID>，经公开 SDK 对已安装的巡检 HTTP 路由发起 Strong 查询。命令只读取显式 ABH_API_BASE_URL／ABH_API_TOKEN，不接收 actor、Purpose、Grant 或修复参数；API 负责真实身份与组织绑定。HTTPS 或显式 loopback HTTP 可用，URL 内嵌凭据、查询串、fragment 和重定向拒绝，响应限制为 64 KiB，超时／取消有界且无自动重试。

返回的 Job 必须匹配请求，Strong 响应不得 stale，元数据时间须与诊断评估时间一致。CLI 输出采用统一生成的 CliInspectionDiagnosticResult，并检查顶层 evidenceRefs 与诊断中已有证据 Ref 完全一致；commandRef 始终为 null。文本输出提供实际 Job 状态、评估时间、预算、Refs 和独立授权的下一步建议，JSON 保留结构化诊断。

成功读取为 Reported／退出码 0，不能将其解释为 Job 成功、验证通过或 Enable；终态 Failed 也会如实 Reported。诊断调用失败则不返回 Job 或证据，输入配置／身份权限／前置兼容／依赖分别映射 2／3／4／6。错误不包含 API Token、响应正文或原始异常。命令不会入队、续租、取消 Job 或调用修复 Owner。

真实集成在隔离数据库与 HTTP 服务上启动 CLI 子进程，确认取得当前 Pending Job、Grant 撤销后返回不可见错误，以及 Receipt／Audit／Outbox／Job 均未变化。测试 IdP 仍为显式夹具，不能视为生产身份提供方验证。网络测试覆盖错误 Job、时间不一致、stale、超大／非法响应、重定向、超时与预取消。

该命令查询巡检 Job；完整 doctor pack 仍须汇总签名、CTK、能力、迁移和引用等各阶段阻塞，不能把巡检 Job 报告当作其替代。生产凭据／Secret Ref、一般异常失败证据、完整安装与其他 V1 设计仍未完成。

本批契约全量 293 项、CLI 测试 3 项、真实 HTTP／数据库／CLI 子进程集成 1 项通过，无失败或跳过。工作区构建、类型／CLI 语法、生成漂移、API 和文档检查通过；隔离容器无残留。本批未重跑 Core 全量或签名链路。证据见[巡检 CLI 验证](verification-2026-09-09-doctor-inspection.json)。


## 2026-09-09：检查失败与目标清理失败分别保留

修复 inspectMigrationTarget 在检查已失败时忽略目标清理未确认，以及 runInstalledMigrationInspection／runPackInspectionJob 在 finally 中用清理超时覆盖原始失败的问题。统一的 requireMigrationInspectionDisposal 保持一次有界清理：清理成功时原样抛出原始失败；检查与清理同时失败时保留为 AggregateError 的两个独立条目；只有清理失败则返回 MigrationInspectionCleanupError（稳定 DEPENDENCY_TIMEOUT 码）。undefined、null 和字符串等非 Error 抛出值也保留。

清理未确认不会返回成功观察；一秒清理等待结束后的迟到确认也不会改变已返回的失败。CleanupError 仅说明没有收到清理确认，不证明连接仍存活或任意远程工作已停止。清理回调的原始错误细节不进入新增错误消息，检查原始错误仍只用于内部诊断。

本批没有将一般异常自动持久化成 Failed，也没有把异常当作独立清理权限。双重失败后的 Running Job 仍需正式 Owner 根据当前 Grant、版本和数据库租约／期限事实处理；一般异常证据、迟到准备结果清理失败的持久报告以及完整安装验证仍未完成。

本批目标检查／清理定向 16 项和真实签名巡检链路 1 项通过，无失败或跳过。实际 Job 双重失败保留 INVALID_ARGUMENT 与独立 CleanupError，目标仅清理一次，Job 保持 Running；随后以当前 Grant 和真实已释放租约调用失租 Owner 正式收尾。类型、构建、API 和文档检查通过，隔离容器无残留；本批未重跑 Core 全量。证据见[检查与清理失败验证](verification-2026-09-09-inspection-failure-cleanup.json)。


## 2026-09-09：实际巡检异常的正式失败入口

新增内部 FailPackInspectionCommand、独立 abh.pack-inspection-jobs.fail 权限及 PackInspectionFailureEvidence。执行观察器只对实际拒绝的异步尝试生成进程私有能力，克隆／序列化对象不具有提交资格。证据包含原 Running Job、Preparation／Inspection／Completion 阶段、受限故障分类、清理未确认标记和数据库评估时间，不保存异常消息、堆栈、SQL 或凭据。

failPackInspection 在 Control fences、Deployment、Job 和当前租约锁下校验当前管理权限、实际安装、Job 版本、原 worker／fencing token 与完整 Running 快照。Artifact、Failed Job、Receipt、Audit 和 Outbox 同事务提交；重放重读真实证据字节并重新授权，接管租约不能替旧执行重放。保留累计尝试和耗时，预算耗尽／绝对到期优先于 InspectionFailed；最终准入耗时也计入 Job，不增加额外版本。

runPackInspectionJob 可显式安装 failure 准入，Worker 和共享运行时装配固定回调及 receiver。执行器等待目标清理后捕获失败，只有独立失败 Grant 与当前租约均有效才正式收尾；父级取消、失租、并发终态或失败准入拒绝不产生新的授权。失败提交被拒绝时同时保留原始异常与提交异常。未安装 failure 的调用者保持显式恢复行为。

cleanupUnacknowledged=false 仅表示本次已捕获异常未携带清理未确认标记，不能证明任意远程工作已停止。迟到准备结果的清理失败持久报告、完整 doctor pack、生产身份／Secret 配置、完整安装验证与其余 V1 模块仍有缺口，本批不宣告 ABH 全部完成。

本批定向测试 23 项、契约全量 293 项、最终真实签名／Job／共享运行时集成 1 项通过，无失败或跳过。真实集成覆盖回滚、重放、伪造能力、错误 worker、权限拒绝、准备与完成阶段失败，以及实际目标双重失败后的清理标记。构建、类型、49 文件生成一致性、API 和文档检查通过；未重跑 Core 全量。证据见[实际巡检失败验证](verification-2026-09-09-inspection-failure.json)。


## 2026-09-09：巡检失败权限边界与不透明异常

为新失败入口增加真实数据库边界验证：执行 Grant 可启动巡检但缺少 fail action 时，失败收尾必须返回 FORBIDDEN；父级取消或原租约已释放时不得用故障记录换取独立收尾权限。失败提交拒绝后保留 Running 版本、累计尝试和两项异常，不产生失败事件；夹具随后通过真实已释放租约和独立恢复 Owner 收尾。

并发正式取消覆盖有／无 failure 装配及迟到 Ready 目标四种组合，要求停止观察、目标只清理一次、Cancelled 版本保持不变且不发布 succeed／fail 事件。

修复故障分类读取异常属性时可能再次抛错、覆盖原始异常的问题。分类仅检查自有数据属性，不调用 code／errors 子项访问器或迭代器；撤销 Proxy 或不可读取的异常退化为 UnexpectedFailure，原始抛出值仍保留。嵌套清理标记按有界扫描提取，不扩展为任意远程停止证明。

本批不改变失败命令授权语义，迟到清理失败的持久报告与完整安装验证仍待实现。

本批异常／清理定向 6 项和最终真实签名／Job／共享运行时集成 1 项通过，无跳过。首轮集成因将有效但 action 不匹配的 Grant 预期为 AUTHORITY_REQUIRED 而失败；核对 Grant Owner 后改为 FORBIDDEN，补跑通过，原始日志保留。构建、类型、API 和文档检查通过；未重跑 Core 或 Contracts 全量。证据见[失败权限边界验证](verification-2026-09-09-inspection-failure-boundaries.json)。


## 2026-09-09：巡检各 Owner 的独立 Grant 装配

新增 PackInspectionJobExecution.grantSets，显式选择 start、waiting、completion、failure、discovery、expiry、leaseLoss 各入口的 Grant 列表；未配置某项时沿用原 grants，显式空列表保持拒绝。基础 grants 继续负责工作租约，不把不同 action 的独立 Grant 合并后交给要求每项均适用的 Control 校验。执行器、管理恢复 Worker 与共享运行时装配均复制配置；动作名、Grant Ref 类型、重复项和数量在装配／直接执行入口校验。

实际使用不同租约与检查 Grant 时暴露检查事务在部署锁之后才申请租约 Control fence 的顺序问题。InstalledMigrationInspectionRun 可声明 fenceRefs，preparePackInspection 自动包含检查 Grant，并允许 inspectionFenceRefs 提供选择／治理所需的其他 Control fences；检查开始前将这些声明与组织、主体、租约 Grant 一次按规范顺序锁定，末尾仍校验实际当前租约。新声明不替代当前权限、安装或证据检查。

实际夹具分别签发基础 data-impact、start、completion 和 fail Grant，验证执行与失败提交不必共享全动作 Grant；恢复 Worker 以空基础 grants 和显式 discovery／expiry／leaseLoss 集合执行独立清理。显式 failure 空列表不能借默认完整 Grant 回退。本批未实现迟到清理失败持久报告或完整安装验证。

本批定向 20 项、最终真实签名／Job／共享运行时集成 1 项通过，无跳过。首轮真实集成暴露独立租约 Grant 的 Control 锁顺序问题，修复声明与预锁后补跑通过；保留首次失败及最终日志。构建、类型和 API 检查通过，隔离集成容器无残留；未重跑 Core 或 Contracts 全量。证据见[独立 Grant 装配验证](verification-2026-09-09-inspection-grant-sets.json)。


## 2026-09-09：独立检查的治理 fence 与目标清理

修复 runInstalledMigrationInspection 在未配置 lease 时忽略 fenceRefs 声明的问题。独立调用与租约调用均在目标检查前锁定所声明的 Control fences；未声明且无租约的既有路径保持原有 Owner 准入。fence 声明或实际预锁拒绝时，目标尚未移交给检查器，由工作流负责一次有界清理，不进入检查 SQL；清理同时失败时保留原始准入异常与独立 CleanupError。

真实连接测试覆盖声明回调拒绝、声明不存在的 Grant fence、以及准入与目标清理同时失败，核对检查回调没有执行且目标只清理一次。本批未重跑签名全链路或 Core 全量，独立路径治理修复不代表完整 Pack 安装验证完成。

本批实际目标检查 15 项通过，无失败或跳过；Core 构建、最终类型和 API 检查通过，隔离容器无残留。首次类型检查发现测试抛错方法返回类型推断不匹配，显式标注 Promise<never> 后通过，日志保留。证据见[独立检查 fence 验证](verification-2026-09-09-inspection-standalone-fences.json)。


## 2026-09-09：巡检结果读取按实际收尾权限校验

修复 runPackInspectionJob 在 Wait／Complete／Fail 提交后仍使用 Start Grant 读取结果的问题。启动前后保持 Start 校验；Waiting、Succeeded、Failed 的最终精确版本读取分别使用对应动作 Grant，并继续执行当前 read 准入和实际安装检查。独立失败权限不会因已撤销的 Start Grant 丢失返回已提交结果的能力，也不获得重启权限。

成功 Wait／Complete 的结果读取移出实际执行异常观察器。若该读取因当前权限或版本变更而失败，直接保留读取异常，避免将提交后的读取问题包装为新的执行故障并尝试覆盖已提交终态。失败提交后的读取仍保留原始执行错误与后续读取错误，实际数据库状态保持权威。

增加真实场景：进入 Running 后撤销独立 Start Grant，仍以独立失败 Grant 收尾并读取 Failed；成功提交后的 read 拒绝应返回原始拒绝、保持 Succeeded 且不进入失败准入或新增 fail 事件。本批不补授权限，不放宽原 Owner 的租约、当前安装与版本检查。

本批最终真实签名／Job／共享运行时集成 1 项通过，无跳过；构建、类型和 API 检查通过，隔离容器无残留。增加提交后读拒绝断言后的首次整链路运行，在后续原有用例中遇到 CTK 测试证据超过 120 秒有效期；将夹具 conformance maxAgeMs 对齐已有 180 秒 Grant 窗口后补跑通过，生产有效期校验未修改，失败日志保留。本批未重跑 Core／Contracts 全量。证据见[巡检结果权限验证](verification-2026-09-09-inspection-result-authority.json)。


## 2026-09-09：已安装 Pack 的持久不适用报告

新增内部 recordMigrationNonApplicability，补齐 V1 Pack Loader 对“无迁移且无既有数据／投影变化时保存不适用报告”的要求。入口通过 prepareInstalledPack 恢复真实 staged 文件、当前签名影响报告与独立编译器清单，仅 NotApplicable 可生成报告；Incomplete 或无 SQL 但有定义／投影变化的 DataVerificationRequired 均拒绝。

报告为 application/json Artifact，规范 envelope 为 abh-pack-migration-not-applicable-v1，正文保存已验证 PackDataImpactRecord，绑定安装 Ref、packageDigest、环境／部署版本、完整前后清单和来源。使用既有 Inline Artifact Owner 将报告与 Receipt／Audit／Outbox 原子提交，不创建 SQL 连接、空迁移或副本 Job。命令身份与影响 Ref／保留配置绑定；重放重读真实 Artifact 字节并检查 owner、sources、用途、区域和保留配置，前后重新执行当前影响／信任／来源权限验证。

真实 Cosign／数据库测试覆盖报告正文、原始安装绑定、重复提交、读取拒绝事务回滚、缺失 Grant、来源撤回后重放拒绝、不完整清单拒绝和投影变化拒绝。该报告只证明经过检查的不适用结论，Enable、安装审批及完整能力 Registry 仍需后续 Owner 装配，不能把报告发布当成已启用。

本批真实 Cosign／数据库集成 1 项通过，无失败或跳过；Core 构建、类型和 API 检查通过，隔离容器无残留。本批未重跑 Core／Contracts 全量或迁移签名巡检链路。证据见[迁移不适用报告验证](verification-2026-09-09-migration-non-applicability.json)。


## 2026-09-09：不适用报告的当前状态复核读取

新增 readMigrationNonApplicability，供后续安装 Owner 在同一 UoW 消费不适用报告。调用方必须提供预期影响 Ref，入口先恢复当前签名影响、实际 staged 文件及完整清单结论，再锁定报告 Artifact，核对真实正文、owner、sources 和用途。报告正文必须等于当前重新验证的规范化 PackDataImpactRecord；标签正确或 Artifact 元数据正确不能替代正文验证。

读取执行报告访问与保留／引用准入，返回前再次复核当前影响与安装，来源在读取回调期间撤回同样拒绝。返回当前 installation／impact 与报告 Ref，不写状态，不创建 SQL 或发放 Enable 权限。调用方仍需完成安装审批及其他适用门禁，后续不能仅凭返回对象副本当作提交授权。

真实 Cosign／数据库验证覆盖有效读取、缺少 Grant、错误报告 Ref、报告访问拒绝、来源撤回与最终回调撤回；新增实际 Artifact 验证元数据正确但部署字段替换或非规范 JSON 正文均拒绝。

本批最终真实 Cosign／数据库集成 1 项通过，无失败或跳过；Core 构建、最终类型和 API 检查通过，隔离容器无残留。未重跑 Core／Contracts 全量或迁移巡检签名链路。证据见[不适用报告读取验证](verification-2026-09-09-migration-non-applicability-read.json)。


## 2026-09-09：不适用报告的有界唯一候选发现

新增 selectMigrationNonApplicability，按调用方指定的当前影响 Ref 恢复真实 staged 内容、签名影响和完整清单，再按精确安装 owner／来源集合扫描已保存 Artifact。扫描上限 1～100，默认 20；零候选完整扫描为 Missing，唯一候选完整扫描为 Selected，多份有效报告为 Ambiguous，未扫描完且不足以确定歧义时为 Incomplete。不按时间或 UUID 选取最新／首份报告。

无报告时也执行当前部署发现权限；每份实际 Artifact 读取与引用准入均检查，元数据正确但标记为不适用且正文错误的报告拒绝，不悄悄跳过。相同来源的其他 JSON 消耗扫描额度但不成为候选。扫描结束再次执行发现准入和当前影响／安装复核。函数不写状态，结果仅是恢复提示；消费 Owner 仍须在自己的提交 UoW 中调用 readMigrationNonApplicability，不能把一次查询视为持久唯一性或 Enable 权限。

真实 Cosign／数据库覆盖 Missing、Selected、Ambiguous、扫描截断 Incomplete、无关 JSON、发现准入前后拒绝、缺失 Grant、来源撤回和篡改正文拒绝。本批继续保留 Enable／安装审批及完整能力 Registry 的缺口。

本批最终真实 Cosign／数据库集成 1 项通过，无失败或跳过；Core 构建、最终类型与 API 检查通过，隔离容器无残留。未重跑 Core／Contracts 全量或迁移签名巡检链路。证据见[不适用报告发现验证](verification-2026-09-09-migration-non-applicability-selection.json)。


## 2026-09-09：迁移不适用报告的专用生成契约

新增 PackMigrationNonApplicabilityReport，复用 PackDataImpactRecord 的完整安装／环境／编译器／来源／有效期绑定，同时要求前后清单 complete、impact.status=NotApplicable、changes／migrationRefs／reasons 均为空。关系校验要求前后定义集合完全一致，忽略条目顺序；不能只伪造相同清单摘要掩盖不同内容。保留编译器类型、时间顺序、清单唯一性和影响摘要等原关系约束。

报告生成、复核读取和候选发现共同调用该契约；持久 JSON envelope 与此前字节格式兼容。契约只表达可检验的结构／关系，实际签名、来源、摘要重算和当前部署仍由 Owner 负责。未将 Schema 通过视为不适用证明或 Enable 权限。

契约测试覆盖不完整清单、声明迁移、定义变化、不同清单但伪造相同摘要、错误编译器、无效有效期、未知字段，以及相同集合不同顺序。

本批契约全量 295 项、真实 Cosign／数据库集成 1 项通过，无失败或跳过。工作区构建、Core 类型、49 文件生成一致性、Contracts 9／Core 3 入口 API 检查通过，隔离容器无残留。未重跑 Core 全量或迁移巡检签名链路。证据见[不适用专用契约验证](verification-2026-09-09-non-applicability-contract.json)。


## 2026-09-09：已安装影响验证保留子操作取消信号

修复 prepareInstalledPack／recoverImpactCheckedPack 和内部影响检查将调用方 signal 替换为 tx.signal 的问题。现在合并调用方与事务取消信号，并在进入恢复前检查子操作截止时间；来源、当前治理和签名回调边界重新检查预算，取消后不继续后续内容／签名验证或返回不适用结论。

真实数据库测试使用仍然有效的外层事务，分别验证预取消不会调用治理回调，来源回调取消和签名回调取消均返回 DEPENDENCY_TIMEOUT，外层 tx.signal 未取消。取消只终止这次读取／准备，不人为关闭宿主持有的事务。本批处理已安装影响恢复路径；其他底层迁移准备／签名辅助函数中的独立 signal 转发仍需逐项审计。

首次改动误将预算检查插入两个局部变量尚未定义的位置，类型检查和集成拒绝；修正插入位置后通过，原始失败日志保留。

本批最终真实 Cosign／数据库集成 1 项通过，无跳过；Core 构建、最终类型和 API 检查通过，隔离容器无残留。未重跑 Core／Contracts 全量或迁移签名巡检链路。证据见[已安装影响取消验证](verification-2026-09-09-installed-impact-cancellation.json)。


## 2026-09-09：迁移底层辅助函数保留子操作取消

新增 migrationWorkOptions，复制调用预算并合并 options.signal 与 tx.signal，预先拒绝已取消、非安全整数或已过期截止时间。替换 prepareDatabaseMigration、prepareMigrationContent、readSignedMigrationPlan、verifyStoredMigrationSignature、readSignedMigrationExecutionResult、StagePack 内容恢复与 recoverStagedPack 的七处信号覆盖。保留原较短截止时间，不把子操作延长为外层事务生命周期。

真实签名夹具在活跃外层事务中验证预取消签名读取不进入 signer、来源回调取消后不返回证明、预取消数据库准备不执行授权回调；外层事务仍有效。单元验证两个方向的取消传播、预算快照及非法时间；staging／影响报告链路单独回归。

本批解决已识别的直接信号覆盖，不宣称所有宿主回调均可强制终止；任意不响应取消的远程副作用、迟到清理报告和完整安装 Enable 仍需独立处理。

本批预算单元 2 项、真实 staging／影响报告集成 1 项、真实迁移签名／巡检链路 1 项通过，无失败或跳过；Core 构建、最终类型和 API 检查通过，隔离容器无残留。未重跑 Core／Contracts 全量。证据见[迁移子操作取消验证](verification-2026-09-09-migration-child-cancellation.json)。


## 2026-09-09：签名读取在回调取消后停止后续工作

在持久迁移签名与执行结果签名读取中补充回调前后预算检查，复用 assertMigrationWorkActive。锁来源后、取得 signer 配置后、每次来源准入后和最终重新检查 signer 前后均保持子操作截止时间与取消约束，避免回调已触发取消却仍调用后续来源／signer。原始来源拒绝仍直接传播，外层事务不被子操作主动取消。

真实签名测试断言首次 signer 触发取消时来源调用数为零，签名完成后的来源回调触发取消时不再进行第二次 signer 调用。执行结果签名读取应用同一检查边界，既有真实执行结果签名链路继续回归；本批不声称可强制终止不合作的宿主回调。

本批预算单元 2 项和真实迁移签名／巡检集成 1 项通过，无失败或跳过；Core 构建、类型和 API 检查通过，隔离容器无残留。未重跑 Core／Contracts 全量。证据见[签名回调取消验证](verification-2026-09-09-migration-callback-stop.json)。


## 2026-09-09：整份迁移计划的回调取消边界

readSignedMigrationPlan 在计划校验与来源锁之后、每次 reportSource／supportingFacts 回调前后、以及刷新证据前检查当前子操作预算。来源准入触发取消时不进入签名读取，支撑事实触发取消时不读取下一份证据或刷新旧签名。固定来源、支撑事实、签名回调及 receiver，验证期间替换 admission 方法不改变本次已安装的回调；有效期配置仍在返回前检查是否变更。

真实签名测试在活跃外层事务内分别于首份来源和首份支撑事实取消，精确检查 sources／facts／signers 调用数量，确认外层事务不因子操作取消失效。该处理不替代当前治理、签名或支撑事实验证，也不证明不合作的外部任务已停止。

本批真实迁移签名／巡检集成 1 项通过，无失败或跳过；Core 构建、类型和 API 检查通过，隔离容器无残留。未重跑 Core／Contracts 全量。证据见[计划回调取消验证](verification-2026-09-09-migration-plan-stop.json)。


## 2026-09-09：Enable 实施前的现状核对与 Core 全量基线

对照 V1 Pack Loader 第 2～4 节核对启用要求，形成 [Pack Enable 实现要求与现状核对](PACK-ENABLE-REQUIREMENTS.md)。当前 InstalledPackRecord／读取器固定 version 1，数据库额外强制 Staged 且运行角色仅 SELECT／INSERT；现有审批证明绑定 Action／OperationPlan，不能直接用作 Pack 部署治理审批。后续需要独立审批绑定、安装生命周期 Owner、完整适用验证和能力 Registry；不以不适用 Artifact 或巡检 Succeeded 替代完整门禁。

Core 全量基线 491 项：486 通过，0 失败，5 项因未设置 ABH_TEST_COSIGN 跳过。该结果不是 491 项全绿；五项真实签名测试另行显式配置 Cosign 补跑并保留独立日志。本批属于范围核对与回归证据，不宣称新增 Enable 实现。

显式 Cosign 补跑所选五个测试文件共 13 项全部通过，无失败或跳过（包含子测试及这些文件内原本不依赖 Cosign 的测试）。常规全量结果保持 491／486 通过／5 跳过的原始记录，不把两轮数目相加当作单次全量；所有原跳过签名场景已补验。隔离容器无残留。证据见[Enable 前 Core 基线验证](verification-2026-09-09-pre-enable-core-baseline.json)。


## 2026-09-09：Pack 启用审批的精确提案契约

新增 PackEnableProposal 与生成摘要策略，固定 EnablePack 动作、资源组织、Pack exactRef、subjectDigest（该 Pack 的 packageDigest）、预期部署版本、环境、验证报告、治理 Ref／摘要、CTK Artifact、影响报告、迁移验证 Artifact、ImpactUpperBound 和有效期。proposalDigest 仅排除自身；其他字段全部参与已有 RFC 8785／SHA-256 契约摘要，不引入自行实现的签名机制。

管理提案的影响范围只接受同资源组织的 organization scope，证据 Ref 强制各自类型。迁移验证必须引用实际验证或经过当前复核的不适用 Artifact，不能把巡检 Job Ref 当报告。Schema 不验证签名、批准或数据库当前事实，提案普通 JSON 也不产生任何 Enable 权限；后续 Human Gateway 和 Enable Owner 必须核对实际请求、提案摘要及所有门禁。

首次生成因现有摘要规则禁止直接把 packageDigest 当提案自身摘要字段而拒绝，改用明确的 subjectDigest 表示被审批包的内容摘要，保留失败日志。契约测试逐项替换包版本、部署、环境、证据、治理、范围和有效期，确认均改变提案摘要；只修改 proposalDigest 不改变摘要输入。

本批契约全量 297 项通过，无失败或跳过；工作区构建、Contracts／Core 类型、49 文件生成一致性和公开 API 检查通过。本批仅新增提案契约及摘要，不把它记作正式审批或 Enable Owner 完成；未重跑数据库集成与 Core 全量。证据见[Pack 启用提案验证](verification-2026-09-09-pack-enable-proposal.json)。


### Pack 启用审批消费（2026-09-09）

`verifyPackEnableApproval` 消费 Human Gateway 实际 Closed Request、完成证据和每个必需席位的 Approved Decision。提案重算自摘要，绑定 Pack exactRef、部署版本、环境、验证／治理／CTK／影响／迁移证据与期限；请求及决定包必须包含这些精确证据，决定包影响说明必须与提案一致。管理调用仅允许同组织、无 Workspace 的 Human／Service，冻结请求必须包含管理用途。

与 Action 共用当前责任、Human 身份、提交 Grant、席位完整性、决定包摘要、数据库期限和无条件批准校验。调用者先通过 approvalFenceRefs 收集来源锁，再在同一事务持锁复核。完成证据本身以最终审批人的用途保存；既有 Action 消费语义保留，Pack 的管理用途绑定检查放在来源请求上。

数据库用例由 DecisionOwner 创建请求、提交真实 Human 决策并生成完成证据；提交 Grant 实际经过 assertCurrentGrants。覆盖跨包／版本／部署／环境／提案替换、缺少证据、修改决定包、条件批准、过期、用途撤回、责任与 Grant 撤回。测试中的 Pack 制品引用只是审批绑定 fixture，不代表真实 Pack 验证完成。

本批仅实现审批消费，尚需正式 Pack 请求命令及证据装配、Enable Owner、生命周期迁移与能力注册；也不替代实际变更的完整验证。结果见[审批消费验证](verification-2026-09-09-pack-enable-approval.json)。


### CTK 制品与 Pack 启用提案证据装配（2026-09-09）

新增内部 RecordPackConformanceCommand（abh.packs.record-conformance），以 Pack exactRef 和保留策略为输入；实际报告从已安装快照中的独立签名 CTK 文件恢复。写入前后验证当前 Stage 授权、治理、原验证报告摘要、签名、完整 CTK 与期限，单独复核 CTK 写入 Grant。采用现有 Artifact Owner 原子保存规范 JSON 报告、Receipt／Audit／Outbox；重放也检查当前授权和实际内容。公开 Artifact 上传仍只允许原用途，没有为了部署证据扩大公开接口权限。

readPackConformanceArtifact 在消费事务中核对实际 Artifact 字节、安装 Owner、验证／治理 sources、管理用途与读取／保留策略，并重新验证签名报告。拒绝跨包引用、正确 metadata 搭配错误 body、非规范 JSON、撤权及取消。该链路不运行包内测试，不刷新历史 CTK 时间。

preparePackEnableProposal 已将 CTK 制品和迁移不适用报告组合为真实提案输入：从当前安装及签名影响事实派生包摘要、环境、部署版本和验证／治理 Ref，预先收集全部 Control fences，按 Deployment／Pack 锁顺序读取。安装策略审核影响上界后再次读取证据；提案有效期不能超出当前影响及 CTK 验证期限。它返回提案数据，不是批准或启用凭证；有实际迁移／数据变化的包仍需完整验证分支。

验证包含真实 Cosign／PostgreSQL 集成（1 个综合测试，未跳过）和 298 项契约测试。初始变量命名冲突、公开动作注册拒绝、构建尚未完成时的类型检查、测试容器端口绑定超时及 fixture Ref 类型问题均保留日志；最终结果见[CTK 制品验证](verification-2026-09-09-pack-ctk-artifact.json)。本批未重跑 Core 全量。正式 Pack 审批请求命令、Enable 生命周期 Owner 与能力注册仍未完成。


### 正式 Pack 启用审批请求（2026-09-09）

新增内部 RequestPackEnableCommand（abh.packs.request-enable）：输入完整 PackEnableProposal 与冻结 OpenResponsibilityRequestPayload。独立组织管理 Grant 与 Stage／影响读取授权分开提供，安装方必须声明路由及资格 fences 并审核当前席位、候选人、问题和风险披露。输入绑定检查核对组织、Pack exactRef、提案摘要、期限、必需 Authorization 席位、证据 Ref 和每个 Decision 包的影响／自摘要。

requestPackEnable 在同一 UoW 中重建真实提案并比对完整内容，通过 Human Gateway 创建请求、决定和冻结路由，以现有 Journal 原子记录回执／审计／事件。资格和路由回调之后再重验当前证据与授权；回调撤回来源或路由准入会回滚整个请求。所有回调及输入在异步工作前固定，保留方法 receiver；额外请求／资格 fences 在 Deployment／Pack 锁之前声明。

重放仍重验当前授权、证据和路由策略，核对原始冻结路由正文，返回原接受回执。已经批准关闭的请求可返回原回执，不重复创建请求或重开状态；同幂等键修改问题即使重算 Decision 摘要也被拒绝。请求完成只是后续 Enable 的审批来源，不产生部署权限或 Enabled 状态。

真实 Cosign／PostgreSQL 测试已走通 CTK 与迁移不适用制品 → 当前提案 → 正式请求 → Human 决策 → Pack 审批消费；含独立 Grant 撤回、绑定拒绝、来源撤回和最终回调回滚。联合专项 10 项、契约 299 项通过；未重跑 Core 全量。证据见[正式 Pack 请求验证](verification-2026-09-09-pack-request-enable.json)。仍缺 Enable 生命周期 Owner／数据库迁移、能力注册和实际迁移／Domain／回填／投影完整验证。


### 独立部署版本事实（2026-09-09）

新增 PackDeploymentRevisionRecord、只追加 extension.deployment_revisions 和 PackDeploymentRevisionOwner。此前部署版本取 installed_packs 最大 Stage 版本，不能表示后续启用／挂起的推进；现在统一从独立版本历史读取，在组织 Deployment 锁下按 expectedVersion 精确推进，并绑定实际已写入的 Pack exactRef 和相同部署版本。

新增迁移从已有 Stage 行保留每个组织的版本、目标 Ref 与原始创建时间，不制造额外部署动作。运行角色只有 SELECT／INSERT，禁止 UPDATE／DELETE，RLS 隔离组织；安全 manifest 版本更新至 55。记录与 SQL 列、连续版本、不可变 revisionRef 版本均校验。

Stage 在同一事务提交安装、部署版本、Receipt／Audit／Outbox，事件关联 revisionRef；并发重放不会增加版本，失败回滚也不留下版本。签名影响报告不再从 Stage 最大值推测当前部署版本，改读相同 Owner。未来 Enable／Suspend／Retire 必须复用此 Owner；本批尚未实现这些状态迁移，InstalledPack 仍保持 Staged 门禁。

专项覆盖旧库 Stage 历史迁移、双组织隔离、无上下文隐藏、只追加权限、缺失目标拒绝、CAS 竞争及回滚；真实 Cosign Pack 集成验证 Stage／影响／提案／审批链路仍成立。结果见[部署版本验证](verification-2026-09-09-pack-deployment-revision.json)。

部署版本补充回归：Core 全量 501 项，496 通过、0 失败、5 因未配置 Cosign 跳过。随后实际 Cosign 的迁移签名／结构签名／来源／包签名 4 文件共 12 项通过、0 跳过；CTK 已在此前专项 14 项中实际运行。各次运行范围存在交集，不合并成单次通过计数。工作区构建、类型、49 文件生成一致性、API 与文档检查通过，隔离测试容器已清理。


### 安装历史 exactRef 基础（2026-09-09）

新增只追加 extension.installed_pack_history，安全 manifest 更新至 56。迁移回填既有 Stage 原始记录及创建／更新元数据，历史与当前安装分表保存。保持当前 InstalledPackRecord 的 Staged／version 1 约束；后续生命周期版本必须通过独立迁移和 Owner 接入，不在本批提前放开状态。

InstalledPackOwner.readHistorical 读取指定组织／管理用途下的 exactRef，核对正文身份和 Manifest 摘要，必须经过独立历史读取准入。它仅返回历史证据，不能证明当前启用状态。retainCurrent 只复制实际当前行，冲突时读取已存正文并比较，不覆盖差异历史。

Stage 原子保存当前安装、历史快照、部署版本及 Journal；重放核对历史正文与当前记录一致。实际 Cosign fixture 覆盖并发 Stage 仅一份历史、事务失败不留历史、指定版本不存在、跨组织隐藏、读取准入拒绝、更新／删除权限拒绝、冲突历史拒绝及已有真实安装的迁移回填。

首轮安全校验拒绝物理外键（项目现有规则），已移除外键并保留 Owner 当前事实校验；跨组织 fixture 修正为正确管理用途后验证 RLS 隔离。结果见[安装历史验证](verification-2026-09-09-pack-history.json)。本批不是完整生命周期交付，Enable／Suspend／Retire、能力注册与完整实际变更验证仍未完成。

安装历史验证结果：真实 Cosign／数据库专项 14 项全部通过；Core 全量 501 项中 496 通过、0 失败、5 因未配置 Cosign 跳过。专项已运行真实 CTK／Pack 链路，其他 4 个签名文件本批未重跑。Core 构建、类型、API 与文档检查通过。


### Enable 提交前联合准入（2026-09-09）

新增内部 EnablePackCommand（abh.packs.enable）及独立管理动作；EnablePackPayload 固定完整提案和 RequestCompletionEvidence Ref，不接受调用者的 approved 布尔值。PackEnableRecord 定义待提交迁移关系：原 Pack 必须等于审批提案 exactRef，新 Pack ID 不变且版本恰好加一，部署版本独立按 expectedDeploymentVersion 加一，enabledAt 必须早于提案到期。数据库 InstalledPackRecord／状态门禁本批没有放开。

preparePackEnableCommit 在调用者 UoW 内组合当前签名提案重建、独立 Enable Grant 和实际 Human Gateway 审批消费。提前把 Enable、审批者／责任／Grant 及安装策略 fences 合入已有 Deployment／Pack 锁序；安装方必须提供当前依赖、兼容、运行模式／隔离和能力可用性准入。安装回调在最终证据重读之前运行，之后再次核验审批及 Enable Grant；原提案和重建提案逐字段一致才产生待提交记录。

返回值只是数据，不是可跨事务消费的 Permit，不写 Enabled 状态。后续生命周期 Owner 必须在同一 UoW 原子完成能力登记、状态 CAS、历史留存、部署版本和 Journal；当前仅有 NotApplicable 迁移证据分支，实际变更仍缺完整验证。记录契约不会绕过上述要求。

真实 Cosign／PostgreSQL 已覆盖正式请求 → Human 批准 → 联合启用准入，独立 Enable Grant 缺失／错误／撤回、错误审批版本、安装隔离拒绝、来源撤回以及安装回调后审批 Grant 撤回；验证准备后安装仍为 Staged、部署版本不变。联合专项 10 项、契约全量 302 项通过；本批未重跑 Core 全量。证据见[Enable 联合准入验证](verification-2026-09-09-pack-enable-admission.json)。


### 构建期能力绑定校验（2026-09-09）

新增 PackCapabilityBinding 和 PackCapabilityRegistration 契约。构建期部署配置显式绑定 Manifest 中的 kind/id/version、包内 Schema 路径、受信 implementationRef、healthRef 与权限包络；不从文件名、能力名或网络推断实现。登记摘要绑定这些字段、Pack exactRef、包摘要和实际 Schema 摘要，只排除登记摘要自身。

preparePackCapabilities 要求映射完整且恰好一次覆盖 provides，Schema 只能来自 artifacts（不能来自 migrations 或猜测路径），各类权限都是 Manifest 声明的子集。完整包内容先校验所有实际字节和三项摘要，再把已验证且复制保存的 Schema 字节交给必需的宿主编译校验；实现／健康／隔离／兼容引用由必需构建期安装准入核验。Schema 单文件最多 2 MiB，整个包保留已有 64 MiB／10000 文件限制，所有读取及回调共享有界期限。不会动态导入包代码或执行测试。

prepareInstalledCapabilities 从当前有 Stage 管理授权、治理和签名验证摘要一致的实际 staged 文件恢复内容，执行绑定检查后再次恢复并比对安装与元数据。结果是登记数据，不是 Registry 写入、实现句柄或 Grant；能力持久化、查询／exact resolve 和与 Enable 原子提交仍需后续 Owner。

纯能力测试覆盖实际非空映射、摘要／字节替换、缺项／重复／外来能力、猜测路径、权限扩大、超大 Schema、输入／回调变更、取消与超时。真实 Cosign 集成使用既有无能力 Pack，验证空映射也执行当前 staged 授权和恢复，不伪造未声明能力。联合 11 项、契约 303 项通过；未重跑 Core 全量。初始 fixture 使用不符合 RegisteredName 的 Tool kind，已修正为 abh.tool。结果见[能力绑定验证](verification-2026-09-09-pack-capability-binding.json)。


### 静态能力身份持久化（2026-09-09）

新增只追加 extension.capabilities 与 extension.capability_sets，安全 manifest 更新至 57。能力身份按组织 kind/id/version 唯一保留；完整登记集合按安装 ID 唯一，包含每项不可变登记与集合自摘要。Staged 登记属于管理事实，不是 Enabled 状态或运行时可用能力；Enable 尚需原子激活和运行时 Registry 读取规则。

RegisterPackCapabilitiesCommand 是独立内部部署命令，调用者只提供 Pack exactRef 和构建期绑定摘要，实际 bindings 由受信安装传入。Stage 与 register Grant 分开验证，空集合也需要授权；全部来源 fences 在组织 Deployment／Pack 锁之前收集。在同一 UoW 通过实际 staged 内容／签名摘要恢复和 Schema／实现准入，然后保存能力身份、集合、Receipt／Audit／Outbox；最终再次检查当前内容、授权与安装事实。回放不绕过撤权，也不覆盖变化后的映射。

PackCapabilityRegistryOwner.readSet 核对集合行、子记录完整性、独立自摘要、精确 Pack、能力身份和正文一致性，必须经过管理读取准入。register 还核对 actual Manifest 的 provides、Schema 摘要和权限子集；相同集合返回原 Ref，差异正文或被其他安装占用的能力身份拒绝。禁止运行角色 UPDATE／DELETE，两表遵循租户 RLS 和无物理外键规则。

真实 Cosign fixture 验证无能力 Pack 的正式登记、回放、绑定摘要错误、独立权限撤回、最终回滚及集合损坏拒绝；非空能力 fixture 验证实际字节到登记的映射、身份唯一、缺子记录／替换子记录、错误 Schema 摘要和越权包络。该非空 fixture 的 Stage 行由测试置入，不宣称其经过签名安装。结果见[能力注册验证](verification-2026-09-09-pack-capability-registry.json)。能力查询／exact resolve、与 Enabled 状态的原子激活和实际迁移完整验证仍待实现。

能力注册验证结果：专项 14 项通过，Owner 最终补测 1 项通过，契约 304 项通过。首轮全量存在旧构建产物诊断失败及容器端口绑定超时；构建完成后对应 14 项复验通过，最终 Core 全量 507 项中 502 通过、0 失败、5 因未配置 Cosign 跳过。真实签名 Pack 已在专项运行，其余签名文件未重复运行。下一步需把登记集合明确绑定启用提案，完成 Enabled 原子激活与运行时查询。

## 2026-09-09：能力集合绑定启用审批

`PackEnableProposal` 必须携带不可变 `capabilitySetRef` 与 `capabilitySetDigest`，两者都进入提案摘要。提案装配读取真实集合和完整子记录，核对 exact Pack、签名 Manifest 的完整 provides、包／Schema 摘要及权限上界；提前收集能力准入 fences，执行当前读取权限、实现及健康准入回调。影响／路由／安装回调之后重新读取集合和签名证据，最后再次核对集合存储内容。Request 与 DecisionPackage 均必须包含集合 Ref，实际 Human 审批消费同样检查，不能以自报摘要替代登记事实。

本批只闭合当前 NotApplicable 分支的审批绑定；实际 Enabled 状态提交、运行时能力查询／解析、Suspend／Retire 与适用迁移完整验证仍未完成。验证记录见 [能力审批绑定验证](verification-2026-09-09-capability-enable.json)。

## 2026-09-09：受控 Enabled 状态写入

安装记录现支持 Staged/version 1 与 Enabled/version 2；Enabled 必须包含匹配 Pack、包摘要、验证／治理依据、部署版本和审批期限的完整 `PackEnableRecord`。迁移 `1788886000000` 保留历史表只追加，当前表仅向运行角色授权生命周期六列 UPDATE，包身份列仍禁止写入；安全 manifest 58 检查精确列权限与两个生命周期 CHECK 的定义摘要。

`applyPackEnable` 在调用者 Command UoW 内执行真实预提交准入，再 CAS 当前记录、保留两个安装版本、推进部署修订、写 Audit／Outbox，最后重新检查审批与 Enable Grant。调用者仍负责 `executeCommand` 的 Receipt 和历史重放准入；当前没有完整 Enable 命令宿主，不能将此入口当作可重复提交的生产管理 API。Stage 重放读取原始历史版本并与当前记录的不可变部分核对；Staged 恢复入口仍拒绝其他版本。

运行时能力选择／激活、完整 Enable 命令重放、Suspend／Retire 和适用迁移验证仍缺。签名联测验证真实审批后的 Enabled 写入及整笔事务回滚；独立存储夹具验证提交后当前／历史读取和数据库门禁，不代表完整生产启用验收。

本批验证：Contracts 304 项通过；真实 Cosign 联测通过；Core 全量 508 项中 503 通过、5 跳过、0 失败。详见 [生命周期验证记录](verification-2026-09-09-pack-enable-lifecycle.json)。

## 2026-09-09：Enable 命令与已提交回执重放

`enablePack` 已装配内部 `EnablePackCommand`：在同一 Command UoW 中执行独立 Enable Grant、真实提案／审批准入、受控状态写入及 Receipt。幂等锁内读取实际回执决定初次提交或重放；不同 payload 保持 IDEMPOTENCY_CONFLICT，新幂等键不能将已启用版本再推进一次。

`readPackEnableAcceptance` 从实际 Enabled 历史记录读取原始提案，核对原 Staged 历史、当前安装、部署修订、完整能力集合、保存的验证报告、实际本地内容和当前签名治理。无关治理版本／撤回清单变化可复核后继续读取；签名密钥、来源、CTK 或部署验证前提改变则要求重新验证。宿主仍必须装配当前管理读取／签名者／实现健康准入及提前声明的 fences。回调后再次读取事实和内容，并重新检查 Enable Grant。

重放只返回既有回执，不重新消费审批、不执行迁移或重新跑完整 CTK。真实数据库时钟超过原提案期限、审批人 Grant 随后撤销，都不删除已经完成的事实；当前管理 Grant 撤销、内容替换、能力记录损坏、回执记录不一致仍会拒绝读取。联测通过真实签名／Human 审批提交后，从新事务和并发连接确认只产生一次状态推进；随后仅重置隔离测试夹具，以继续执行原 Staged 管理测试。

当前仍仅支持 NotApplicable 数据变更分支；运行时能力查询／解析、挂起／退休、验证前提变化后的完整重验装配，以及适用迁移的完整验证仍未完成。Enabled 成功回执不是运行授权。

本批验证：真实 Cosign／审批／启用提交／过期重放联测通过；Core 全量 508 项中 503 通过、5 跳过、0 失败。详见 [Enable 命令验证记录](verification-2026-09-09-enable-pack-command.json)。

## 2026-09-09：业务用途能力候选查询

新增 `QueryPackCapabilitiesQuery`／候选／可用性／结果契约及 `abh.capabilities.read` 独立查询权限。`queryPackCapabilities` 接受当前业务用途 Context，检查实际 Grant 后在部署与 Pack 锁下读取 Enabled 安装、完整登记集合、验证报告和当前治理；管理读取入口仍保留原用途限制。候选只暴露能力身份、安装 Ref、登记／Schema 摘要和兼容／健康布尔值，不泄漏实现路径或密钥，也不返回执行句柄。

查询支持精确 ID／版本、最多 256 字符和 8 个分支的 semver 范围、最多 100 个返回项与 1000 个扫描候选。扫描或返回被截断时 `complete=false`，不自动挑选版本；普通范围不隐式接受预发布版本。宿主必须提供提前声明的查询 fences 和有期限的可见性／兼容性／健康检查，最后重读候选来源、安装、完整集合及治理，重新检查读取 Grant。

本批是内部查询实现及公开查询契约，HTTP 运行入口仍标记 Unavailable。精确解析、Assignment／Pin 绑定、实际 Schema 字节及受信实现句柄、运行前撤回检查、Suspend／Retire 仍待完成。查询本身不授予调用权限。非空候选测试使用明确的行政数据夹具，真实签名回归仍使用空 provides 包，不能据此声明非空签名能力运行验收。

本批验证：Contracts 305 项、Registry／业务查询专项 2 项及真实 Cosign 回归通过；Core 全量 509 项中 504 通过、5 跳过、0 失败。详见 [能力候选查询验证记录](verification-2026-09-09-capability-query.json)。

## 2026-09-09：精确能力的实际 Pin 校验

`StaticReleaseOwner.requirePinnedCapability` 从实际保存的 PinSet 和当前 Assignment／Release 校验指定 behavior slot 的完整 CapabilityRef（含版本与摘要），返回固定 Assignment Ref。重验同时核对行版本、组织、状态、执行标志及 Release 绑定，拒绝记录与索引列不一致。正常停止新分配不破坏既有 Pin；紧急暂停禁止执行。调用方仍须校验业务授权、Enabled 能力及 Schema／实现／健康状态，此入口不提供执行句柄。

专项覆盖摘要／版本／名称替换、Assignment／Release 记录版本篡改、进程重启后固定引用和紧急暂停。精确 Registry 解析与受信句柄装配仍未完成。

本批验证：Action／Release 联合回归 70 项通过；新增 ContextRef 校验后的 Release 专项 8 项通过。未宣称全量 V1 或完整运行时解析完成。

## 2026-09-09：实际 Schema 字节校验

新增 `readCapabilitySchema`，校验实际注册摘要、Manifest／包摘要、Schema 路径与字节摘要、权限上界，限制 2 MiB／100000 块及原期限，复制可复用缓冲区并在取消时尝试关闭来源。能力映射与字节专项 6 项通过。仍未完成完整精确解析、CapabilityRef 映射与受信实现句柄装配，不能以字节验证成功代替运行授权。

## 2026-09-09：同事务精确能力解析

`resolvePackCapability` 在调用者 UoW 内依次检查实际 PinSet／Assignment、当前 Enabled 候选、完整登记摘要、实际受信实现 Ref 和当前业务／隔离准入，核验完整包内容与 Schema 字节。公开 CapabilityRef 的 digest 绑定完整 registrationDigest，公共 kind 与注册 kind 的映射由显式构建期 binding 固定；禁止仅按名称猜测或动态导入实现。返回私有 Schema 副本读取器和部署注入的实现对象。

查询入口已拆出同事务形式，所有新增 fences 在部署／Pack 锁之前声明。宿主回调后再次读取安装、登记、信任和权限，最后读取实际内容，再作无宿主回调的事实复核与 Pin 重验，拒绝最后一次 source 回调篡改集合或撤销权限。返回实现对象是内部解析结果，业务 Owner 仍必须在实际派发时校验 Snapshot／Permit，不能将读取 Grant 当作执行授权。

本批非空能力／Release／解析联合测试使用行政元数据夹具与实际字节来源，尚无真实签名非空包的端到端验收。生产 Gateway 默认装配、每次调用的治理门禁、HTTP 入口、Suspend／Retire 及适用迁移验证仍待完成。

本批全量 Core：512 项中 506 通过、5 跳过、1 个巡检夹具时间失败；修正夹具使用数据库时钟后，巡检与解析／Schema／Release 补充 12 项全部通过。详见 [精确解析验证记录](verification-2026-09-09-capability-resolve.json)。未宣称全量重跑全绿。

## 2026-09-09：派发实现绑定与取消收尾

`dispatchOnce` 在首次异步边界之前复制本次输入／选项、固定 Connector CapabilityRef 和绑定发送方法，防止等待事务时替换实现。外部发送只获得 Permit 副本；观察依据保留实际提交的 Permit。发送与取消信号竞争，忽略 AbortSignal 的 Connector 不再无限阻塞上层，取消返回 Interrupted；已提交一次性出口保持已消费，后续必须查回而不能重发。

此变更加固已有派发边界，尚未完成生产 Gateway 与 Pack 精确解析的默认装配。取消返回不证明远端无效果，也不会释放未决责任。

本批 Action 回归 63 项通过，Core 构建、类型和 API 检查通过。验证日志及摘要见 `verification-2026-09-09-transport-binding.json`。

## 2026-09-09：查回策略与实现绑定

`queryOnce` 在首次异步边界前复制查回输入、Command、事务选项和策略数据，固定 Connector 身份并绑定原查询／授权方法，保留方法接收者。等待摘要或事务时替换调用对象不再改变本次计费、超时、权限回调或实际查询实现。Connector 仅收到出口副本，篡改副本不影响已提交出口和观察来源校验；原有取消收尾、独立预算和禁止重放调用语义保持有效。

Action 回归 63 项通过，包含调用启动后同时替换输入／策略／Command／Connector 的验证。生产 Gateway／Pack resolver 默认装配、每次调用的当前治理门禁和真实签名非空包端到端验收仍未完成。方法绑定固定函数身份，不冻结受信实现对象的内部状态。

本批 Core 全量回归 513 项：508 通过、5 跳过、0 失败；此前巡检时钟夹具修正已随全量验证通过。构建、类型、API 与文档检查通过，见 [查回绑定验证记录](verification-2026-09-09-query-binding.json)。

## 2026-09-09：能力候选 HTTP 查询装配

`createCoreHttpApp` 新增显式 `capabilityQuery` 安装，接通 `GET /v1/queries/abh.capabilities.query`。查询先由真实 IdentityIngress 生成私有 VerifiedContext，再有界获取部署安装的读取 Grant，调用既有业务用途候选查询，在事务内复核当前 Grant、Enabled 安装、完整能力集合及兼容／健康状态。返回 `PackCapabilityQueryResult`，保留精确版本／范围过滤和 complete 截断标志，不返回实现句柄。

创建服务时校验并绑定 Grant／fence／inspect 方法；缺少安装时不注册路由（404），安装不完整时拒绝创建。查询没有命令、审计或 Outbox 写入。实际数据库与 HTTP 联测覆盖有效非空候选、分页截断、无身份、非法过滤、缺少／撤销 Grant 及安装对象方法替换。非空包仍为行政元数据夹具，不能代替真实签名非空包端到端验收。生产部署默认治理安装、Gateway 调用装配、Suspend／Retire 仍未完成。

本批候选查询／精确解析及巡检 HTTP 联测 4 项通过，构建、类型、API、文档检查通过；未重跑全量 Core。见 [能力 HTTP 验证记录](verification-2026-09-09-capability-http.json)。

## 2026-09-09：公开能力查询客户端

`@abh/core/client` 新增 `client.capabilities.query(input, options)`，使用 `QueryPackCapabilitiesQuery`／`PackCapabilityQueryResult` 类型。查询沿用注册协议的发送前校验、凭据与响应期限、响应字节上限、严格 Schema 和错误映射；保留 `complete=false`，不自动重试、选择版本或创建执行句柄。实际构建后的公共子路径已通过真实 HTTP／IdentityIngress／数据库候选查询联测，包括 semver 范围与截断、缺权错误；客户端专项确认异步凭据等待不改变已编码的查询参数，非法参数不读取凭据或发送请求。

本批客户端／候选查询／精确解析联合回归 16 项通过，构建、类型与浏览器打包通过。公开 API 报告已更新。生产 Gateway 装配、逐次调用治理、真实签名非空能力验收及生命周期缺口仍待完成。

## 2026-09-09：派发业务准入方法绑定

`dispatchOnce` 在首次异步边界前绑定本次业务 source fences、来源检查、制品准入、策略 obligations、目标检查及可选 payload outputs／validate 方法，保留各自接收者。这补齐了仅固定 Connector／Resolver 方法时，调用方仍可在等待事务期间替换业务校验的缺口。方法绑定不冻结受信实现内部状态，当前身份、Grant、Scope、Pin、Permit 校验仍在派发事务中执行。

新增真实数据库回归：启动派发后将拒绝目标检查替换为允许，原拒绝仍生效，Connector 零调用且一次性出口无记录；随后独立调用使用有效准入，可以正常消费出口并发送一次。此变更不代表生产 Gateway／Pack resolver 默认装配或全部调用治理完成。

本批 Action 回归 64 项通过，构建、类型、API 与文档检查通过；未重跑全量 Core。见 [业务准入绑定验证记录](verification-2026-09-09-dispatch-check-binding.json)。

## 2026-09-09：同事务解析准备与执行锁顺序

新增 `preparePackCapabilityResolution`／`resolvePreparedPackCapability`，提前收集并固定解析输入、部署 binding、当前检查方法、读取 Grant 和所需 Control fences。准备对象不暴露实现，不接受 Grant、不读取内容，也不授权调用。消费仅允许原 UoW 一次，保留原期限；消费时仍走完整实际 Pin、Enabled、治理、包／Schema 字节及实现 Ref 验证。

组合方必须先将声明 fences 与业务 fences 一起按序锁定；聚合阶段按 Action → Deployment → OperationController → PackLoader 获取锁。新增 `lockPackCapabilityDeployment` 供组合方在 Operation 锁前获取部署锁，候选查询复用相同锁。准备对象不能绕过锁序：遗漏早期 fences 或部署锁仍由 UoW 拒绝。不能把解析直接放入已取得全部业务锁的 target 回调而补拿早期锁。

这提供后续出口装配的事务内基础，尚未接成生产派发／查回 Gateway，不能据此声明默认运行装配完成。

解析／Schema／Release 联合回归 13 项通过，覆盖遗漏早期 fence 或 Deployment 锁的拒绝；构建、类型、API、文档检查通过。初次测试层级错误导致超时，修正后通过；未重跑全量 Core。见 [解析准备验证记录](verification-2026-09-09-prepared-capability.json)。

## 2026-09-09：Pack 派发事务装配入口

新增内部 `dispatchPackOnce`，固定部署绑定的 Connector 方法／身份、读取 Grant 与解析准入方法。业务 source fence 阶段创建同事务解析准备并合并 fences；目标检查阶段先验证 Connector 精确身份并获取 Deployment 锁；一次性出口写入和 payload 读取之后、提交之前完成实际 Pack 精确解析。解析失败回滚出口和该事务全部记录，Connector 仅在提交后调用。

原 T1 Snapshot 必须已经包含同一组能力读取／治理 fences；派发不能给既有 Snapshot 静默增加授权。独立 capabilities.read Grant 不从执行 Authority 推导。新增 `dispatchOnce` 内部最终准入回调，接收实际 Permit 副本，只能拒绝或完成当前事务准入，不提供外部发送机会；它不是公共客户端 API。

当前新增出口最终准入失败回滚与 Pack 装配缺少独立读取权限的拒绝验收。完整非空 Pack／真实签名／T1／Permit／解析／派发成功的端到端验收尚未完成，查询出口尚未接入同类装配，生产默认治理也仍未完成。

本批首轮 Action／解析联合回归 69 项通过；新增 Pack 入口拒绝测试后的 Action 回归 66 项通过。构建、类型、API、文档检查通过。未运行真实签名非空包成功派发端到端验收，未重跑全量 Core。

## 2026-09-09：查回出口提交前最终准入

`queryOnce` 新增内部最终准入回调，在独立预算消费、QueryExit 写入后且 Command 事务提交前运行，接收实际出口副本。回调拒绝时出口、预算与命令记录一同回滚，Connector 不调用；同一 Command 可以在后续有效准入下重新执行。回调身份在函数调用时固定，出口证据不由回调副本替换。

回归在最终准入中确认出口已写入且预算已计费，再拒绝；事务外确认出口为零、计费回到零、Connector 零调用，随后复用原 Command 成功。此入口提供后续 Pack 查回装配所需的提交边界，尚未实现 Pack 查回的完整 fences／Pin／兼容能力选择装配。

本批 Action 回归 66 项通过，构建、类型、API、文档检查通过；未重跑全量 Core。详见 [查回最终准入验证记录](verification-2026-09-09-query-final-admission.json)。

## 2026-09-09：精确 Enabled 能力查回装配

新增内部 `queryPackOnce`，固定安装的只读 Connector 方法、精确身份、能力读取 Grant 和治理方法。`InstalledQueryPolicy.fenceRefs` 在独立查询 Authority 的完整 Control fence 集合锁定前声明附加范围；同一 Command 的 admission／claim 复用同事务解析准备。出口写入和独立预算消费后、提交前执行实际 Pin／Enabled／治理／Schema／实现解析，拒绝则整体回滚且不查询远端。

历史 Action 执行 Authority Ref 仅参与原 Pin 输入重建；当前查询仍要求独立查询 Authority、当前政策、预算、Lease 与 capabilities.read Grant。此装配只支持当前 Enabled 原精确 Connector；原能力暂停／撤回后的受信兼容查回尚未实现，不能以此入口阻断未决责任的后续恢复设计。真实签名非空包成功查回联合验收和生产默认治理仍待完成。

查回政策新增内部 aggregate lock 阶段，位于 Action 锁之后、DurableExecution Lease 锁之前；Pack 装配在此获取 Deployment 锁，最终解析不再补拿较早部署锁。缺权拒绝回归不能代替完整非空能力成功查回验收。

本批 Action 回归 66 项通过，构建、类型、API 检查通过；未重跑全量 Core。Pack 缺少独立读取权限时保持零调用、零计费；完整成功查回验收尚缺。

## 2026-09-09：Pack 传输与 Capture 装配

新增内部 `dispatchPackAndCapture`／`queryPackAndCapture`，先执行 Pack 出口准入与一次性传输，再使用新观察 Context 持久化原始证据；失败返回现有 Pending Capture 句柄，由原 retryTransportCapture／retryQueryCapture 恢复。句柄只保留原 Database 和观察，不保留发送函数，持久化重试不会重新解析／发送／查回。

普通与 Pack 入口共用同一 Capture 句柄实现，并在传输前固定 Database 引用，避免可变参数数组在等待传输期间改变证据目标。Pack 准入拒绝直接传播，不创建 Capture Pending。现有 Action 回归覆盖捕获失败后恢复；Pack 的缺权拒绝测试已通过新组合入口运行。完整真实签名非空包成功传输与 Capture 联合验收仍待完成。

本批 Action 回归 66 项通过，构建、类型、API、文档检查通过；未重跑全量 Core。见 [Pack Capture 验证记录](verification-2026-09-09-pack-capture.json)。

## 2026-09-09：Capture 身份刷新期限

传输和查回 Capture 重试在刷新身份之前固定本次事务选项，将同一期限与取消信号交给 Context 获取器，并以有界调用等待。刷新超时或取消返回原 CapturePending 句柄；迟到的身份结果不会继续启动捕获事务。成功刷新后的数据库持久化沿用原期限，不因刷新耗时重新获得完整预算。普通与 Pack Capture 入口共用该行为。

回归覆盖身份获取器永不返回、超时后迟到返回和后续同句柄成功恢复，持续验证 Provider 调用次数不增加。身份获取器应使用传入信号停止自身工作；有界等待不代表强制终止不合作的实现。完整 Pack 成功传输／Capture 联合验收仍待完成。

本批 Action 回归 66 项通过，构建、类型、API、文档检查通过；未重跑全量 Core。见 [Capture 刷新验证记录](verification-2026-09-09-capture-refresh.json)。

## 2026-09-09：Pack 运行装配跨模块回归与缺口复核

对候选 HTTP/SDK、同事务解析准备、Pack 派发／查回、Capture 装配及身份刷新期限的连续变更运行 Core 串行全量回归。同步修正 V1-GAPS 顶部总表中已经过时的 Enable／Registry 缺口，并保留未完成的成功路径、生产治理、生命周期以及其他 V1 模块要求。

源码核查：`pack-conformance.test.ts` 的真实签名夹具仍由空 provides 的 packManifest 生成；运行时非空能力测试使用行政元数据。下一阶段必须新增实际签名非空 Connector 包并贯通 T1 同组 fences、Permit、解析、传输与 Capture，不能把两类分离证据合并宣称端到端完成。

Core 全量 519 项中 514 通过、5 项真实 Cosign 测试跳过、0 失败。随后真实 Cosign 补跑 13 项中 12 通过、1 项迁移联合夹具结果新鲜度失败：流程约 129 秒超过夹具 120 秒接受窗口。将该夹具窗口调为 300 秒，保留 maxAgeMs:1 的独立过期拒绝验证，生产签名新鲜度逻辑未修改。最终重跑结果单独记录。

本轮最终验证：Core 全量 519 项中 514 通过、5 跳过、0 失败；真实 Cosign 补跑最初 12 通过、1 个夹具时间窗口失败，修正后迁移签名专项 1 项通过。5 项原跳过场景均有本轮实际执行证据；未在夹具修正后重跑全量。见 [Pack 运行全量回归记录](verification-2026-09-09-pack-runtime-regression.json)。

## 2026-09-09：真实签名非空 Connector 夹具

新增可复用 `signedConnectorFixture`：实际 ConnectorPack Manifest 提供一个 `abh.connector` 能力和合法 JSON Schema 字节，发布／Builder／CTK 各用独立 Cosign 临时密钥签署同一包摘要。函数返回公开验证材料和内容来源，临时私钥在返回前删除。CTK 使用明确的测试声明，不能作为生产 Connector 已通过完整 CTK 的证明。

实际密码学联测验证发布签名、SLSA 来源、CTK 能力声明、非空 preparePackCapabilities 登记和 readCapabilitySchema 原字节；替换能力版本并重算摘要仍无法复用旧签名／来源／CTK，Schema 替换、空登记、空 CTK 声明及来源公钥替换均拒绝。

本批真实 Cosign 专项 1 项通过、0 跳过，Core 类型检查通过。该夹具尚未接入持久 Stage／Human 审批／Enable／T1／Permit／传输和 Capture；它关闭的是非空签名输入夹具缺口，完整成功执行验收仍未完成。

## 2026-09-09：非空签名包当前验证与跨进程恢复

真实签名 Connector 夹具接入 validateCurrentPack，校验当前部署策略、发布／来源／CTK 三类独立证明和完整包内容；经 stageLocalPackSnapshot 保存后，由新 Node 进程 recoverLocalPackSnapshot 重建 Manifest、报告与实际 Schema。恢复的原字节重新生成与原先完全相同的完整能力登记。恢复对象不具备 GovernedLocalPack 进程内信任标记，也不自动产生安装或执行权限。

专项覆盖持久化 payload 篡改后恢复失败和当前治理撤回后验证失败。实际 Cosign／新进程恢复联合 2 项通过、0 跳过，类型检查通过。当前治理来源仍是测试安装，尚未贯通实际治理发布、数据库 Stage／Human 批准／Enable 和完整执行链；这些验收缺口继续保留。

## 2026-09-09：非空签名 Connector 的真实数据库安装与登记

签名夹具新增实际 PostgreSQL 联测，使用独立管理员临时密钥签署部署治理，通过 publishPackTrustPolicy 写入治理版本，再从 databasePackGovernanceSource 验证同一非空 Connector 包。recordPackValidation、StagePack、RegisterPackCapabilities 依次产生验证报告、Staged 安装、完整非空能力集合及命令回执，不行政写入 Pack／能力事实。

Stage 与登记重放不重复写入；最终只有一条安装、一条能力和四条命令回执。新数据库连接回读完整能力集合与原记录一致；撤销管理 Grant 后登记重放拒绝。身份与 Grant 仍为显式行政夹具，Schema／实现治理为测试安装。安装保持 Staged，尚未接真实 Human 启用批准、Enabled、T1、Permit 和成功传输／Capture；不能从登记成功推断执行权限。

## 2026-09-09：非空签名包的数据影响与不适用证据

非空 Connector 数据库安装联测新增两份实际完整库存 Artifact，由独立 Compiler 临时密钥签署绑定 packRef、deploymentVersion、环境、基线／目标 Ref 与影响结论的报告，经 recordPackDataImpact 保存。recordMigrationNonApplicability 从当前治理、实际签名报告、库存内容和 staged 包字节生成不可变不适用证据，随后从新事务读取验证。

当前夹具确实没有迁移、数据或投影变化，使用完整空库存；不会为它创建空迁移作业。替换 impactRef 无法读取报告，重复命令返回原证据，撤销 Grant 后登记和不适用报告重放均拒绝。Compiler 身份／来源治理仍是显式测试安装，适用迁移的完整 Domain／回填／投影验收未完成。

真实 Cosign／数据库联合 2 项通过、0 跳过，类型检查通过。下一步仍须将非空能力集合、CTK 和此不适用证据绑定到真实 Human Enable 提案与审批；尚不声明 Enabled 或运行成功。

## 2026-09-09：非空签名包的完整 Enable 提案

非空 Connector 联测通过正式 recordPackConformanceArtifact 保存并回读独立签名 CTK，保留实际非空 claimedCapabilities。preparePackEnableProposal 从当前数据库与 staged 内容重建提案，绑定同一包摘要、部署版本、完整能力集合摘要、CTK、影响报告及迁移不适用证据；重复重建得到相同提案摘要。

替换 CTK 为不适用报告、替换能力集合 Ref、当前实现准入拒绝及 Grant 撤销均拒绝提案重建。构建提案不改变 Staged 状态，不等同于批准或执行授权。实际 Cosign／数据库联合 2 项通过、0 跳过，类型检查通过；真实 Human 开单／批准及 Enable 消费仍是下一段未完成的非空包验收。

## 2026-09-09：非空签名包 Human 批准与原子 Enable

非空 Connector 联测通过真实 assignResponsibility、requestPackEnable、DecisionOwner.submit 创建路由、Decision 与整体完成证据，再由 verifyPackEnableApproval 验证精确提案／完整能力集合和各项证据。正式 enablePack 命令读取这些实际事实并原子推进 Staged/version 1 → Enabled/version 2，保留原 Staged 历史。

开单与 Enable 重放返回原事实，替换批准 Ref 不推进状态，撤销 Enable Grant 后拒绝重放；原有登记／不适用证据／提案在管理 Grant 撤销后的拒绝覆盖继续保留。身份、Grant、资格和安装健康治理是测试安装，审批通过真实 Human 领域 Owner 完成，尚未覆盖 HTTP 审批入口或生产职责分离配置。

此证据首次将非空实际签名内容、持久治理、Stage、登记、影响／CTK／不适用报告、Human 批准与 Enabled 连为一条测试链。Release/Pin、T1、Permit 到成功派发／查回／Capture 仍待接通，Enabled 本身不授予运行权限。

## 2026-09-09：非空签名 Connector 的业务 Action 与精确 Pin 解析

真实签名安装联测在 Enabled 后撤销 Pack 管理 Grant，用独立业务 Grant 查询实际非空候选。正式 StaticReleaseOwner 创建 Release/Assignment；实际业务载荷写入 Artifact，ActionOwner 创建 Action/冻结 Intent，再通过 validateAction 和 pinAction 的当前 Grant 检查完成校验与 Pin。Pin 绑定真实 Intent 摘要、准备 Grant 和登记摘要，重放返回原 Pin；Action 保持 Validated，尚无执行 Authority。

resolvePackCapability 从实际 Enabled 集合、持久包内容和该 Action Pin 解析出原始 Schema 与安装绑定。派发共用的 preparePackCapabilityResolution/resolvePreparedPackCapability 两阶段入口亦消费同一链路，声明 fences 后锁 Deployment，再完成一次性解析。Schema 返回副本，错误精确摘要、重复消费 token、健康失败、Assignment 急停均拒绝；业务 Grant 撤销后候选查询和 Pin 重放均拒绝。

真实 Cosign／数据库联合 2 项通过、0 跳过，Core 类型与文档检查通过。身份、Grant、Domain/Release 治理是显式测试安装，执行实现仍为测试句柄；未连接 T1、Permit、实际传输、独立查回与 Capture，也未覆盖生产 HTTP 审批或完整 Connector CTK。本批只修改联测与文档，未重跑全量 Core。见 [签名 Connector 业务解析验证记录](verification-2026-09-09-signed-connector-resolve.json)。

## 2026-09-09：签名 Connector 的实际编译与 Operation 登记

真实签名安装链继续经过 ActionCompilerHost、compilePreparedAction 和 registerOperationPlan。Release 同时固定显式测试 Compiler 与实际非空包的 Connector 登记摘要；编译前后及登记／重放准入均重新解析当前 Enabled Connector。正式登记持久化完整 OperationPlan 和一个 Pending、零 Attempt 的 Operation，重放不重复创建。撤销业务 Grant 或健康检查失败后，计划登记重放拒绝。

该联测发现并修复编译／登记入口的锁序缺口：能力准入可能取得 Deployment 锁，因此两个入口现在都在 Control fences 后先锁定并核验 Action，再调用当前能力准入。编译仍在数据库事务外执行；登记仍独立核验当前 Grant、Pin、载荷和完整计划。

Compiler、Domain 与治理为显式测试安装；未声称 Compiler 本身来自签名包，也未生成执行 Authority、T1、Permit 或外部效果。后续继续接业务授权、派发／独立查回和 Capture。验证结果见 [签名 Connector 计划验证记录](verification-2026-09-09-signed-connector-plan.json)。

## 2026-09-09：签名 Connector 的 T1、Permit、派发与 Capture

真实签名非空 Connector 链新增独立业务 Authorization Request/Decision/完成证据，经 ExecutionAuthorityOwner 签发绑定实际 Action/载荷的 Service Grant 与 Authority。重建摘要后尝试用 Pack Enable 批准替换业务批准，仍因主体不匹配拒绝。Action 提议现在通过 executeCommand 生成实际源命令回执，供 T1 核验提议来源。

正式 Purpose、Connection、显式资源 Envelope 和已安装 Wasm Mandatory/Behavior 策略参与 T1，两个策略评估、Snapshot 与 Authorized 状态原子提交。测试计划声明无计量资源，因此显式空 Envelope 不产生 Reservation；不代表资源扣款场景已在本链覆盖。Service 的独立 capability-read Grant fence 在 T1 固定，后续实际 WorkLease、Permit 和 dispatchPackAndCapture 使用同组 fence 与精确登记摘要。

安装的测试传输校验 Permit/载荷，并用新数据库事务读到已提交出口后才返回响应。正式 Capture 使用独立观察 Grant；注入持久化失败后经 retryTransportCapture 保存原始 Artifact、规范化 Receipt 和 Capture，整个链路只调用一次传输，已消费重试句柄和重复派发均拒绝。

实际 Cosign／数据库联合 2 项通过、0 跳过，Core 类型和文档检查通过。身份/Grant/治理、Compiler、Domain、Policy 和传输为显式测试安装，未调用真实 Provider，未覆盖生产 HTTP 审批或完整 Connector CTK。独立 queryPackAndCapture、暂停/退役与兼容查回仍待完成；Capture 也不等同于 Operation 终态归并。本批未修改生产源码、未重跑全量 Core。见 [签名 Connector 执行验证记录](verification-2026-09-09-signed-connector-t1.json)。

## 2026-09-09：签名 Connector 的独立预算查询与 Capture

真实签名 Connector 执行联测继续接入 queryPackAndCapture。查询使用独立 Grant、Purpose、资源 Envelope 与一次查询额度的实际累计账本；ScopeAuthorityPolicyInput 经过已安装 Wasm 策略评估，再由正式 createScopeAuthority 创建 Scope Authority，未直接插入 Authority 事实。撤销原派发 Grant 后，同一实际 Operation 仍可在原精确 Enabled Connector 上合法查回。

查询传输在新事务可见实际 query exit 后才返回测试响应，实际预算只消耗一次。缺少 capability-read Grant 时不调用传输、不计费；Capture 注入持久化失败后仅重试证据保存，已消费句柄拒绝复用。预算耗尽后拒绝第二次查询，查询调用总数保持一。返回空匹配使用 Partial coverage，Operation 保留未决状态与既有 Attempt，不据此确认无外部效果。

本批仅扩展联合夹具，身份/Grant/Domain/治理与传输仍是测试安装；没有真实 Provider、Suspend/Retire 后的兼容能力或终态归并验收。当前 Enabled 原能力上的独立查询成功不能代替暂停后安全恢复。验证见 [签名 Connector 查询验证记录](verification-2026-09-09-signed-connector-query.json)。

## 2026-09-09：Pack 原子暂停与历史保留

新增内部 SuspendPackCommand、独立 abh.packs.suspend 管理动作、暂停输入及历史事实合同。suspendPack 在当前 Grant/部署策略准入后，以部署锁、expectedDeploymentVersion 和 Enabled 精确版本 CAS 原子推进 Suspended，保留原 Enable 事实、前后历史、部署 revision、命令回执、审计与 durable outbox 事件。emergency 只交给当前部署策略核验，不跳过 Grant 或证据要求；暂停无需重验已经失效的签名/CTK 才能停用。

新增数据库迁移扩展真实生命周期约束，并更新 readiness 对数据库实际 pg_get_constraintdef 的摘要验证。合同与数据库共同约束原 Enabled 引用、连续 Pack 版本、部署序号和暂停时间。回执重放重新校验当前管理权限，返回原历史结果；不重新激活能力，不删除包字节、Action Pin、Operation 或未决责任。

真实签名完整执行／查询链之后，暂停专项覆盖准入拒绝、缺 Grant、部署版本冲突、历史持久化故障回滚、成功与重放、旧 Enabled 历史回读、候选消失、精确解析拒绝以及撤权后重放拒绝。暂停事件已持久化，既有运行的通知消费、Retire/引用水位和兼容查回仍待实现；当前不得把此暂停入口视为完整恢复能力。验证见 [Pack 暂停验证记录](verification-2026-09-09-pack-suspend.json)。

## 2026-09-09：Pin 的实际选择准入与暂停保护

ActionPinChecks 新增 selected 回调，在实际 Pin 产生后的同一命令事务内校验选中能力，原命令重放也校验实际持久 Pin。回调所需 Control scopes 必须提前由 fenceRefs 声明；Action 在能力准入取得 Deployment 锁前锁定并核验版本。函数入口固定回调及接收者，pinRequestedAction 将该检查传到授权 Worker 的真实推进链。

签名 Connector 夹具安装实际 resolvePackCapability 作为 selected 检查。Enabled 时 Pin/重放通过；Suspended 后，新 Action 的选择被拒绝，Pin 写入与 Action 绑定一并回滚，已有 Pin 重放也拒绝。独立请求推进测试覆盖检查拒绝、回滚、恢复推进和重放拒绝。静态非 Pack 安装仍可不提供此回调；生产 Pack 宿主必须显式装配它，不能把通用 StaticReleaseOwner 本身当成 Loader 准入。

本批未实现引用枚举、暂停通知消费、Retire 或兼容查回；这些待办继续保留。验证见 [Pack Pin 验证记录](verification-2026-09-09-pack-pin.json)。

## 2026-09-09：精确能力的 Pin 引用发现

新增内部 queryCapabilityReferences，按完整 CapabilityRef（含摘要）查询实际 PinSet，校验持久摘要及主体元数据，以 Pin UUID 游标分页，限制每页最多 100 个匹配候选。当前租户、Workspace、用途过滤与独立发现准入、逐对象可见性检查都保留；隐藏一整页时仍返回下一扫描位置，避免漏扫后续可见结果。回调有统一期限，前后重新检查当前准入。

真实签名联测创建两个实际 Action Pin，暂停包后仍能分页找到原精确能力引用；覆盖跨页无重复、隐藏页仍可前进、错误版本无匹配和 Grant 撤销拒绝。返回历史主体及 Pin 引用，不改变 Action/Operation，也不授予执行或回收权限。

此入口是当前作用域内的通知发现基础，不是全组织引用水位或删除证明。跨作用域通知消费、Artifact/Run 其他引用检查、并发水位、Retire 与兼容查回仍待完成。验证见 [能力引用发现验证记录](verification-2026-09-09-pack-references.json)。

## 2026-09-09：暂停通知的已提交事件来源

新增管理侧 readPackSuspension：要求当前暂停管理 Grant 与部署准入，从真实 Outbox 暂停事件读取精确 Suspended 历史，核验其 Enable 绑定、完整能力集合摘要及每项登记的包摘要，返回原登记身份、implementationRef、暂停原因和证据。输入只接受事件 Ref，不接受调用方自报的受影响能力列表。

真实签名联测验证实际暂停事件与原能力集合一致，Enable 事件不能冒充暂停事件，缺 Grant 和撤权后读取均拒绝。该读取不要求重新启用已暂停包，也不改变任何运行。后续 Worker 仍须建立受权业务 Context、映射注册能力类型，再以独立引用发现权限扫描通知目标；管理权限不替代业务对象的读/通知权限。

运行通知路由/消费、Retire、全局引用水位和兼容查询仍未完成。本批验证见 [暂停事件来源验证记录](verification-2026-09-09-suspension-source.json)。

## 2026-09-09：暂停通知目标的分作用域扫描

queryPackSuspensionTargets 串接实际暂停事件/历史能力集合与业务 Pin 引用分页，管理 Context 和业务 Context 必须同组织且各自经过当前准入。调用方部署代码提供显式注册 kind 与公共 CapabilityRef 映射，能力 id/version/登记摘要须与暂停包集合精确匹配。扫描后再次读取暂停来源并校验管理权限，结果只包含业务侧可见目标。

游标绑定事件、能力集合、精确能力、组织、Workspace、用途和业务身份；每个事件/Pin/能力组合产生稳定 notificationKey，便于后续持久消费去重。真实签名联测验证两个实际 Action 的分页、续扫、同页重读稳定性、错误游标与错误能力拒绝。

这是内部扫描组合，不写通知效果或更改运行，不提供全局删除证明。扫描位置不是并发插入水位，Worker 完成一轮后仍需重新扫描；游标不是授权凭证。持久调度、业务 Owner 消费、Retire 和兼容查回仍待完成。见 [暂停目标扫描验证记录](verification-2026-09-09-suspension-targets.json)。

## 2026-09-09：有界暂停目标扫描循环

scanPackSuspension 执行指定事件/精确能力/业务作用域的一轮有界扫描，每页刷新独立管理与业务 Context，统一传递原截止时间和取消信号。页大小与最大页数有上限，部署回调确认处理页后才推进游标；返回的进度可以持久化，未确认页可以使用稳定 notificationKey 重放。结束一轮不代表全局无引用或业务通知已完成。

签名数据库联测覆盖页处理后确认丢失、重启重读相同去重键、单页预算与续扫、预先取消及身份刷新挂起超时。页接收器当前为显式测试安装，尚无持久目标表/队列和 Owner 消费；不能把内存去重测试当作崩溃后 exactly-once 承诺。回调须配合取消并自行校验实际写入权限。

Retire、兼容查回和完整通知持久化仍待继续。见 [暂停扫描循环验证记录](verification-2026-09-09-suspension-scan.json)。

## 2026-09-09：暂停扫描页的实际持久化与进程恢复验证

签名 Connector 联测的扫描 accept 安装改为正式 storeInlineArtifact 命令，要求独立存储 Grant，以实际页内容摘要构造幂等键。页文档绑定暂停事件、能力、目标和下一游标，Artifact owner/source 指向事件、暂停记录及实际 Pin。注入存储成功后确认丢失，重读同页返回原 Artifact，不重复生成证据。

续扫后两页经新数据库连接回读，另起 Node 进程只凭持久 Artifact Ref、数据库与测试身份读取页面，核验内容摘要并重建相同 notificationKey 集合；不依赖父进程的 Set。恢复进程是明确的测试身份夹具，不能用于生产认证。页面仅为扫描证据，不是运行 Owner 执行授权，也不是已发送通知的回执。

本批补强实际存储装配与验收，未实现自动任务发现、页消费状态、通知业务效果、Retire 或兼容查回。见 [暂停扫描页验证记录](verification-2026-09-09-suspension-pages.json)。

## 2026-09-09：可复用暂停扫描页存储装配

新增 storeSuspensionPage，固定调用参数与准入回调，校验事件、精确能力、Pin/主体引用、页完成状态/游标以及每个 notificationKey，拒绝重复目标与错误摘要。页面按规范 JSON 和内容摘要生成稳定幂等键，通过正式 storeInlineArtifact 的当前 Grant、引用和保留策略检查保存；返回实际 Artifact 接受 Ref 与页摘要。

签名联测的扫描器改用此生产内部装配，保留确认丢失后的幂等复用及新进程读取验证，并覆盖错误 notificationKey、缺存储 Grant 拒绝。该入口受现有存储命令的 abh.action.prepare 用途和 64 KiB 限制，其他用途不能借此绕过准入；部署方应选择合适页大小。

持久文档仍是扫描证据，不能直接当作通知授权或消费回执。自动发现、业务 Owner 消费状态、Retire 与兼容查回仍待完成。见 [暂停页存储装配验证记录](verification-2026-09-09-suspension-store.json)。

## 2026-09-09：暂停扫描页的正式恢复读取

readSuspensionPage 从实际 Artifact 恢复扫描证据，要求调用方给出预期事件、精确能力和页摘要；读取原字节后复验完整内容摘要、Artifact owner/source、实际 Outbox 暂停事件和所有通知目标的 packRef/Pin/去重键。当前 Artifact 读取策略在读取前后均检查，固定回调与参数并共享截止时间。

签名联测使用新数据库连接调用该生产内部入口恢复两页，内容与原页一致，替换页摘要拒绝。宿主仍须提供独立 Artifact 读权限及保留/来源政策，文档中的目标不自动获得业务读或通知权限。后续实际 Owner 消费必须重新检查当前 Pin/Action 并原子记录效果和 Inbox。

业务通知消费、Retire、兼容查询仍未完成。见 [暂停页恢复验证记录](verification-2026-09-09-suspension-read.json)。

## 2026-09-09：Action 暂停通知观察与 Inbox 消费

actionPackSuspensionConsumer 提供每个 Action/精确能力的固定消费者，使用当前 runtime.consume-event Grant 和安装的来源/业务通知策略，锁定 Action 后核验实际 PinSet 摘要、引用与能力成员。消费者保存 ActionPackSuspensionObservation Artifact，记录已提交暂停事件、精确能力、Pin、当前 Action 及全部子 Operation 版本/状态/Attempt 数；同一事务由真实 InboxOwner 写入去重回执。

实际签名链联测覆盖观察持久化失败时 Inbox 为零、成功后重复消费与新连接重放只有一条 Inbox、撤权后重放拒绝。消费前后 Action/Operation 事实完全相同，未决责任和既有 Attempt 不因通知丢失、重放或确认而释放。

这里实现的是业务 Owner 的持久暂停观察，不自动取消业务或推断远端效果。来源与业务通知治理仍为显式安装策略；目前联测直接调用 consumeCommittedEvent，扫描页到队列的自动路由/投递尚待装配，Retire 和兼容查回仍缺。见 [Action 暂停消费验证记录](verification-2026-09-09-suspension-consumer.json)。

## 2026-09-09：暂停通知的原生队列投递与来源事实校验

新增内部 actionPackSuspensionRouter，为一个已提交暂停事件冻结明确安装的完整订阅名单（1—100 个），以 Action／登记摘要派生消费者与队列去重键。Job 绑定实际 Action、原事件与命令，不携带执行 Authority。此名单不能使用单个扫描页替代；超过上限拒绝，不截断。自动分页订阅发现、跨范围回填和全局完成水位仍未实现。

签名 Connector 联测通过真实 publishCommittedEvent 与隔离 pg-boss 入队、fetch、consumeOutboxDelivery、队列确认和 recordOutboxConsumption。两条实际 Action 分别生成观察与 Inbox；只完成第一条时不能记录整体消费完成。篡改 Job 目标、混用消费者、持久化失败、重复发布／消费、新连接重放及撤权后重放均验证。

消费者新增历史来源事实核对：在当前 Service 通知 Grant 下读取事件绑定的 Suspended 历史版本及原能力集，复验集合摘要、包摘要、登记 kind/id/version/digest。错误 kind 即使安装回调放行也拒绝；Enable 事件不能冒充暂停来源。注册 kind 与公共 kind 的映射、业务通知权限和 Artifact 保留政策仍由可信安装提供。观察保持父子事实与未决责任，不授予新执行或终止远端效果。

验证证据见 [暂停通知投递记录](verification-2026-09-09-suspension-routing.json)。

## 2026-09-09：扫描页到 Action 的恢复投递

新增内部 deliverActionSuspensionPage：从持久 Artifact 回读并核验完整扫描页，为每个 Action 刷新独立 Service 身份，在相同组织/Workspace 中调用实际暂停消费者。页面读取权限与业务通知权限分别检查；消费者额外核对页内 pinSetDigest 与实际 Pin。Run 等未安装 Owner 类型整页拒绝，不能静默跳过。

每个效果以原暂停事件和原 Action 消费者为 Inbox 去重依据，分页边界、重新扫描与既有队列投递共享相同回执。当前目标失败只回滚它自己的事务；已完成目标仍可在新数据库连接中回放。可选 onHandled 在效果提交后有界执行，确认丢失不会重复写入观察。输入、回调及策略配置在等待前固定，整页共用调用方截止时间和取消信号。

真实签名链联测覆盖：第一条已完成而第二条写入失败、第二条成功后确认丢失、新连接恢复、重复消费、真实扫描从一页拆为两页后仍返回原回执、跨 Workspace 身份拒绝、伪造 Pin 摘要拒绝、取消与撤权后重放拒绝。scanPackSuspension 的 accept 已在联测中组合实际 storeSuspensionPage 与该投递入口，只有全页返回后推进扫描。

此入口完成一页中实际 Action 的效果，不写入原事件的冻结路由或全局消费完成凭证。跨范围发现、宿主持久任务调度、新订阅回填水位及 Run 暂停 Owner 仍待实现；Retire、兼容查回和其余 V1 范围不变。验证见 [分页投递记录](verification-2026-09-09-suspension-page-delivery.json)。

## 2026-09-09：持久暂停页的数据库恢复发现

queryStoredSuspensionPages 按实际暂停事件、当前组织/Workspace/用途发现可用 JSON Artifact，使用绑定事件、精确能力和当前身份的 UUID 游标。发现先独立授权，再逐项授权读取正文；仅返回经过 readSuspensionPage 完整复验的匹配页面。其他能力或无关证据不会成为通知任务，空匹配页仍保留扫描游标。

独立 Node 进程恢复联测现在仅接收数据库、测试身份、事件、能力和 Grant，不再传入 Artifact 列表；它实际分页发现并重建全部通知键。覆盖发现拒绝、正文读取拒绝、游标替换以及空匹配分页。该接口返回已存工作而非仅未完成任务；投递继续依靠原事件 Inbox 去重。宿主循环、跨业务范围调度、全局完成水位和 Run Owner 仍未完成，UUID 扫描需重扫以覆盖并发插入。

验证见 [持久页发现记录](verification-2026-09-09-suspension-discovery.json)。

## 2026-09-09：暂停通知恢复 Worker 与 Runtime 宿主

新增 runSuspensionRecoveryWorker，持续分页发现指定事件/能力/业务范围的持久页面，并执行实际 Action 暂停消费。整轮完成后重置 UUID 游标进行重扫；每页的所有效果及 onPage 确认成功后才推进游标。失败向宿主抛出，重启重扫仍复用已提交 Inbox。不同页面分别有界，停机取消可中断身份源、读写和观察回调。

TenantRuntimeOptions.suspensionRecovery 可显式安装多个范围的恢复循环，加入现有共同租户绑定及监督收尾。安装配置、引用和回调在 createTenantRuntimeLoops 时固定，业务 Service 身份与页面发现身份分别刷新，组织/Workspace 漂移拒绝。

真实签名链联测验证连续两轮扫描只保留两条 Inbox、每轮重新获取身份、身份范围漂移拒绝、卡住的身份源被停机取消，以及实际 Runtime 生成的恢复循环在安装对象被修改后仍处理原事件。已有队列投递与扫描重放共同使用原事件 Inbox。

当前仍要求宿主明确安装 eventRef/capability；全局暂停事件/业务范围发现、故障任务隔离、Run Owner、Retire/兼容查回及生产治理尚未完成。验证见 [暂停恢复 Worker 记录](verification-2026-09-09-suspension-worker.json)。

本批验证：签名联测 2 通过；Core 首轮 497 通过、6 跳过，两组因 PostgreSQL 容器端口绑定超时未进入业务断言，随后串行重跑对应文件 17 通过、0 失败。构建、类型、API 和文档检查通过，原始失败及重试日志均保留。

## 2026-09-09：管理侧暂停事件的恢复发现

discoverPackSuspensions 从实际已提交 Outbox 分页发现暂停事件，并回读历史 Suspended Pack 与完整能力登记集合。要求同组织、无 Workspace 的 pack.manage 身份、当前 packs.suspend Grant、独立发现政策与每个来源的读策略。UUID 游标绑定当前组织/身份/用途，返回前重新校验发现权限；不以已经发布或已有消费者回执排除事件。

独立进程恢复联测现在也不传 eventRef：新进程用管理身份发现事件，再用独立业务读取身份发现持久扫描页，重建相同通知键。覆盖缺 Grant、用途错误、游标替换、结束游标、发现/来源策略拒绝、返回前拒绝及撤权后重放。能力类型映射及当前业务通知权限仍独立安装，不从管理权限推导。

该入口补齐事件查询，不代表生产全局调度已完成。跨业务范围枚举、自动扫描与投递任务装配、Run Owner、Retire/兼容查回仍缺；UUID 扫描仍需重扫处理并发插入。验证见 [暂停事件发现记录](verification-2026-09-09-suspension-events.json)。

## 2026-09-09：Action 暂停扫描、保存与投递的正式组合

processActionSuspension 为单个已提交事件/能力/业务范围串联实际目标查询、storeSuspensionPage 和 deliverActionSuspensionPage。每页刷新管理和业务读取身份，分别校验管理 Grant、业务读取、Artifact 存储、通知 Service 与业务 Owner 权限；固定整个调用的身份范围、参数、回调及截止时间。注册类型映射必须与投递安装一致。

整页实际消费后才推进游标；到达页数上限返回可续跑游标，失败不返回虚假进度。重启可从头扫描，持久页面及原事件 Inbox 保证幂等。签名联测覆盖单页暂停续跑、完整两页重放、缺失存储 Grant、映射冲突、确认丢失及新连接恢复后仍只有两条 Inbox。

该入口关闭此前由测试 accept 回调串联的生产内部装配缺口；自动枚举全部业务范围、事件到多范围任务调度、Run Owner、Retire/兼容查回仍待实现。本次未重跑全量 Core。验证见 [暂停处理组合记录](verification-2026-09-09-suspension-processing.json)。

## 2026-09-09：暂停事件到已安装业务范围的自动调度

runSuspensionDispatchWorker 自动发现管理侧暂停事件，从真实历史能力集合取得 id/version/registrationDigest，经显式注册类型到公共类型映射，为每个匹配的已安装业务范围执行 processActionSuspension。逐页处理直至该范围扫描完成；整批成功后推进事件游标，最后一批后重扫。每页刷新权限和身份，业务范围绑定跨处理调用保留，不能在换页或重扫时切换组织/Workspace/主体。

范围列表与策略回调在运行前固定；重启以实际页面/Inbox 事实恢复。未映射的注册类型拒绝而非静默完成。该循环不产生原事件的全局消费水位或退休证明，范围列表仍由宿主治理显式安装，不能据此宣称已经枚举所有业务范围。

签名联测不再向 Worker 传 eventRef 或 capability exactRef，只配置类型映射与两条重叠业务订阅；它自动发现事件、构造能力引用、完成每条订阅的两页扫描，连续两轮仍只有两条真实 Inbox。另验证未映射类型拒绝、业务身份跨页漂移拒绝与卡住的管理身份源停机取消。此测试是同范围重叠订阅，不是异质多 Workspace 业务联合验收。

仍缺生产宿主自动安装、范围目录、任务失败隔离、Run Owner、Retire/兼容查回。本批未重跑全量 Core。见 [暂停自动调度记录](verification-2026-09-09-suspension-dispatch.json)。

## 2026-09-09：暂停调度按业务范围隔离失败

SuspensionDispatchWorker 可显式安装 onScopeFailure 持久记录回调。某范围处理失败后，只有回调成功返回才继续其他范围；没有安装回调或记录失败仍终止循环。失败记录只包含 eventRef、精确能力、scopeId 和结构化错误码，未知异常归为 INTERNAL_ERROR，不传播原始异常正文。管理事件发现失败及未映射能力仍终止循环。

onPage 新增 blockedScopes，与成功 scopeSweeps 分开。事件扫描完成不表示业务效果全完成；失败范围在下一次完整重扫时从头重试，已提交页面/Inbox 继续去重。没有新增绕过授权或释放责任的路径。

签名联测注入第一范围存储失败，实际保存脱敏诊断 Artifact 后第二范围正常处理；下一轮修复第一范围，两范围都完成。失败记录回调不可用则立即失败。诊断存储为显式测试安装，生产宿主仍需自己的授权持久接收器；本批未重跑全量 Core。见 [暂停故障隔离记录](verification-2026-09-09-suspension-isolation.json)。

## 2026-09-09：暂停失败诊断的正式存储

storeSuspensionFailure 通过正式 storeInlineArtifact 命令保存 PackSuspensionScopeFailure，要求当前存储 Grant、用途、来源与保留策略。事务中重新读取真实暂停事件，Enable 等其他事件拒绝；只选取事件/精确能力/scopeId/注册错误码，输入附带 message/stack 不进入正文。诊断 Artifact 归组织所有，来源引用原事件。

相同诊断按摘要幂等复用 Artifact，重放仍重新授权并校验来源。重复记录不表示发生次数，不会自动随成功消失，也不构成业务通知、责任释放或远端无效果证据。存储回调受统一截止时间及取消约束。

故障隔离联测已替换直接 Owner 写入，使用该入口。覆盖缺 Grant、伪造事件来源、重复写入、新连接重放、额外异常正文剔除以及当前策略拒绝重放。宿主仍需提供可信身份、存储政策和授权；本批未重跑全量 Core。验证见 [失败诊断存储记录](verification-2026-09-09-suspension-failure-store.json)。

## 2026-09-09：Retire 命令和退役证据契约

新增 RetirePackPayload、RetirePackCommand、PackRetirementRecord 及独立内部管理 action abh.packs.retire。命令要求原 Suspended 版本 3、预期部署版本、原因、证据、referenceReviewRef 和 rollbackWindowEndsAt；无 emergency 绕过字段。退役证据要求同一包推进至版本 4，部署版本推进一次，retiredAt 不早于回滚窗口结束。

契约校验不证明引用水位审查实际完成，也不证明窗口由可信治理确定。下一步必须实现 Owner 在当前授权下回读引用审查证据、校验真实时间与版本，并以迁移将 InstalledPackRecord/数据库转换接入 Retired。当前 InstalledPackRecord 仍只支持 Staged/Enabled/Suspended，不得将新增命令注册误报为退役执行已实现。任何包字节删除都仍未授权实现，未决对账代码必须保留。

Contracts 全量 307 通过，生成制品及公开 API 报告同步更新。测试覆盖缺失审查/窗口、错误引用、跳版本、错误部署推进、窗口前退役、内部可见性和独立用途限制。见 [退役契约验证](verification-2026-09-09-retire-contracts.json)。

## 2026-09-09：Retired 状态、数据库约束和 Owner 转换

retirePack 已接入内部管理命令：当前独立 packs.retire Grant、控制 fences、部署锁、精确 Suspended CAS、真实数据库时钟及必填引用审查策略。读取实际 referenceReviewRef Artifact 并核验其 owner 是原 Suspended 版本，交给可信安装校验引用覆盖与回滚窗口。首次转换和历史重放均检查当前授权、审查和政策。

InstalledPackRecord 新增 Retired/retirement；迁移 1788889000000_pack_retirement.cjs 更新当前表及历史表的生命周期约束。版本 4 与部署版本递进、原 Enable/Suspend 身份和时间顺序、回滚窗口及审查引用必须一致。数据库约束摘要使用隔离 PG 的 pg_get_constraintdef 实测并更新 readiness；临时计算脚本已删除。

实际转换原子保留旧/新历史、推进部署修订、写 Journal/Outbox/CommandReceipt，不删除包字节，不修改 Action/Operation/账本。签名联测覆盖审查拒绝、缺 Grant、未来窗口、版本冲突、历史写入故障整体回滚、成功重放、旧 Suspend 来源仍可读取、父子事实不变、撤权与当前审查拒绝重放，以及伪造退役时间被数据库拒绝。

这实现逻辑退役，不代表物理包移除或全局引用水位完成。审查 Artifact 的真实跨 Owner 覆盖和窗口治理仍是必填可信安装；联测明确保留已有 Pin/Action/Operation 引用。Run Owner、全局引用目录、兼容查回和生产治理仍缺。验证见 [退役生命周期记录](verification-2026-09-09-retire-lifecycle.json)。

## 2026-09-09：兼容查询出口的双 Connector 证据

QueryExitRecord 新增可选 queryConnectorRef、compatibilityEvidenceRef、compatibilityEvidenceDigest，三者必须一起出现，替代能力必须区别于原 connectorRef；三字段纳入出口摘要。原 connectorRef 始终来自原 Permit，继续保留 Provider 幂等键、payloadDigest、Connection、Account 与原计划身份。

InstalledQueryPolicy 可显式安装 compatibility。不同 Connector 查询必须读取实际 Artifact，核验其 owner 为当前 Operation，正文绑定原/替代能力、Operation、Connection、Account 和有效期，再由当前可信策略授权。证据有效期参与出口截止计算；原独立 Scope Authority、Grant、Purpose、Connection、预算、限流、Lease 检查不变。queryOnce 在等待前固定兼容配置和回调，成功出口仍先提交后调用 transport。

Actions 联测将第二次预算查询改为实际替代 transport；无兼容证据、当前策略拒绝、错误替代绑定或过期证据均零调用且不收费。成功后原 Connector 和替代 Connector 同时记录，费用累计正确、Operation 保持未决。Contracts 验证证据字段成组、不能伪装同一能力及替换证据摘要会改变出口摘要。

这里只补齐通用可信 Query 出口，queryPackOnce 仍只解析原 Enabled 精确能力。暂停/退役后从另一实际签名 Enabled Pack 解析替代实现、治理发布兼容证明及实际兼容归一化端到端仍需继续实现，不得将本批当作完整 Pack 兼容查回验收。验证见 [兼容查询出口记录](verification-2026-09-09-compatible-query.json)。

## 2026-09-09：兼容查询证据正式 Schema

CompatibleQueryEvidence 纳入生成契约，封闭字段集合，要求当前 Operation、Connection、Account、有效期和两个不同的 Connector 精确引用。QueryExitOwner 读取实际 Artifact 后先使用正式契约验证，再检查绑定及可信兼容策略。额外 approved/URL、错误能力类型及缺少字段拒绝；本批不改变原查询权限与计费。

Contracts 全量 308 通过；Actions 回归包含新增错误能力类型和额外批准字段的零调用拒绝验证。实际签名替代 Pack 解析、兼容证明发行治理和归一化端到端仍未完成。验证见 [兼容证据契约记录](verification-2026-09-09-compatible-evidence.json)。

## 2026-09-09：兼容查询证据的事务稳定性

QueryExitOwner 在 Action/Lease 等业务锁之后对兼容 Artifact 获取共享行锁，重新读取版本/内容摘要、重新执行当前兼容授权，并在回调后再次回读。证据作废或版本变化拒绝本次查询并回滚计费；并发作废必须等待当前出口事务完成。有效期仍由回读后的数据库时钟约束。

Actions 联测覆盖后续锁回调在同事务作废证据、最终兼容策略拒绝、拒绝后证据修改回滚与零额外调用/计费，以及独立数据库连接 FOR UPDATE NOWAIT 被最终证据共享锁拒绝。此改动补齐通用兼容出口一致性，实际签名替代 Pack 解析仍待实现；未重跑全量 Core。见 [兼容证据锁验证](verification-2026-09-09-compatible-query-evidence-lock.json)。

## 2026-09-09：替代 Pack 查询解析装配

queryPackOnce 现在根据显式 compatibility 安装选择替代查询解析路径。预备令牌在原事务内收集替代能力的完整 fences，业务锁之后、出口提交之前消费一次；保留原 Action 的真实 Pin 输入，不为替代能力生成或改写 Pin。resolveEnabledPackCapability 复用原解析器的当前 Enabled/注册摘要/implementationRef、内容完整性、Schema、信任和健康复核；普通派发解析仍要求当前可执行的 Assignment。

替代路径读取实际 QueryExit、兼容 Artifact 和原 Pin，核对 Action/Operation、两个 Connector、Connection、Account、摘要及数据库时间。原 Pin 仅证明历史绑定，暂停的 Assignment 不妨碍独立授权的对账。证据共享锁持续到提交，Pack 回调之后再次验证，拒绝解析期间作废证据。发送仍发生在出口与预算消费提交之后。

真实 PostgreSQL Actions 回归覆盖缺少独立能力读取 Grant、错误实现引用、当前策略拒绝、Schema 内容损坏、解析期间证据作废的零额外调用和预算回滚；成功场景已撤销派发 Grant，替代查询保留原 Pin/Permit 幂等键及未决 Operation。另在独立回滚事务内暂停原 Assignment，验证历史查询 Pin 仍可读取、普通执行 Pin 拒绝；事务回滚保持共享 fixture 隔离。普通能力解析回归及原有真实 Cosign 签名 Connector 链路也通过。

替代 Pack 使用明确的管理元数据 fixture，不能作为两个实际签名 Pack 在 Suspend/Retire 后联合恢复的验收。兼容证据发行治理、兼容归一化及签名替代 Pack 的最终对账联测仍待实现；未重跑全量 Core，V1 总体尚未完成。验证见 [替代 Pack 查询解析记录](verification-2026-09-09-compatible-pack.json)。

## 2026-09-09：双签名 Pack 退役后查回与最终收敛

安装 fixture 提取为 installSignedConnectorFixture，读取组织当前部署修订，复用真实签名治理发布、Validation、Stage、Capability 注册、签名数据影响报告、迁移不适用证明、CTK、Human 决策和 Enable；身份及管理 Grant 仍是显式管理 fixture。第二个 Pack 使用独立生成的 release/builder/CTK 签名密钥和不同包身份，部署修订沿同一组织继续推进。

原 Connector 完成一次派发，只返回 Pending 接受事实；随后原包经 Suspend、Retire，原 Assignment 暂停。替代包在同一组织真实安装并 Enabled，以独立 Scope 查询 Authority、能力读取 Grant、兼容 Artifact 和预算完成查询。原包源读取次数为零，替代字节通过两次内容验证；出口先提交，保留原 Connector/幂等键并记录替代身份。Capture 故障后只重试持久化，替代 Provider 查询共一次，查询累计费用为两次。

原派发 Pending 与第一次空查询不足以证明成功。替代查询提供同一外部身份的更高版本 Applied 事实，经全部三条真实 Receipt 参与 Reconciliation 得到 ConfirmedSuccess。独立当前 Controller Grant 和 Lease 下应用结果，错误授权及最终写入故障整体回滚；成功后 Operation Closed/Succeeded、资源占用清除。ActionResult 按完整子版本与报告集合汇总至 Closed/Succeeded，重放不重复写入；本 Action 未声明计量资源，资源结算集合为空，查询费用单独保留。

该链路为真实 PostgreSQL/Cosign/Owner 联测，Provider、兼容证明授权、归一化、比较规则及结算政策仍是可信测试安装，不代表生产治理或独立 CTK 验收。兼容证据正式发行治理、生产宿主与 V1 其他模块仍有缺口。未重跑全量 Core。验证见 [双签名恢复验证](verification-2026-09-09-signed-recovery.json)。

## 2026-09-09：兼容查询证据正式发布入口

新增内部 RecordCompatibleQueryEvidenceCommand、封闭 Payload 和独立 abh.operations.record-compatible-query-evidence 权限，仅允许 abh.operation.reconcile 用途。证据、实际审查 Artifact 和保留策略均纳入命令摘要；不接受调用方批准标记或出站 URL。Contracts、目录和 API 报告同步生成。

recordCompatibleQueryEvidence 在命令幂等锁、完整 Control fences 和 Action 锁下核对真实未决 Operation 精确版本、已派发 Attempt、原 Permit/Connector、Connection/Account；读取以当前 Operation 为 owner 的 JSON 审查 Artifact，锁定源行，并由必填可信策略核验适用 CTK、只读语义、隔离和当前治理。存储策略负责正文用途、引用可见性及区域/保留准入。回调有界，写入前后复核审查版本、Operation、Connection、Grant 和数据库有效期；Artifact 与审计/Outbox/命令回执同事务提交。

成功返回实际 ArtifactRef，可直接供 QueryExit 读取。重放重新执行当前审查和授权，核验已存证据正文及元数据；审查作废、撤权或过期拒绝，不能重新发布。证据不替代独立 Query Authority、Lease、预算、当前兼容授权和 Enabled Pack 解析，也不自动改变 Operation 或调用 Provider。

双签名恢复 fixture 已替换直接兼容 Artifact 写入，覆盖缺 Grant、误用 Capture Grant、用途错误、原绑定/版本错误、审查拒绝、回调撤权/作废证据、最终复核失败导致新 Artifact 回滚、过期拒绝、并发作废被共享行锁阻挡、成功重放去重和撤权后拒绝重放，随后仍完成替代查询与最终业务收敛。

此入口落实治理执行边界，审查材料发行与实际 CTK/隔离/只读语义的生产核验策略仍须可信安装；当前联测使用显式 fixture 审查，不宣称生产兼容治理完成。V1 其他模块仍按总表保留。验证见 [兼容证据发布验证](verification-2026-09-09-compatible-issuance.json)。

## 2026-09-09：Mission Draft Owner 与条件版本

Mission 状态枚举及设计列明的迁移进入统一状态 Registry，新增 MissionRecord、MissionConditionInput/Record、CreateMissionPayload 和内部 CreateMissionCommand。条件摘要绑定目标 revision 与所有条件引用，goalRevision 与 aggregate version 分离；Draft 禁止携带执行 Authority/Run/暂停或清理事实。状态 Registry 仅定义允许的协议，不能作为尚未实现迁移的完成证据。

新增 core.missions 与 core.mission_conditions，启用强制租户 RLS、受限 Runtime 权限与 readiness 清单；条件表不可 UPDATE/DELETE。MissionOwner 校验真实 goal Artifact，保存 Draft、条件版本、Audit/Outbox；createMission 通过独立 abh.missions.create Grant 和 abh.mission.manage 用途，固定受信回调，在幂等与控制锁内复核定义、目标、权限，末次拒绝回滚整个创建。定义安装须校验实际注册 Workflow、确定性条件、资源与责任范围；本批 fixture 明确模拟该安装。

真实 PG 联测验证末次定义拒绝时无残余 Mission/conditions、并发同键一个 Draft、重放重新检查定义、跨租户不可见、条件表禁止更新及撤权拒绝重放。Contracts 覆盖 Draft 不得预先断言运行事实、目标 revision 约束、条件摘要及额外脚本拒绝。

本批完成 Mission 的真实 Draft 持久化基础，尚未完成激活/MissionAuthority、Trigger/Run 创建、Blocker、暂停取消与目标修订、结果关闭、公开 Query/HTTP 或生产 Definition 安装。整体 V1 仍未达到 90%，按设计继续推进。验证见 [Mission Draft 验证](verification-2026-09-09-mission-draft.json)。

## 2026-09-10：Mission 生命周期、Run Orchestrator 基础

新增 Mission 完整生命周期 Commands：ActivateMission（Draft→Active CAS + Authority 绑定）、PauseMission、CancelMission（stopEpoch 递增 + cleanupStatus）、ResumeMission（Required Blocker 全解析校验）、ReviseMissionGoal、CloseMission（Completed/Cancelled 终态）、BlockMission（Blocker 证据 + 状态转换）和 ResolveBlocker。

新增 SubmitTrigger（同键去重 + 水位比较 + Obsolete 标记）和 mission_triggers 表迁移。Run Orchestrator 基础：RunRecord/StartRunPayload/CompleteRunPayload/TaskRecord/RunView 契约、Run 状态机（Queued→Running→Waiting/Paused→Completed/Failed/Cancelled）、StartRun/CompleteRun 命令注册、GetRun/ListRuns 查询、core.runs 和 core.tasks 表迁移（非终态 Run 唯一约束 + RLS）。

Contracts 51 个制品（原 50），311 项测试全部通过，公开 API 报告更新至 9 入口。Mission 查询（GetMission/ListMissions）已注册 OpenAPI 路径。Mission Blocker 表迁移已创建。

仍缺：激活 Authority 的正式治理入口（当前为可信回调）、Run 的 Task Graph Patch 和 Invocation、Context/Verification 模块、HTTP 路由挂载到 adapter-fastify、公开 HTTP 身份入口、生产 Definition 安装、SDK/CLI 命令。整体 V1 仍在推进中。

## 2026-09-10：Mission HTTP 路由与 CLI 命令

Mission 8 个命令从 Internal 提升为 Public 并注册 HTTP 路由：CreateMission（201）、ActivateMission（200）、PauseMission（200）、CancelMission（200）、ResumeMission（200）、BlockMission（200）、CloseMission（200）、SubmitTrigger（201）。ReviseMissionGoal 和 ResolveBlocker 同步提升。OpenAPI 从 16 路径增长至 28 路径。

新增 `createMissionHandlers` 内部组合函数（packages/core/src/server/mission-http.ts），在 `createCoreHttpApp` 中通过 `installation.mission` 可选安装。CLI `abh mission` 子命令支持 list/get/activate/pause/cancel，经 HTTP 调用公开 API。Run 的 StartRun/CompleteRun 同步注册为 Public 命令并生成 HTTP 路由。

Contracts OpenAPI 路径 12→28，311 项测试全部通过，公开 API 报告更新。CLI mission 子命令通过 node --check。

## 2026-09-10：Mission/Run 查询路由、Context/Verification 契约与 SDK 客户端

Mission/Run 查询路由接入 createCoreHttpApp：GetMission 返回 MissionView（含 pendingTriggers/blockers 占位）、GetRun 返回 RunView（含 tasks）。新增 ContextManifest、VerificationReport、SubmitVerificationPayload 契约。SubmitVerification 命令注册为 Public（201）并生成 HTTP 路由。OpenAPI 29 路径。

SDK 客户端（createAbhClient）新增 missions/runs/verification 命名空间，覆盖 13 个操作（get/list/create/activate/pause/cancel/resume/submitTrigger/start/complete/submitVerification 等），命令和查询类型联合已扩展至全部新注册路由。

## 2026-09-10：Verification Owner、Mission/Run 列表查询与 CLI verify

新增 VerificationOwner.submit 实现：创建 VerificationReport、通过 digestContract 计算摘要、同事务更新 Task 状态（Pass→Verifying、Reject→Failed）。迁移 1788894000000 创建 core.verification_reports 和 core.context_manifests 表（强制 RLS）。

submitVerification 命令入口实现幂等提交（含 PURPOSE_DENIED 检查、fences 和 Grant 验证）。Mission 列表和 Run 列表查询处理器接入 HTTP（abh.missions.list、abh.runs.list），默认 LIMIT 25 按 updated_at 倒序。

CLI `abh mission verify` 子命令支持提交验证报告，可指定 invocation、artifact 和 verdict。Contracts 51 制品匹配、311 测试通过、9 API 入口匹配、725 文档链接通过。

## 2026-09-10：ReviseMissionGoal Owner 与 Context Owner

MissionOwner 新增 reviseGoal 实现：CAS 校验 Active/Paused/Blocked 状态、创建不可变新 conditionRef 版本、goalRevision 递增、stopEpoch 提升（通知旧 Run 重规划）。原子写入新条件行和 Mission 行，保持 Audit/Outbox 一致性。

新增 ContextOwner：store（同事务写入 ContextManifest 并计算 manifestDigest）、get（按 contextRef 精确读取）。Context Manifest 绑定 taskRef/goalDigest/inputRefs/purposeOfUse/executionMode，通过 core.context_manifests 表持久化。

HTTP 路由新增 ReviseMissionGoal、ResolveBlocker（更新 Blocker 并 resume）、GetContext 查询。OpenAPI 30 路径，CLI 支持 mission verify 子命令。

## 2026-09-10：Tool Gateway 契约与 Owner

新增 Gateway 契约（23-24 模块基础）：ToolCapability（effectClass: Read/Compute/Propose）、ToolBinding（invocationRef + callLimit + deadline）、ToolCallRecord（幂等 callKey + argumentDigest + resultArtifactRef）、ModelRoute（allowedModels + purposeOfUse + dataClass + region）、ModelCallRecord（Prepared→InFlight→Completed/Failed）。

InvokeTool 命令注册为 Public（201）并生成 HTTP 路由（31 OpenAPI 路径）。ToolGatewayOwner.bind 在 Invocation Created 阶段登记 Binding；invoke 同事务检查 Binding Active、同 callKey 幂等去重（不同 argumentDigest 返回 IDEMPOTENCY_CONFLICT）。

迁移 1788895000000 创建 core.tool_bindings、core.tool_calls（binding+callKey 唯一）、core.model_routes、core.model_calls 四张表（强制 RLS）。CLI mission 帮助文本更新至 6 子命令。

## 2026-09-10：Service Assembly 与 CLI run 子命令

新增 assembleAbhService（packages/core/src/server/assemble.ts）：组合 Mission HTTP 路由、IdentityIngress、credentials 和可选 deadline/bodyLimit 到完整的 CoreHttpInstallation，返回带 close() 的 AssembledService。生产部署通过 runHttpService({tenant}) 追加 Durable Worker 生命周期。

CLI `abh run` 子命令支持 `--port`/`--host`/`--db` 参数和 `DATABASE_URL`/`ABH_PORT` 环境变量，验证连接后提示完整装配所需的 Identity/Mission 配置。`abh` 入口已接入三个子命令：doctor（原有）、mission（6 操作）、run（服务启动）。

## 2026-09-10：Learning/Evaluation 契约、Projection 契约与 Signal Capture

新增 Learning 契约（16 模块基础）：CaptureSignalPayload（sourceEventRef + signalType + artifactRefs + scopeRef + purposeOfUse）、LearningSignalRecord（digest 验证）。CaptureSignal 命令注册为 Public（201），生成 HTTP 路由（32 OpenAPI 路径）。

新增 Projection 契约（50 模块基础）：ProjectionEnvelope（subjectRef + watermark + stale + data + availableActions）、MissionSummaryProjection（Mission 读模型：goal 摘要/业务阶段/Run 引用/Trigger/Blocker 计数）。

LearningOwner.captureSignal 实现 LEARNING_PURPOSE_DENIED 检查 + Signal 持久化。迁移 1788896000000 创建 core.learning_signals（signal_type 索引）和 read.projections（projectionType+subjectId 唯一 + watermark + stale）。

## 2026-09-10：Pi Adapter 契约、Projection/Learning HTTP 路由

新增 Pi Agent Adapter 契约（12 模块基础）：AgentTaskContract（固定 goal/inputRefs/definitionRef/outputSchemaRef/modelRouteRef/toolBindingRefs/maxTurns/maxTokens/contextDigest）、RuntimeEvent（invocationRef+sequence+kind: Started/TurnCompleted/ToolRequested/ToolObserved/OutputReady/Stopped/Failed + stopReason）。

新增 ProjectionQueryResult。GetProjection 查询注册为 Public 并接入 HTTP（33 OpenAPI 路径）。CaptureSignal 命令和 GetProjection 查询通过 mission-http.ts 接入 createCoreHttpApp，MISSION HTTP 命令路由扩展至 12 个。

## 2026-09-10：Realtime SSE、Workbench 投影契约与 Pi Agent 完整契约

新增 ProjectionChangedEvent（SSE 推送载荷：subjectRef + projectionType + version + watermark）。新增 ActionTimelineProjection（actionRef + intentSummary + operationSummaries + unknownCount + compensationRefs）和 ResponsibilityInboxProjection（requestRef + assigneeRef + impactSummary + deadline + availableResponses）。

新增 AgentTaskContract（Pi Agent 固定任务定义：goal/inputRefs/definitionRef/outputSchemaRef/modelRouteRef/toolBindingRefs/maxTurns/maxTokens/contextDigest）和 InvocationHandle（invocationRef + lastEventSequence + runtimeStatus）和 RuntimeEvent（kind: Started/TurnCompleted/ToolRequested/ToolObserved/OutputReady/Stopped/Failed + stopReason: Completed/BudgetExceeded/Deadline/NoProgress/Cancelled/DependencyFailure/InvalidOutput）。

## 2026-09-10：MissionSummary 投影构建器与 README 状态更新

MissionSummary 投影构建器实现：从 core.missions/core.mission_triggers/core.mission_blockers 实时读取 Mission 当前状态并构建 ProjectionEnvelope（含状态相关的 availableActions），通过 UPSERT 写入 read.projections 表（ON CONFLICT 幂等更新）。GetProjection 查询优先读取缓存投影，缓存未命中时可通过构建器按需重建。

README 更新至当时实现状态：M0-C→M0-D 过渡、29/33 模块已实现、OpenAPI 33 路径、`abh mission` CLI 6 子命令、Pi Agent 契约就绪等待 pi-ai 集成。

## 2026-09-10：Pi Agent 0.85.1 运行时适配基础

新增 `@abh/adapter-pi` workspace 包，固定 `@earendil-works/pi-agent-core@0.85.1` 和同版 `@earendil-works/pi-ai`。适配器复用真实上游 `Agent` prompt/工具循环，不复制 Agent 引擎；启动时拒绝非 0.85.1 版本、非受限缓冲/清理配置和出站 telemetry。

运行时要求调用方注入 Model/Tool Gateway 和已授权 Context，未知或未绑定工具在 `beforeToolCall` 拒绝，工具循环固定 sequential。模型返回经 Pi 事件归一化为 `RuntimeEvent`，包含 Started、ToolRequested、ToolObserved、OutputReady、TurnCompleted 和 Stopped；缓冲受 32—4096 上限约束，完成水位可用于恢复读取。Turn 数、Token、费用和 Deadline 触发有界停止，外部取消提供 stopEpoch 和 cleanup deadline。

离线联测使用真实 Pi Loop 和内存 Gateway fixture，覆盖不支持版本、缓冲边界、完整工具回环、模型依赖失败、事件序列和完成水位；类型、构建、51 份契约漂移和 725 个文档链接通过。`continue`、受治理恢复许可、生产 Gateway 装配、完整取消/预算/恢复 CTK 矩阵仍未完成。验证见 [Pi Adapter 验证](verification-2026-09-10-pi-adapter.json)。

## 2026-09-10：Gateway 清单、Mission 迁移与 Pi Adapter 门禁修复

修复新增 Mission/Run 迁移中的 PostgreSQL 部分唯一约束语法，补充 `read` schema，并将 Run/Mission/Trigger/Blocker/Task/Verification/Context/Tool/Model/Learning/Projection 表纳入数据库安全清单。迁移后的 Run 状态约束与生成 SQL 片段保持一致，readiness 现在覆盖全部新 Owner 表的 RLS、租户策略和权限。

协议生成器支持显式命令用途；Mission 创建与生命周期命令固定绑定 `abh.mission.manage`，避免 Catalog 将公共管理命令误标为通用 Action 准备用途。该修复使空授权请求稳定返回 `AUTHORITY_REQUIRED`，有授权时才进入定义和 fence 检查。

新增 `@abh/adapter-pi` 后，Core 全量 515 项通过、0 失败（6 项真实 Cosign 用例按环境条件跳过）；契约 311 项、Fastify 12 项、CLI 和 Adapter 测试通过，doctor 数据诊断通过。验证见 [Pi Adapter 验证](verification-2026-09-10-pi-adapter.json)。

## 2026-09-11：Run 列表过滤分页

`abh.runs.list` 已接入合同过滤、有界 keyset 分页、显式 `RunCursorCodec` 和事务内当前 `abh.runs.read` Grant/fence 重验。HTTP route 与类型化客户端透传 `missionStatus`、`missionId`、`limit` 和 opaque cursor；游标绑定身份、双重组织、Workspace、用途、授权 epoch 和全部筛选。定向真实 PostgreSQL 回归覆盖两页收敛、Mission 过滤、空页、缺权拒绝和筛选漂移失败，专项测试覆盖防篡改、过期、身份漂移和密钥配置。

## 2026-09-11：Context Manifest 授权读取

`abh.contexts.get` 已改为显式 Grant 安装加强读事务内 `abh.missions.read`/fence 重验。`ContextOwner.getById` 现在过滤当前用途和 Workspace，并核对数据库版本、Manifest 引用、资源组织以及按合同 digest 字段重算的 `manifestDigest`；修复旧实现把 `manifestDigest` 自身纳入哈希的循环缺陷。真实 PostgreSQL 回归覆盖授权读取、缺权/撤权、错误用途、行版本漂移和摘要篡改。Core 集成文件改为串行调度，避免真实容器和策略 Worker 在并发 2 下发生资源性抖动。

## 2026-09-11：Projection 查询边界收敛与 Mission Run 历史

`abh.projections.list` 现在与 Mission/Run 查询使用同一信任边界：HTTP 层只透传合同 query，Mission 查询处理器负责解码 `ProjectionCursorCodec`、解析当前 Grant resolver，并在事务内交给 Projection Owner 逐行重验 `abh.projections.read`。Owner 只返回内部 keyset 位置和已授权页，不再制造明文 JSON cursor；公开 cursor 由处理器重新加密并绑定身份和全部筛选。回归覆盖两页收敛、筛选漂移、令牌篡改、撤权后返回空页而不是泄露数据。

Workbench Mission 详情现在通过类型化 `client.runs.list({missionId,limit:25})` 读取 Run 历史，展示 trigger、run 版本、状态、执行模式和更新时间。Fake API 增加 `abh.runs.list` 路由，生产构建浏览器旅程验证两态 Run 的呈现和可访问性。该入口只做最近 25 条授权摘要，不替代生产队列托管、连续订阅水位或 Run 编排。

完整 `pnpm check` 通过：Core 552 项中 546 通过、6 跳过、0 失败；全工作区 916 项中 910 通过、6 跳过、0 失败。Contracts 51 个 artifact、API 13 个入口、Docs 769 个链接、全仓类型检查和构建通过。Workbench 生产构建浏览器旅程通过。

## 2026-09-11：队列交付策略与清理水位

pg-boss 适配器不再硬编码交付策略。宿主可按 control/reconcile/interactive/background 显式配置 active 租约、原生保留窗口、完成后清理延迟、重试次数、延迟和退避；启动前统一校验并写入 pg-boss 原生 queue 元数据。`deleteAfterSeconds: 0` 明确表示保留已完成 Job 以支持幂等回放；正值启用数据库时钟维护清理，但同一 dedupeKey 后续可重新入队。`retryDelayMax` 只能配合指数退避，Core `QueueAdmissionDirectory` 文档也纠正为已装配的生产授权解析入口。

真实 PostgreSQL 回归验证非法租约和退避组合拒绝启动、合法策略精确落到 `abh_pgboss.queue`，以及未覆盖队列继续使用安全默认值。

完整 `pnpm check` 通过：Core 553 项中 547 通过、6 跳过、0 失败；全工作区 917 项中 911 通过、6 跳过、0 失败。Contracts 51 个 artifact、API 13 个入口、Docs 769 个链接、全仓类型检查和构建通过。

## 2026-09-11：Run 详情与任务强读

Workbench 新增 `/runs/[id]` 强读详情：公开 `abh.runs.get` 返回 Run 生命周期、执行模式、目标修订、Workflow、Assignment Snapshot、Mission 链接和最多 100 条 Task。Mission Run 历史现在提供可访问链接，形成 Mission→Run→Task 观测路径；跨组织直接访问继续由服务端当前 Grant 拒绝。

生产构建浏览器旅程覆盖 Completed Run 的两项 Task、返回 Mission、Organization B 直接访问被拒绝。Fake API 对未知 Run 返回 `RESOURCE_NOT_FOUND`，不会把未安装对象伪装成空任务。

该旅程暴露公开客户端在 query/command 包装层把 `ABH_ERROR` 统一改写成 `INVALID_ARGUMENT` 的缺陷。客户端现在保留服务端 `RESOURCE_NOT_FOUND`、`FORBIDDEN`、`VERSION_CONFLICT` 等注册错误及其响应，只对本地输入校验失败生成 `INVALID_ARGUMENT`；专项客户端测试继续确认注册错误保留 correlation 且不冒充回滚结论。

## 2026-09-12：Run 取消闭环

新增公开命令 `abh.runs.cancel`，契约生成 51 个 artifact，OpenAPI 路径增加到 37 个。`CancelRunPayload` 绑定当前 Run、原因码和证据引用；Core 客户端使用 `id/expectedVersion` 派生强 `If-Match`。PostgreSQL Owner 在同一事务中复核状态、CAS 递增 Run 版本和 stop epoch、取消未终 Task、清理 Mission activeRunRef，并原子写入 Audit/Outbox；Queued Run 必须先调度后取消，幂等回放返回同一 RunRecord。

HTTP 处理器和类型化客户端接入 `runs.cancel`。Workbench Run 页提供确认、强读版本复核、理由约束和基于证据引用的稳定幂等键；生产 E2E 验证 Running→Cancelled、任务同步取消、Run 历史更新和后续 Mission 旅程。页面取消成功先返回受理状态，不声明服务端终态；刷新后以强读 Run v2 和任务状态为准。Fake API 的公开 RunRecord envelope、Run UUID 和任务契约同步修正。

完整 `pnpm check` 通过：Core 553 项中 547 通过、6 跳过、0 失败；全工作区 917 项中 911 通过、6 跳过、0 失败。Contracts 51 个 artifact、API 13 个入口、Docs 769 个链接、全仓类型检查、构建和公开 API 报告通过。Workbench 23 项单测和生产构建 E2E 2 项通过，`/runs/[id]` 首载 106 kB。

## 2026-09-12：Task Graph Patch 修订

新增内部命令 `abh.graph-patches.propose`、`abh.graph-revision.created` 事件和 `abh.graph-revision` 目录对象。`ProposeGraphPatchPayload` 只接受新增节点、边、待作废 Pending 节点和证据引用；Core 在 `core.graph_revisions`（manifest v64，租户 RLS）中保存完整修订、base/revision、patch digest、闭包和 proposer。

`RunOwner` 在同一个强读事务中校验 Run 状态、base 版本、节点键、自环、悬挂边、环、深度 20、活跃节点 100、边 300 和 Pending 作废前提；通过后原子写入修订、Audit 和 Outbox。`executeCommand` 保持唯一幂等入口，同键重放按回执结果读取同一修订，而不是再次执行业务写入。启动 Run 时也会创建空的基础修订。

真实 PostgreSQL 回归覆盖 stale base、环、成功修订、幂等重放、非 Pending 作废拒绝和 ledger 计数。修复过程中发现 Owner 方法嵌套执行 `executeCommand` 导致同一事务重复插入回执；现在外层命令包装器唯一负责命令准入、回执和重放，Owner 只负责聚合不变量。剩余编排缺口是 Task 执行、Checkpoint/Invocation、唤醒恢复和完整调度托管。

## 2026-09-12：Run Durable Wait 唤醒

新增内部命令 `abh.runs.wake` 和同名当前授权动作，复用状态机既有 `abh.run.resume` 事件。`WakeRunPayload` 绑定 Run 版本、cause 和 Durable Wait；命令包装器要求 `abh.mission.manage` 或 `abh.runtime.deliver` 用途，并在同一强读事务中锁定组织/run fences、验证当前 Grant。

`RunOwner.wake` 只接受 Waiting Run。它重读 Durable Wait，要求 owner 和 waiting intent 精确指向该 Run、状态已 Succeeded 且存在 wakeup；再复核 Mission 仍 Active、版本一致且 activeRunRef 指向该 Run。通过后 CAS 将 Run 推进到 Running v2，写入 Audit、`abh.run.resume` Outbox 事件，并返回同一 RunRecord 的幂等回放。

真实 PostgreSQL 回归覆盖 Pending/错误 owner 拒绝、成功 Waiting→Running、同命令回放无重复 ledger、旧版本拒绝，以及 Audit/Outbox 精确计数。这补上等待条件满足后的 Owner 恢复入口；生产唤醒 Worker、任务调度和 Checkpoint 托管仍待实现。

## 2026-09-12：Learning Gate 与独立裁决

`abh.learning.build-gate` 补上评测后的独立 Gate Fact：Gate principal 必须不同于 Candidate producer 和 Evaluator，在 `abh.learning.gate` 用途下提交精确 Candidate 版本和不可变 Evaluation Result 集合。Owner 复核 Candidate/Profile/Result 摘要、同一候选与同一冻结 Profile、结果 Artifact 可用性，并锁定 Profile 中机器可读阈值。裁决规则保守合并：缺指标或任一 Inconclusive 证据为 `Inconclusive`，任一阈值失败为 `Fail`，全部通过才是 `Pass`。

不可变 `EvaluationGateArtifactRecord` 保存阈值、实测值、逐项 finding、verdict、签名者、事件、审计和回执；同一 Candidate 只允许一个 Gate，重放收敛到原 Gate。Gate 不创建 Release、不授予知识资格，也不替代生产发布审批。真实 PostgreSQL 回归覆盖 Pass/Fail/Inconclusive、evaluator 自签拒绝、证据错配和命令重放。

## 2026-09-12：Evaluation Result 与 Run CAS

`abh.learning.submit-evaluation-result` 完成 Internal 命令链路。Evaluator 在 `abh.learning.evaluate` 用途下凭当前 Grant 提交指标、样本、执行引用和数据摘要；Owner 只接受 Queued Run 的精确 v1 CAS，独立复核 Evaluator 与 Candidate producer 身份，按样本和失败数确定性判定 `Completed` 或 `Inconclusive`，并写入不可变 `EvaluationResultRecord`、Run v2、事件、审计和命令回执。Run 更新时固化结果引用和执行引用，错误 Evaluator、错误版本、重复终态提交和命令重放均有真实 PostgreSQL 断言。

契约把 `EvaluationRunRecord.resultRef` 定义为终态后才存在的可选事实字段，并从 Run 创建摘要中排除；内部动作目录注册 `abh.evaluation-run` 目标授权。该批次仍不实现外部评测执行、指标不确定性计算、Gate Artifact、Release 编排或评测查询。

## 2026-09-10：Run 公共生命周期与 Gateway 授权闭环

`abh.runs.start` / `abh.runs.complete` 已从内部 Owner 升级为公共命令链路：显式 `abh.mission.manage` 用途、当前 Grant/fence 准入、Active Mission/Authority/Workflow 精确匹配、同事务唯一 Active Run 检查、Mission `activeRunRef` 原子回填与终态清理、Audit/Outbox、幂等回执和 RunRecord 回放。`abh.tools.invoke` 同步接入 HTTP 命令准入与稳定命令回执，修复 callKey 内容摘要每次变化导致无法重放的问题；Verification 授权范围和 Learning 命令用途注册也一并修正。

真实 PostgreSQL 16 集成覆盖 Draft 拒绝、Authority/Workflow 不匹配、Mission 版本冲突、活跃 Run 拒绝、启动/完成 Audit 和 Outbox、Mission 版本推进与清理、Run/Tool 幂等重放和 stale Run 拒绝。HTTP 装配已包含 Run 命令，浏览器客户端使用与命令模式匹配的 Start/Complete 请求头与目标。Run 启动现在在同一个 UoW 内解析 Static Assignment 并固定 Workflow 的精确 Capability 版本：`assignmentSnapshotRef` 指向 `abh.pin-set`，不再使用占位引用。Run 恢复 Worker 和完整编排仍未实现。

## 2026-09-12：Evaluation 查询与用途撤回传播

新增 `abh.evaluation-runs.get`、`abh.evaluation-results.get` 和 `abh.learning-gates.get` 三个 Public Query，分别绑定 Run 当前版本、不可变 Result 和独立 Gate。Run 提交结果后按 ID 读取当前 v2，而不是误回 Queued v1；Result 允许 evaluate 与 gate 两种证据用途读取，Gate 只允许 gate 用途读取。类型化客户端同步暴露 `learning.getEvaluationRun`、`learning.getEvaluationResult` 和 `learning.getLearningGate`。

新增 `core.learning_withdrawals` 租户隔离表，Purpose Owner 撤销 `abh.learning.capture`、`abh.learning.evaluate` 或 `abh.learning.gate` 时在同一事务写入幂等 Withdrawal。Learning Owner 在 Signal、Case、Candidate、Profile、Run、Result 和 Gate 读取/写入前复核撤回标记：capture 撤销阻断证据归因链，evaluate 撤销阻断评测执行和 Result 证据，gate 撤销阻断 Gate 查询与后续裁决。原始事实保持不可变，传播通过 fail-closed 访问控制实现，不篡改历史记录或合法保留证据。

## 2026-09-12：Learning Signal/Case/Candidate 有界列表

新增 `abh.learning-signals.list`、`abh.learning-cases.list` 和 `abh.learning-candidates.list`。Signal 支持 `signalType/scopeId`，Case 支持 `rootCauseCode/scopeId`，Candidate 支持 `candidateStatus/assetKind/scopeId`；三者都提供 `limit` 和路线绑定的 opaque cursor。响应返回当前页、独立于分页的聚合计数和 `asOf`；排序固定为 `(created_at,id)` 降序，keyset 条件避免偏移漂移。

三个 Public Query 共用 `abh.learning.read` 授权入口，宿主必须显式安装路线级 cursor 和 Grant resolver；Core 在事务内重验当前 Grant/fence。Signal 和 Case 只允许 capture 用途，Candidate 允许 capture/evaluate/gate 用途。Learning Owner 继续复用租户、workspace、purpose、RLS 和 withdrawal 守卫：capture 撤回阻断 Signal/Case/Candidate 读取，evaluate 或 gate 撤回也阻断 Candidate 证据面。

类型化客户端暴露 `learning.listSignals/listCases/listCandidates`。Contracts OpenAPI 增至 49 条路径，51 个生成 artifact 保持一致。真实 PostgreSQL 回归覆盖类型/范围过滤、聚合计数、两页收敛、cursor 筛选漂移拒绝、缺权失败、跨用途 Candidate 可见性以及 capture/evaluate/gate 撤回后的 fail-closed 行为。本地工程完成度更新为约 99.7%；剩余主要是真实评测宿主、Release Controller 消费、运维面和生产治理外部化。

## 2026-09-12：Learning Candidate 运维诊断

新增 `abh doctor learning --candidate` 与 `inspectLearningCandidateReadiness`。CLI 只接受有界参数和格式化结果；Core 使用专用只读连接设置组织、workspace 和 `abh.learning.read` 上下文，在 RLS 内一次读取最多 100 条候选，并用第 101 行标记截断。诊断按候选汇总 Profile 数量/来源、Evaluation Run 与已收口数量、Gate、由 Gate 反查的 Release、必需/已撤用途，并输出七种封闭 stop reason：`PURPOSE_WITHDRAWN`、`PROFILE_MISSING`、`PROFILE_AMBIGUOUS`、`EVALUATION_MISSING`、`EVALUATION_UNSETTLED`、`GATE_MISSING`、`RELEASE_NOT_LINKED`。

诊断不会创建 Gate、Release、Assignment，不重跑评测或修复撤回；输出由新增 `CliDoctorLearningResult` 和 `LearningCandidateDiagnostic` Contract 约束，`commandRef=null`、`evidenceRefs=[]`，不伪造持久证据，也不返回 SQL、驱动错误或连接串。真实 PostgreSQL 回归覆盖从缺 Profile/评测/Gate 逐步补齐到 Release 关联的 stop reason 收敛、合同校验、用途撤回传播；CLI 回归覆盖严格参数解析、重复/未知 flag、连接失败和凭据不泄露。这是 Learning 候选运维面的第一段，不等于生产 Release Controller 或自动晋级。

## 2026-09-12：Learning Gate 供 Release 消费

新增内部命令 `abh.releases.configure-learning-candidate` 和 `abh.release.manage` 治理用途。`LearningReleaseController` 在同一事务内复核 Candidate/Gate/Profile 的租户、Workspace、版本、不可变 digest、Candidate 草稿状态、Gate `Pass` 判定与精确引用绑定；当前 Release Authority 必须独立于 Producer、Evaluator 和 Gate signer。Capture、Evaluate 或 Gate 用途任一撤回时，新执行和已受理回放都 fail-closed。

控制器复核 `release.gateRefs` 精确包含 Gate、Assignment 指向同一 Release，并确认该 Gate 尚未被其他 Release 消费。通过后只委托既有 `StaticReleaseOwner.configure` 完成 Draft→Ready 与 Assignment 写入；不绕过静态发布治理，也不执行自动晋级。唯一命令回执保证同键重放返回同一 Assignment，真实 PostgreSQL 回归覆盖授权、Producer/Evaluator 独立性、缺失/错配/非 Pass Gate、Release/Assignment 链接、成功发布、无重复写入、幂等一致和撤回传播。

## 2026-09-12：Evaluation 基线比较与统计不确定性

冻结 Evaluation Profile 现在必须声明置信度和最低相对提升；Evaluation Result 可绑定同一冻结协议下的基线指标和样本量。Gate 不再把单一点值直接当成通过依据，而是按有效样本合并多次评测，计算 Wilson Score 双侧区间：绝对门槛要求候选置信下界不低于阈值；配置提升门槛时还要求点提升和下界差均达到冻结比例。

不可变 Gate 保存聚合候选/基线指标、逐指标 Wilson `uncertainty` 和封闭 `limitations`，明确结果只适用于冻结数据集且不做干扰/选择偏差调整。缺少基线、缺失指标或样本不足会 Fail/Inconclusive，不会把失败样本静默剔除。真实 PostgreSQL 回归覆盖缺基线字段拒绝、绝对阈值、基线相对提升、区间和局限结构、幂等重放与非 Pass Gate 拒绝。

## 2026-09-12：Evaluation Recovery Orchestration

Evaluation Run 现在具有 60 分钟数据库时钟截止期，并新增内部 `abh.learning.expire-evaluation` 命令和 `abh.evaluation-run.expired` 审计事件。恢复只允许把仍在队列中的 Run 显式置为 `Inconclusive`；不会生成 Result、指标或 Gate 证据，迟到的真实评测结果也无法写入终态 Run。

新增租户本地 `Evaluation Recovery Worker`：以 `abh.learning.evaluate` Service Context 和当前 Grant 扫描有界 Queued 页，使用 Work Lease fencing token 防重复派发；宿主回调只接受 `Accepted` 或 `Unknown`。Accepted 释放租约，Unknown 或回调失败保留租约自然过期。达到 attempt 上限或超过截止期后走正式 expire 命令。回收 Worker 每次派发前重验 Grant；capture/evaluate 任一用途撤回会阻断扫描。

真实 PostgreSQL 回归覆盖授权拒绝、Accepted 派发与租约释放、释放后再次接管、Unknown 不重复派发、attempt 上限、时钟过期、用途撤回、活跃 Run 仍可接收真实结果、过期 Run 拒绝迟到结果，以及过期事件/回执审计。Contracts 维持 51 个 artifact 和 49 条内部 OpenAPI path；契约生成、Core 构建/类型检查、学习回归和公开 API 报告通过。

## 2026-09-12：Workbench Learning 列表只读浏览

新增公开 `abh.evaluation-runs.list` 和 `abh.learning-gates.list`，与既有 Candidate/Case/Signal 列表共用 bounded keyset、聚合计数、`abh.learning.read` 准入和按用途收敛的授权回调。HTTP、OpenAPI、生成契约、类型化客户端和公开 API 报告同步接入。Workbench `/learning` 现在能在 `abh.learning.evaluate` 会话中浏览候选、可见 Evaluation Run、到期、结果和分页游标；页面保持只读，不提供恢复、裁决或发布操作。

浏览器生产旅程覆盖 Overview→Mission→Run、Learning 候选与评测、迟到响应拒绝、Decision 审批、补偿和 Organization B 隔离。Fake API 同步到最新 Run 进度预算/截止契约，并且评测列表在无 Candidate 过滤时返回同一组织候选的可见请求。生成器测试修正为 51 条 OpenAPI path；完整 `pnpm check` 通过，E2E 2 项通过。剩余的 Workbench/CLI 操作面是写路径、批量运维、连续投影和差异对比，而不是本次只读列表本身。

## 2026-09-12：Workbench Evaluation Request 写路径

`/learning` 从只读浏览补上首个受治理 Learning 写入口：`abh.learning.request-evaluation`。服务端 Action 先校验 UUID/版本，用公开强读确认 Draft Candidate 属于当前组织、用途和 Workspace，再以返回的 Candidate 和 Baseline 引用绑定命令目标；浏览器只提交 Candidate id/version，不注入 Profile、Baseline、Organization 或预期结果。幂等键由组织、Workspace、Candidate 引用和用途规范化派生，页面在 accepted 后显示命令回执与刷新后的 Run 状态。

Fake API 增加 Evaluation Run 动态受理与 `201` 命令响应，生产 Chromium E2E 覆盖候选选择、表单受理、运行可见性和可访问性扫描；单测锁定幂等键稳定性。完整 `pnpm check` 通过：Contracts 312/312，Core 562 项中 556 通过、6 跳过、0 失败，Workbench 24/24，CLI 5/5，E2E 2/2，Docs 771 条链接，Contracts 51 个 artifact/path。此入口不裁决 Gate、不重试 Evaluation，也不代表批量运维或完整 CLI 操作面。

同一页面继续消费 `abh.learning-gates.list`，把不可变 Gate Artifact 纳入 Learning 可观测面：显示 verdict/version、Candidate、Profile、评测证据数、逐指标 Wilson 区间、局限说明和签署时间。页面文案已从“只读”改为准确描述恢复仍由受授权宿主 Worker 执行。Fake API 和生产浏览器旅程同步覆盖 Pass Gate 与授权组织隔离；Gate 仍由 Core 确定性裁决，Workbench 不提供人工改判。

## 2026-09-12：Evaluation Host HTTP Port

新增公开 `@abh/core/evaluation` 装配入口，为既有 `Evaluation Recovery Worker` 提供有界 HTTP Dispatcher。请求使用 canonical JSON 并精确绑定 Evaluation Run、Work Lease fencing token 和 attempt；宿主凭据由有界回调注入，继承 Worker signal。适配器只接受 HTTP `202` 与封闭 `{outcome:"Accepted"}`；非 202、协议漂移、重定向、超大、非法 UTF-8/JSON、超时和传输失败统一返回 `Unknown`，保留租约直至安全过期。

真实本机 HTTP 回归覆盖精确绑定与受理、非 202/非法 JSON/意外结果保持 Unknown、端点/凭据配置校验、凭据等待取消和上游取消。响应默认 64 KiB、最大 256 KiB，timeout 100—30000ms。该 Port 只定义宿主受理边界；真实 promptfoo/模型评测执行、计费证据、生产凭据解析和独立安全评审仍不因此完成。

完整 `pnpm check` 通过：Contracts 312/312，Core 568 项中 562 通过、6 跳过、0 失败，Workbench 24/24，CLI 5/5，Docs 771 条链接，Contracts 51 个 artifact/path，公开 API 9+5 个入口匹配。

## 2026-09-12：Evaluation Retry 精确前驱闭环

新增公开 `abh.learning.retry-evaluation`：只能选择一个当前租户可见、强锁复核后的 `Inconclusive` Evaluation Run。后继 Run 冻结同一 Candidate、Profile、Baseline 与 Assignment Unit，生成新 seed/到期时间，并通过 `retryOfRef` 记录精确前驱；调用方不能注入新 Baseline 或 Profile。Candidate 保持 Draft 且没有其他 Queued Run 才能进入重试；Profile 仍要匹配资产/风险，evaluator 仍不得是 producer，Profile suite/dataset/threshold/stopping artifact 和 Baseline 仍必须可用。capture/evaluate 用途撤回、授权、租户/Workspace 边界继续失败关闭。

HTTP 安装点、OpenAPI、类型化客户端和公开 API 报告同步接入，`201` 复用 `EvaluationRunCreatedResponse`。真实 PostgreSQL 回归覆盖成功重试、冻结血缘、seed 更替、幂等回放、Completed/未知前驱拒绝、producer 身份拒绝和活跃队列冲突；同一命令还通过 HTTP 与客户端回放验证。Workbench `/learning` 对可见 `Inconclusive` Run 提供受限重试动作，先强读当前版本再以稳定 `wb/:runId/:version/retry` 幂等键提交；生产 Chromium E2E 覆盖受理、新 Run 可见性和组织隔离。

## 2026-09-12：Learning Release Workbench 写路径

`abh.releases.configure-learning-candidate` 已从 Internal 提升为 Public Create 命令，HTTP 响应绑定 `StaticAssignmentRecord`，OpenAPI 公共路径增至 53 条。Core typed client 新增 `releases.configureLearningCandidate`；HTTP 安装支持独立 Release Authority、当前 Grant 复核、幂等回放和直接 Assignment DTO。Fastify 适配器同时修正了 Create 命令的 ETag 提取：信封 `data.objectRef` 与直接聚合 DTO 的 `assignmentRef` 都能生成强 ETag。

Workbench `/learning` 对强读后的可见 Pass Gate 提供发布表单。服务端动作只接受 Candidate/Gate 版本、Behavior Slot、精确 Capability 和 Compatibility Artifact 输入；Organization、Workspace、状态和证据引用均由 BFF 从当前 Session 与强读 Gate 构造。稳定幂等键绑定 Candidate、Gate、Capability digest 和 Compatibility 意图；浏览器不能注入结果或权威证据。

真实 PostgreSQL Learning 回归覆盖 Core 成功发布、幂等重放、独立 Release Authority 复核、HTTP 提交和 typed client 解包。Workbench 26 项单测和生产 Chromium E2E 覆盖受理、组织上下文隔离、迟到响应拒绝、Evaluation Request/Retry 与 Learning Release。Contracts 312 项测试通过，Core 568 项中 562 通过、6 跳过、0 失败，CLI 5 项和 Fastify 15 项通过。验证见 [Learning Release Workbench 证据](verification-2026-09-12-learning-release-workbench.json)。

## 2026-09-12：Assignment 治理生命周期闭合

`abh.assignments.pause` 已从内部提升为 Public Update，绑定精确 Assignment 版本的 `If-Match` CAS，返回升级后的 `StaticAssignmentRecord`。暂停把 `status` 推进为 `Paused`，同时把 `selectable` 与 `executionAllowed` 置为 false；reason 与 evidence 写入 DTO 和 Audit relation。该操作停止新的能力选择与执行资格，不取消或改写已在途执行。

新增 `abh.assignments.get` 与 `abh.assignments.list` 公共查询。List 支持 release/status 过滤、`limit<=100`、授权绑定的 `(createdAt,id)` keyset cursor，并在同一强读事务复核当前 `abh.release.manage` Grant。`counts` 稳定包含 `Active` 与 `Paused` 零值，避免缺省状态被误读为不可知。Core HTTP、Mission HTTP、启动校验、Learning Cursor 和 typed client 已同步接线；OpenAPI 公共路径增至 56 条，Contracts 51 个 artifact 和 API 报告重新生成。

真实 PostgreSQL 回归覆盖活跃列表、强读、精确版本暂停、暂停 DTO、暂停列表、零值计数与独立 Assignment Grant。Workbench `/learning` 现在展示授权 Assignment 列表；浏览器只提交 Assignment 版本与原因，BFF 强读当前 DTO、校验组织和 Active 状态，并从已有证据引用派生 pause evidence，幂等键绑定版本、原因和该证据。生产 Chromium E2E 覆盖 Release 后 Assignment 可见、确认暂停和 Paused v2 状态。Contracts 312/312、Core 568 项中 562 通过、6 跳过、0 失败、Workbench 27 项和 2 项 E2E、Fastify 15 和 CLI 5 项通过。验证见 [Assignment 治理证据](verification-2026-09-12-assignment-pause.json)。这不等于生产发布审批或回滚编排；Canary 终止、真实部署补偿和批量运维仍在后续批次。

## 2026-09-12：Static Assignment Rollback 生命周期

新增 Public Update 命令 `abh.assignments.rollback` 与不可变事件 `abh.assignment.rollback`。命令绑定失败 Assignment 的强读版本、精确前继 Release、完整 Gate 证据集合、Compatibility Artifact 和治理理由；返回新的 Assignment DTO 并记录 `rollbackOfAssignmentRef` / `rollbackFromReleaseRef` 血缘。

Core 在同一事务中锁定 Active、selectable、execution-allowed 的失败 Assignment；只接受 Ready、当前用途/Workspace 可见的精确前继 Release。Gate 与 Compatibility 引用必须和前继 Release 完全一致，且 Artifact 仍 Available、Learning Gate 仍 Pass。通过后用 CAS 把失败 Assignment 推进到 Paused 并关闭新选择/执行资格，随后创建指向前继 Release 的 replacement Assignment。既有 Pin Set 不改写，已有 immutable pin 继续可查询；系统也不声明在途工作已被取消。

真实 PostgreSQL 回归覆盖版本冲突、未知前继、Tombstoned evidence 失败关闭、replacement 不落库、成功替换、Audit/Outbox、旧 pin 不可变和新 subject 选回前继版本。公共路径另覆盖空 Grant 拒绝、Release Authority 成功、同回执幂等重放、HTTP 403、`If-Match` 版本绑定和 typed client 重放。HTTP 装配校验也修正为识别 `assignments.rollback`，避免只有 rollback 安装时错误访问未安装的 pause 授权。验证见 [Static Assignment Rollback 证据](verification-2026-09-12-assignment-rollback.json)。

## 2026-09-12：Assignment Rollback Workbench 闭环

Workbench `/learning` 现在为 Active Assignment 提供受控回滚入口，并显示 `rollbackOfAssignmentRef` / `rollbackFromReleaseRef` 血缘。浏览器只能选择可见前继 Release 并填写理由；前继 Gate、Compatibility Artifact、精确 Release 版本、目标版本和完整幂等意图全部由 Workbench 服务端强读当前/前继 Assignment 后派生。

Learning Release 服务端动作同步把 Compatibility Artifact 写入 Assignment evidence set，使后续回滚可以从不可见证据引用中封闭派生。生产 Chromium E2E 覆盖两次 Release、第一次 Assignment 暂停、第二次 Active Assignment 选择前继 Release、服务端派生回滚、replacement 显示 Active v1 和完整回滚血缘。Workbench 28 项单测和 2 项生产 E2E 通过，验证见 [Assignment Rollback Workbench 证据](verification-2026-09-12-assignment-rollback-workbench.json)。

## 2026-09-12：Capability Release 运维诊断

新增 `abh doctor release --organization-id --release-id`。Core 使用专用 read-only PostgreSQL 连接设置组织、workspace 和 `abh.release.manage` 用途，复核 Release 用途、Artifact/Learning Gate 证据、Compatibility Artifact、exact Capability 安装、Assignment 存在与执行准入、当前 pin set，以及可覆盖相同行为槽的 Ready 回退候选。结果只输出有界事实和封闭 stop reasons；未知 Release 返回空 diagnostics，不虚构证据。

CLI 提供严格参数解析、UUID/期限校验、text/JSON 输出和稳定退出码；stdout 不包含连接串、SQL 或驱动错误。`CliDoctorReleaseResult` 现在允许失败结果为空 diagnostics，同时强制 Passed 结果恰好包含一个 Release diagnostic。真实 PostgreSQL 回归覆盖参数错误、未知 Release、缺安装时只报告实际停止原因，以及证据、安装、Assignment、pin 和回退候选齐全后的 Passed。CLI 回归覆盖严格解析、依赖失败和凭据不泄露。

该诊断仍然只读：不安装 Pack、创建 Assignment、修复证据、生成 pin、批准生产 Release 或执行回滚编排。

## 2026-09-12：Operation 恢复诊断已闭合

设计要求的 `abh doctor operation --organization-id <UUID> --operation-id <UUID> [--workspace-id <UUID>]` 已接入 Core 与 CLI。`inspectOperationReadiness` 使用专用只读 PostgreSQL 连接和 `abh.operation.reconcile` 上下文，在租户边界内读取 Operation 原意图、当前 attempt 对应 Dispatch Permit、Permit 到期水位、Receipt 计数与最后外部观察水位、最新 Reconciliation 裁决以及未释放 Resource Fence。诊断输出封闭判定 `safeRetry`、`remainingResponsibility` 和七种 stop reason，覆盖许可缺失/过期、观察证据缺失、Unknown 保护差异和 Closed 无收口。

CLI 只接受 UUID、`text|json` 和 `100..30000ms`，失败结果保持契约有效且不返回 SQL、驱动错误或连接串。文本输出不展开载荷或凭据。真实 PostgreSQL 回归覆盖无效参数不触库、未知 Operation 空诊断、Pending 有许可且未过期的安全续跑、Observing/Unknown 无 Receipt/Reconciliation 时保留 Fence 责任，以及 Closed/ConfirmedSuccess 且 Fence 已收口后的一致通过。

该命令严格只读：不调用 Provider、不派发、不写 Reconciliation、不释放 Fence、不合成回执，也不绕过授权或责任边界。验证见 [Operation Doctor 证据](verification-2026-09-12-operation-doctor.json)。

## 2026-09-12：CLI Development 初始化第一段

`abh init --template action-only` 已按 CLI 合同接入：生成显式 Development 配置、两个受限数据库角色的环境引用、Action-only 业务入口和本地检查脚手架。配置在写盘前经 `resolveDevelopmentConfig` 校验；默认目录使用 0755、文件 0600，JSON 输出固定 `commandRef=null`、`errorCode=null`、`evidenceRefs=[]`。

非空目标默认 fail-closed；`--force` 只改写模板自有文件，text 模式在替换前输出有界 unified diff，JSON 模式保持单个机器可解析对象，不触碰调用方新增文件。目录、普通文件和 symlink 目标分别校验，不跟随非普通目标。CLI 回归覆盖严格参数、配置有效性、非空拒绝、force 差异/隔离、symlink 安全和 JSON 输出有效性。

这只是初始化脚手架：不启动服务、不提供生产身份/Secret Ref 解析，也不把空业务入口说成已实现业务 Action。`dev`、Pack、升级、导入导出和发行打包继续开放。

## 2026-09-12：Pack 内容验证 CLI 第一段

新增 `abh pack validate --root --manifest --policy`，把既有 Core 本地 Pack 扫描器接到 CLI：先复核显式部署策略和 Manifest，再在同一有界期限内读取声明 payload、复核精确字节和三组 manifest/artifact-set/package 摘要。扫描拒绝 symlink、hard link、未声明文件、重复引用和超限内容；新增 `PackContentDiagnostic` 与 `CliPackValidateResult` Contract 约束成功输出。

CLI 使用 100..30000ms 期限，拒绝未知/重复参数，失败只输出稳定错误码和 remediation；`commandRef=null`、`evidenceRefs=[]`，不把本地检查包装成持久证据。真实本地夹具覆盖成功、策略身份不匹配、单字节篡改、文本/JSON 输出和严格解析。签名、来源、CTK、安装、迁移执行和运行时授权仍不在此命令范围内。

## 2026-09-12：Pack Manifest 构建 CLI 第一段

新增 `abh pack build --root --manifest --output`，把无 integrity 的作者草稿转成规范未签名 Manifest。Core 在固定 4 MiB/64 MiB/10000 entry 边界内扫描普通文件，拒绝 symlink、hard link、未声明/重复文件和目录逃逸；按实际字节补齐 Artifact/Migration 尺寸与 SHA-256，再生成三组完整性摘要和 Cosign `signaturePayload`。CLI 以 `O_EXCL|O_NOFOLLOW`、0600 写出规范 JSON，契约化结果固定 `commandRef=null`、`evidenceRefs=[]`。

本命令只生成本地开发制品：不执行包代码、不创建 proof 文件、不签名、不验证部署策略，也不安装或授运行时 authority。契约、Core 定点回归、CLI 严格解析、确定性输出、输出冲突和越界/链接失败均有覆盖。

## 2026-09-12：Pack Cosign 签名 CLI 第一段

新增 `abh pack sign`，复用 V1 的 `digestPackManifest().signaturePayload` 原文并调用部署方 pinned Cosign `sign-blob`。CLI 只接受绝对 Cosign 路径、命名环境密钥引用和可选口令引用；核心在受限 0700 临时目录中用 0600 文件传入载荷/私钥，进程环境固定为最小集，超时或取消强制 SIGKILL。生成 bundle 后立即用独立公钥调用 `verify-blob`，通过后才以 `O_EXCL|O_NOFOLLOW` 和 0600 写出。

结果契约输出 Pack 身份、package digest、bundle digest 和有界长度，固定 `commandRef=null`、`evidenceRefs=[]`，不返回私钥、口令、Cosign stdout/stderr 或主机路径。签名只是证据生成：provenance、CTK、部署策略、安装、迁移和运行时 authority 仍必须独立验收。

## 2026-09-12：Pack 供应链验证 CLI 闭合

新增 `abh pack verify --root --manifest --policy --trust`，把既有 Core `validateLocalPack` 接入 CLI。命令在同一有界只读流程中复核 payload 精确字节、三组 Manifest 摘要、发布签名、SLSA provenance 和签名 CTK 报告；固定 4 MiB/64 MiB/10000 entry 边界并拒绝链接、未声明和重复文件。

结果契约输出正式验证报告中的身份、三组内容摘要、部署策略/三个证据 bundle/CTK 报告摘要、验证时间和有效期摘要，固定 `commandRef=null`、`evidenceRefs=[]`。CLI 不持久化报告、不 Stage、不执行迁移、不创建 Assignment，也不授运行时 authority。

## 2026-09-13：只读 Pack 安装 doctor

新增 `abh doctor pack --organization-id --pack-id --pack-version`，在受限 runtime 连接和同一个 `READ ONLY` 事务中检查精确安装记录。诊断绑定持久 Manifest 身份、状态、版本、部署版本和三组摘要，核验验证报告、签名信任快照、Capability Set 及子注册、当前部署修订指针，并检查生命周期附带的 Enable/Suspend/Retire 事实。

新增 `PackInstallDiagnostic` 和 `CliDoctorPackResult` Contracts。输出最多一条精确 Pack 诊断和有界 stop reasons；`commandRef=null`、`evidenceRefs=[]`。doctor 不读取 payload、不重验 Cosign 密码学、不访问 runtime 无权读取的全局迁移 Journal、不修复或变更安装。真实 PostgreSQL fixture 覆盖未知 Pack、严格参数和证据/注册/部署指针缺失。

## 2026-09-13：Business 固定构建到本地 Pack

新增 `compileBusinessPack` 公共 Pack 入口。它先封闭重验 `defineBusiness` 输出的 `kind`、`schemaVersion`、字段集合、声明语义和 JCS/SHA-256 摘要，再把声明字节编译为唯一 `business.json` Artifact。生成的 DomainPack 固定 `Declarative`、`UNLICENSED`、`resources=None`、`>=0.1.0 <1.0.0`，Capability 显式提供 Business Definition 和每个 Action；Manifest 权限只包含 Action 命令和去重后的用途。

编译复用既有 `buildPackManifest` 的 4 MiB/64 MiB/10000 entry 边界、链接拒绝和真实字节摘要，并产出 `abh.business-ctk-plan`。计划固定 `suiteVersion=1.0.0`、`status=NotRun`，逐 Action 建立 schema case，绑定实际 package digest 并声明 Manifest 中全部 Capability；它不是签名 CTK、执行结果或部署证据。hello-business 模板新增 `npm run pack:manifest`，在生成的 `pack/` 目录输出声明、Manifest 和计划。

新增 `abh pack compile-business --business --output`。CLI 只接受 100..30000ms 期限和未知/重复参数拒绝；以 0600、不覆盖方式写出规范 Manifest、声明字节和 CTK 计划，结果继续由 `CliPackBuildResult` 封闭。CLI 回归覆盖成功输出、契约校验、Artifact 字节摘要、`NotRun` 计划、输出冲突、篡改摘要拒绝和文本/JSON 参数边界。

Core 回归覆盖契约有效、Capability/权限映射、Artifact 精确摘要、计划摘要、确定性输出、篡改声明摘要拒绝和错误输入拒绝；CLI 回归动态执行生成编译脚本并校验三个输出。Core 613 项中 606 通过、7 项既有 Cosign 用例跳过、0 失败。该能力只产出未签名本地候选，不签名、不发布、不安装、不启用、不授执行权限，也不替代真实 Domain、独立安全或性能验收。

## 2026-09-13：只读 Ledger 余额 doctor

新增 `abh doctor ledger --organization-id --ledger-id` 和 Core `inspectLedgerBalanceAudit`。命令以固定 `abh.resource.read` 用途进入受限 runtime 连接，并在同一个 `READ ONLY` 事务中设置租户上下文、按精确组织与 Ledger ID 读取授权记录、重建最多 10,000 条 immutable entries、汇总四类余额，并核对 Held Reservation、Open Commitment、到期 Hold 和 Outbox ledger 版本链。

新增 `LedgerDiagnostic` 与 `CliDoctorLedgerResult` Contracts。`LEDGER_RECORD_DRIFT` 表示行版本越过最新 Outbox 事件；`BALANCE_DRIFT` 表示规范化列与 entries 重建不一致；其余有界原因覆盖非法 entry、超过 10,000 条、责任不一致和到期 Hold。CLI 输出前做契约校验，固定 `commandRef=null`、`evidenceRefs=[]`，不产生修复 Command，也不直接改数。真实 PostgreSQL fixture 覆盖一致账本、未知账本、余额列漂移、版本漂移和到期 Held。

## 2026-09-13：Ledger 周期/单位目录与余额 Correction

`resource.units` 与 `resource.periods` 成为 Ledger 配置的强制目录。不可变 Unit 声明 monetary/quantity、币种和 0—12 位精度；不可变 Period 声明 UTC 会计区间。`LedgerOwner.configure` 先在租户内解析 Unit 与 Period，再拒绝 monetary/quantity 币种错配、Period 版本漂移和超过 Unit 精度的 limit。目录运行时只授予 SELECT/INSERT，配置路径继续走 Audit、Outbox 和 Command Receipt。

`abh.ledger-corrections.apply` 支持 Refund 和 FxRevaluation 的有符号 `usageDelta`。命令要求 Refund 不带 conversion ref、FX 必须带 conversion ref，并把方向、额度恢复和证据规则交给宿主 Domain 回调。Owner 加锁后复核当前 cumulative/open 状态、精确账本版本和容量下限，创建不可变 `LedgerCorrectionRecord`，追加 `Correct` Ledger Entry，原子更新 confirmed usage，再写入 Correction、Entry、Ledger balance、Audit、Outbox 和 Receipt。同一 ledger/source/version 的重放返回原记录，内容变化返回幂等冲突；过期期望版本允许按最新当前版本重试，不伪造成功。

真实 PostgreSQL 回归覆盖目录缺失、Period 过期、Unit/Period/精度准入、FX 增加、源去重重放、Refund 减少、超额退款、余额重建和 doctor 通过。迁移 69 将数据库清单中的 Tenant 表增加到 113 张；Contract 生成与 312 项契约测试通过。该能力仍是账本层原语，真实业务退款/FX 策略宿主和生产资源装配保持显式缺口。验证见 [Ledger Catalog Corrections 证据](verification-2026-09-13-ledger-catalog-corrections.json)。

## 2026-09-14：Responsibility DelegateSlot 与 EscalateSlot

Correction 新增 `Capability` 目标 Owner，用于 Prompt/Workflow 等系统能力纠错。提案阶段继续保留不可变 before/after Artifact 和 Human Correction 责任；Apply 阶段不再直接改生产 Capability，而是要求 Learning Case、baseline、replacement artifact 和候选元数据一致，并在同一事务内调用既有 Learning Candidate 创建路径。结果是 Draft Learning Candidate、不可变 CorrectionApplication、Audit 和 Outbox 证据；重放返回同一 application。真实 PostgreSQL 回归验证 Draft 候选创建、生产版本不变和重放安全。验证见 [Capability Correction 证据](verification-2026-09-14-capability-correction.json)。

在 DelegateSlot 之后新增内部 `abh.responsibility-requests.escalate-slot`，仅接受 Unresolved Request，并把一个无合法候选的冻结席位替换为下一个治理候选。Owner 复核当前 Human Assignment、责任类型、Workspace/Subject scope 和不晚于 Request 的有效期；Route Revision 记录持久 `escalation` 元数据，Request 持久 `escalationDepth`。合同将升级深度限制为 1–4，Owner 再次拒绝第五级。全部锁、CAS、Pending supersede、审计和 Outbox 语义复用既有 Route Revision。真实 PostgreSQL 回归覆盖首次升级、持久深度、第四级后拒绝和只替换目标席位。验证见 [Responsibility Escalation 证据](verification-2026-09-14-responsibility-escalation.json)。

新增内部 `abh.responsibility-requests.delegate-slot` 命令，复用 Route Revision 的事务锁、版本 CAS、Pending supersede 和不可变 Route Revision 记录，但把变更限制为单个冻结席位的委派。所有者会复核委派元数据、受托 Human Assignment 的当前状态/类型/Workspace/Subject scope、不晚于 Request 到期的有效期，以及其余席位和槽位完全未变。旧批准保留为历史，旧 Pending 进入 Superseded，新 Route Revision 全部使用 fresh Decision；ALL 完成凭证只在全部新席位重新批准后创建。合同注册 `DELEGATION_EXCEEDS_AUTHORITY`，真实 PostgreSQL 回归覆盖专用授权、缺失委派、受托人不匹配、旧批准保留和 fresh ALL 完成。验证见 [Responsibility Delegation 证据](verification-2026-09-14-responsibility-delegation.json)。

## 2026-09-13：Action Safe Retry

新增组织级 `abh.organization` 授权投影订阅。订阅只向当前组织发放 Mission/Decision/Action 已提交 Outbox 的变更提示，不携带业务载荷；每次出流前复核 Active Organization、Human 成员资格、当前 `abh.projections.read` Grant、事件组织归属和 UUID 游标，未知游标强制 reset。协议目录把 Organization 纳入 `abh.projections.read` 目标。Workbench BFF 允许同源代理该 subject；Overview、Inbox 和 Action List 通过一条组织流精确失效授权键控缓存，轮询保留为兜底。

E2E 改用 `.next-e2e` 隔离构建和生产 Next server，构建期间与运行期间固定 Fixture 身份，消除开发/生产产物混用。真实 Chromium 旅程覆盖 Overview/Inbox 消费失效、Action 列表组织事件更新、Run Running→Completed SSE 变更，以及 Action SSE 断开后凭 Last-Event-ID 重连并强读到 Closed。真实 PostgreSQL 回归覆盖组织事件、坏游标 reset 和无授权 reset。验证见 [Workbench Organization SSE 证据](verification-2026-09-13-workbench-organization-sse.json)。

同一生产 E2E 套件还覆盖失败 Action 的补偿提案旅程：治理服务解析注册模板后，浏览器渲染 JSON Forms；提交路径强读最新 Action 版本与 Closed/Failed 状态，重新解析模板、复验 source/artifact 绑定、用 Ajv 2020 校验输入，并以稳定幂等键调用公开 `abh.actions.propose`。该证据关闭 Workbench 补偿模板旅程缺口；真实 Domain 治理服务和生产宿主装配仍是外部边界。

新增内部命令 `abh.operations.safe-retry`，只接受已派发至少一次、仍 Dispatching/Pending、尝试次数少于 3 且最新 Attempt Observation 恰为 `TransportFailed` 的 Operation。命令先独立预检当前 Service Grant，再完整执行 T2 来源、Snapshot、Policy、预算、连接、目标和资源槽重授权；通过后继续复用旧 Permit 的 Provider idempotency key，创建新的不可变 Attempt/Permit。旧 Attempt、Observation、旧 Permit 和旧围栏令牌保持不变。

`ResourceFenceOwner.occupy` 只在 safe-retry 路径允许同一 unresolved Operation 重入并轮换 fencing token；其他 Operation 仍被同一资源槽阻塞。普通 `issue-permit` 无法借用该路径获得第二个 Permit。T2 授权完成后，Safe Retry 在同一事务中无锁重读当前 Grant；组织 fence 已由 T2 持有，并发撤销会被阻塞，撤销已提交则命令失败。

真实 PostgreSQL 回归覆盖 ordinal 2/3、相同 idempotency key、围栏令牌只对同一 Operation 轮换、旧 Permit 令牌保持、三次硬上限、缺少/撤销 Grant、Created 与 Interrupted 最新观察拒绝、stale Permit、强制策略拒绝后零新增事实，以及 T2 来源 epoch 不被 retry Grant 污染。生产外部传输重试 Worker、safetyStop 与正式 Domain 装配仍待实现。验证见 [Action Safe Retry 证据](verification-2026-09-13-action-safe-retry.json)。

## 2026-09-13：Action Safety Stop 围栏原语

可信 Action Definition 现在可声明 `safetyStop`，声明进入不可变 Action Intent 并由现有 T2 完整重验 Service 来源、Snapshot、Policy、预算、连接、目标和行为 Pin。对已占用资源槽，`ResourceFenceOwner` 只允许该显式安全 Action 的 Operation 建立 `safetyStopOperationRef` 例外；原 `unresolvedOperationRef`、预算、Attempt、Observation 和旧围栏事实保持不变。安全派发轮换当前 fencing token，使旧普通 Permit 不能再通过出口校验；晚到的第二个独立 safetyStop Action 可再次轮换例外，表示重新确认停止。普通重试和普通新派发仍被拒绝。

真实 PostgreSQL 回归证明：Unknown 普通 Operation 保持资源责任，独立安全 Action 可在同一槽派发，旧 fencing token 失效，安全 Action 不清除 Unknown，预算按两个 Hold 精确可见，第二个独立安全 Action 可替换当前安全指针并推进 token。合同生成和 70/70 Action 测试通过。本批只是核心围栏/T2 原语；公开 safetyStop 命令、正式 Domain 装配、回执/补偿编排和生产治理验收仍未闭合。验证见 [Action Safety Stop 证据](verification-2026-09-13-action-safety-stop.json)。

## 2026-09-13：Safety Receipt 例外退役

`OperationController.apply` 现在在最终确认前读取当前 fence slot：报告目标与 `safetyStopOperationRef` 按 Operation 身份匹配时走 `clearSafetyStop`，只移除安全例外；否则仍走原有 `clear`，继续要求原 Unknown Operation 自己的最终对账。Fence token CAS、完整 Receipt 向量、pinned rule、Controller 权限和 Operation 版本检查保持不变。`DispatchExitOwner` 的 T2 授权同步识别当前安全 Permit，避免已授权安全派发在一次性出口处失败。

真实 PostgreSQL 集成覆盖第一个安全 Permit 的完整派发、响应、Receipt、Reconciliation、关闭和指针退役；原 Unknown Operation、原预算 Hold 和旧 token 保持不变。第二个独立安全 Action 再次轮换指针到 token 3，并用成功 Receipt 完成退役。安全例外存在时普通 retry 被拒绝；退役后原语允许受控 safe retry，但自动安全编排不是本批范围。公开业务编排、exact Connector 运行时证明、正式 Domain 装配和生产治理验收仍显式开放。验证见 [Action Safety Stop 证据](verification-2026-09-13-action-safety-stop.json)。

## 2026-09-13：Safety Capability 元数据登记

Pack 能力 Binding 与 Registration 新增 `safetyStop`。构建期准备器把缺失值规范为 `false`，Registration digest 策略包含该布尔值，因此登记后不能在不推进 Capability Set digest 的情况下改写止损语义。`safetyStop=true` 必须在权限包络中显式授予 `abh.action.safety-stop`，否则准备器在打开源文件前拒绝。能力查询候选返回显式 `safetyStop`，并支持封闭的 `safetyStop` 布尔筛选，同时继续不返回 implementation 或 source 句柄。Catalog 注册 `abh.action.safety-stop`；Action Owner 拒绝“声明 safetyStop 但没有专用用途”的受信定义，公开 proposal payload 依旧无法注入该标志。

Exact resolver 现在把 immutable Registration 的 `safetyStop` 作为解析结果的一部分，并在 `requireSafetyStop=true` 但登记为 false 时返回 `PIN_INPUT_CONFLICT`。`dispatchPackOnce` 根据 Action Intent 设置该要求，因此在一次性出口提交后、真实传输前，safety Intent 不能绑定未登记止损能力的 Connector。真实 exact Pin/Schema 解析测试覆盖 false 拒绝和 true 放行；普通非 safety 解析不受影响。公开业务编排和正式 Domain 装配仍开放。验证见 [Action Safety Stop 证据](verification-2026-09-13-action-safety-stop.json)。

## 2026-09-13：Exception Resolution 公共入口

`ResolveException` 已接入公共契约、Core HTTP 安装项和类型化客户端。公共响应只返回 Exception ref、Command id 和不可变决议记录；宿主只提供可信 Grant 发现，Owner 在 PostgreSQL 事务内重新验证 Human 审阅用途、当前 Grant、关闭且批准的 Decision、精确 Exception 版本、技术 Unknown 和 ResourceFence。

验证：契约 51 artifact、59 个 OpenAPI path、公开 API 报告和 786 个文档链接通过；真实 PostgreSQL 集成通过 HTTP 成功响应、相同幂等键稳定重放、类型化客户端等价调用、Unknown/冻结标志保留和原 Operation/围栏不变。工作仍不含处置后责任重路由、治理解冻编排和生产治理装配。证据为 `verification-2026-09-13-exception-resolution-public.json`。

## 2026-09-13：Run Suspension 通知 Owner

新增 `runPackSuspensionConsumer` 并把持久扫描页投递扩展为 Action/Run 分发。Run 分支在原事件、稳定 consumer id 和现有 Inbox/Artifact 事务内复核当前 Grant、suspension 登记、来源 admission、Run 行、assignment PinSet、PinSet digest 与精确能力。成功写入 `RunPackSuspensionObservation`，保留当前 Run 和全部 Task 快照；失败不确认事件，未知 subject 或缺少 Run admission 显式拒绝。

真实 Cosign/PostgreSQL 联测覆盖 Run PinSet 引用发现、Run/Task 回读、通知 Artifact、consumer id 稳定性和缺 admission 拒绝。该效果只是暂停观察，不是 Run 状态变化或补偿；生产跨范围调度、退役治理和真实 Provider 验收仍开放。验证见 [Run Suspension Owner 证据](verification-2026-09-13-run-suspension-owner.json)。

## 2026-09-13：Suspension 持久回填水位

新增 `runtime.suspension_sweeps` 和 `SuspensionSweepOwner`，以 event/capability/scope 为键保存 generation、数据库时钟高水位、单调 page cursor 和完成事实。capability reference 查询支持 `beforeAt` 快照边界；失败不推进，并发后插入必须由新一代扫描。dispatch worker 现在自动维护显式 scope 的 durable 回填状态。

真实 Cosign/PostgreSQL 回归覆盖数据库 readiness、worker 两代状态、高水位前后 PinSet 分离、cursor 回退拒绝、完成新一代打开和原事件 Inbox 去重。该水位仍绑定显式 scope，不构成生产 scope 目录、退役删除证明或全局通知完成。验证见 [Suspension Watermark 证据](verification-2026-09-13-suspension-watermark.json)。

## 2026-09-13：Safety Stop 公共提案

新增 `abh.actions.start-safety-stop`、HTTP 安装项和 `client.safetyStops.start`。payload 显式绑定候选 fence、token 和未决 Operation；Owner 在提案事务内重新锁读候选并复核真实 Identity、token、未决 Operation、无阻塞报告和无既有 safety Operation。受信 definition 必须声明 `safetyStop=true` 与专用用途；proposal 目标必须同时绑定 fence 与未决 Operation。接受命令只创建 Proposed safety intent，不签发 Snapshot、Permit、资源预留或外部调用。

契约新增 `ProposeSafetyStopPayload` 并保持 51 个 artifact 一致；OpenAPI 增至 61 条路径。真实 Identity/Core HTTP/typed client Action 回归 71/71 通过，覆盖成功 intent、stale token、重复 safety 候选、非安全 definition 拒绝和既有公开 proposal 回归。全仓 `pnpm check` 通过 1002 项中 995 通过、7 外部签名跳过、0 失败。自动编排、正式 Domain 装配和生产治理验收仍开放。验证见 [Safety Stop Public Proposal 证据](verification-2026-09-13-safety-stop-public-proposal.json)。

## 2026-09-13：Artifact 反向血缘

`ArtifactLineageOwner` 现在把 Available 发布事实写入 `data.artifact_dependencies`，内联与 ObjectStore T2 共用同一写入协议。血缘边不可变、按租户和 purpose 隔离，并对同一目标/源组合幂等；反向 descendants 查询用精确 source 三元组和 JSON 引用复核，返回稳定 UUID 键序和有界分页。表只授予 runtime SELECT/INSERT，迁移清单版本升至 72。

真实 PostgreSQL 回归覆盖内联和 ObjectStore 发布、双源血缘、重复记录去重、键序分页、跨租户隔离、runtime 权限拒绝和 CHECK 防改写；Artifact 24/24 与数据库 readiness 12/12 聚焦回归通过。生产 ObjectStore Adapter、无上限大正文流式上传和保留/导出生命周期仍开放。验证见 [Artifact Lineage 证据](verification-2026-09-13-artifact-lineage.json)。

## 2026-09-13：Artifact 保留生命周期

`runArtifactRetentionWorker` 新增持久保留协议：到期发现、授权入队、租约 claim、外部幂等删除和元数据墓碑在同一套可恢复状态中推进。`data.artifact_retention_jobs` 保存 policy evidence、object ref、stable deletion proof/idempotency key、worker/fencing token、attempt 和最终 receipt；inline Artifact 直接墓碑，ObjectStore Artifact 必须先确认物理删除。迁移清单版本升至 73。

真实 PostgreSQL 聚焦回归 25/25 通过，覆盖未到期保留、到期对象先删后墓碑、Artifact 版本递增、Job 收据、删除幂等键、墓碑后读取拒绝和保留 Artifact 不受影响。验证见 [Artifact Retention 证据](verification-2026-09-13-artifact-retention.json)。

## 2026-09-13：ObjectStore 流式上传与 Artifact 导出

新增 `FilesystemObjectStore`、无上限 Object Artifact streaming、`readStream()`、`data.artifact_exports` 和 `ArtifactExportOwner`。文件适配器以 staging、digest/size 校验、`sync`、原子发布和 receipt 幂等实现 `ObjectStorePort`；定位是 single-host durable production-profile adapter，不是跨主机云存储验收。Object 上传保持 T1 staging、外部 put、verify、T2 Available 的两段协议，导出作业在显式授权和租约保护下使用 repeatable-read snapshot 生成带 hash manifest、records JSONL 和 Artifact 内容的开放目录。

聚焦回归 27/27 通过，覆盖 artifacts、database readiness、filesystem object store 和 artifact export。真实云/多主机 ObjectStore、生产托管和外部验收仍开放；公开 HTTP/client 大正文链路与导出过期清扫已由后续条目关闭。验证见 [ObjectStore 流式与导出证据](verification-2026-09-13-objectstore-stream-export.json)。

## 2026-09-13：公开大对象上传与导出过期

`POST /v1/artifacts/object-uploads` 以 binary body 承载内容、base64url canonical metadata header 承载治理/摘要/长度声明。Fastify binary route 独立认证、取消、错误映射和 route `maxBytes`；typed client `artifacts.storeObject()` 支持 browser `ReadableStream` 和 async iterable。服务端先做 metadata、用途、Grant/fence/admit/reference 校验，再进入 T1 staging、ObjectStore put、read-back digest/size 复核和 T2 Available。FilesystemObjectStore 仍是 single-host durable production-profile adapter，不是分布式或 managed cloud 存储验收。

上传幂等从 ObjectStore receipt 提升为 Artifact 级预约：同一组织、调用者、`store-inline` 动作和幂等键先创建 command receipt，`resultRef` 绑定 staging Artifact；完成升版后重放按 ID 返回当前 Available record，Tracked 状态返回同一 tracking。并发重放由命令去重锁序列化，崩溃后的 Pending 预约不新建 Artifact。`ArtifactExportOwner.expire()` 现在按 worker lease 清理输出目录并原子转 Expired。真实 PostgreSQL/Identity/Fastify 聚焦回归 28/28 通过；分布式/云 ObjectStore、生产扫描隔离、托管与外部验收仍开放。验证见 [公开大对象上传证据](verification-2026-09-13-public-object-upload.json)。

## 2026-09-13：Observing Operation 查询调度

新增租户内 `runObservingQueryWorker`，把已进入 Observing 的 Operation 交给独立调度：按 Operation UUID 有界扫描，跳过活跃租约、已有回执捕获或当前版本报告的事实；每次读取都重新取得 Service context、Work Lease、Execution Authority、QueryExit 预算和独立 Capture 准入。Provider 响应先持久化原始/规范化证据并生成 Operation Receipt，再由当前 Reconciliation rule 比较全部回执；确认成功或无效果时在 Worker fence 内 CAS 关闭 Operation 并清除资源占用，TransportFailed/Unsupported/歧义继续保留 Unknown 责任。

该 Worker 不重放原发送、不改写矛盾结果、不做跨租户发现，也不把进程内 Capture retry 当作持久恢复。真实 PostgreSQL/OPA/Ledger 聚焦回归 `actions.test.ts` 72/72 通过，新增场景覆盖 ResponseLost→Recovery Observing→独立授权查询→Normalized Receipt→ConfirmedSuccess→Operation Closed/Succeeded。生产 Connector 凭据、真实 Provider 与托管部署仍属外部边界。验证见 [Observing 查询调度证据](verification-2026-09-13-observing-query-worker.json)。

## 2026-09-13：Action 详情实时失效

新增 `abh.action` 授权 SSE 订阅。Core 在每次事务中先用 Action Owner 强读租户/Workspace/用途内 Action，再复核当前 `abh.projections.read` Grant；恢复游标必须是绑定同一 Action 的 UUID Outbox 事件，游标错误返回 reset，而不是重放不可信状态。订阅只发送 subject/version/watermark 提示，不携带 Action payload 或敏感业务数据；初始连接先保存当前事件基线，只有此后提交的 Action 状态事件触发一次失效，同一命令重放不再产生事件。

Workbench 同源 BFF 允许转发 `abh.action`，`Last-Event-ID` 保持有界传递；Action 详情页用同一授权键控 TanStack Query 消费提示，SSE 禁用或失败继续授权强读轮询。本批以 Core/Workbench 类型检查、Workbench 28 项单测、既有真实 PostgreSQL Action 72 项回归和 800 条文档链接验证；未把不稳定的浏览器旅程当作通过证据。Overview/Inbox/Run/列表页 SSE、专用真实浏览器验收与生产身份适配器仍开放。

## 2026-09-13：对象上传二进制帧修复

Fastify binary parser 现在只从传入 payload 转发一次，并在收到声明 `Content-Length` 的最后一块后立即结束 decoded `PassThrough`；缺失、零长度和超 route 限制帧会在进入 Owner 前返回有界契约错误。该修复移除了旧实现同时监听数据事件又再次 pipe raw request 造成的重复接管/悬挂路径，也保证空请求可确定到达上传治理校验并以 `INVALID_ARGUMENT` 拒绝。

公开对象上传仍要求 exact declared size、current Grant/fence/admission/reference，先 T1 staging，再 ObjectStore put、read-back digest/size 复核和 T2 Available。回归覆盖 artifact 14/14、Fastify 16/16，最终 `corepack pnpm check` 的文档、契约、类型、全仓测试、构建和 API 报告门禁全部通过。验证见 [公开大对象上传证据](verification-2026-09-13-public-object-upload.json)。

## 2026-09-13：Run 状态授权实时失效

`abh.run` 现在纳入 Projection read 注册和 Core 授权 SSE 路由。订阅端必须绑定同一 Run 的 Outbox subject，每轮重读当前 Run、活跃 Human membership 和当前 `abh.projections.read` Grant；UUID 游标必须是同一 Run 的 Outbox 锚点，未知或跨主体游标返回 reset。事件帧只包含 subject/version/watermark 提示，不暴露 Run payload、任务或业务输入。

Workbench 新增同源 Run 强读 BFF、授权键控 TanStack Query、轮询兜底和 `abh.run` SSE 失效消费；Run 取消前的版本提示由服务端记录驱动。真实 PostgreSQL Run lifecycle 回归验证 start 事件锚点、complete 事件提示、version 2 推进和未知游标 reset；Workbench 29 项回归覆盖授权缓存隔离与有界事件路径。验证见 [Run 状态 SSE 证据](verification-2026-09-13-run-status-sse.json)。

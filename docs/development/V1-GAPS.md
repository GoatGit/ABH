# V1 实现缺口（2026-09-14）

本表按 [V1 设计索引](../V1/README.md) 和当前源码目录核对，用于安排后续实现，不是模块验收报告。当前工作区包含 contracts、core、adapter-pg-boss、adapter-fastify、adapter-pi、cli 和 workbench 七个包；Core 公共入口只导出 coreVersion。内部 Owner 的测试通过不代表公开服务、生产装配或独立门禁完成。

当前纵向链路已覆盖显式 HTTP/客户端、小 JSON 高层提案、同事务自动授权请求、Service 恢复发现、必要责任策略/Wait、Applied Control Effect→T1，以及多循环故障收尾的分段或联合证据。HTTP 实际停机钩子已接入 RuntimeService 联测。生产默认安装、公开入口到原生队列执行的完整联合场景和生产业务治理仍缺；下文按日期保留的记录描述当时状态，后续条目关闭其中部分缺口。

当前工程实现完成度约 99.9%（这是仅本地闭环的明细口径；根 README 的“约 90%”是含生产托管与验收在内的总体推进口径，两者不矛盾）。这是本地 V1 闭环、合同、持久化、授权、队列、适配器和 Workbench 的推进口径，不代表生产上线；真实 IdP/外部 Provider、生产托管、全局扫描、独立安全审查和真实 Domain 验收仍排除在该口径外。Ledger 现已具备不可变周期/单位目录、配置准入和退款/汇率 Correction 应用；ApplyCorrection Exception 处置也具备授权后的 Correction 应用与治理解冻闭环。

| 设计范围 | 已有实现 | 仍需实现 |
|---|---|---|
| 01—05 公共契约/状态/NFR/一致性 | Schema、生成链、状态关系、错误/目录/Port、API 报告和 PG readiness | 各未实现模块的实际协议/状态路径、容量与故障 SLO 证据 |
| 10—16 Mission/Run/Pi/Definitions/Context/Verification/Learning | 基础契约、通用 Durable、Mission 生命周期 Owner、Run 公共 Start/Complete/Cancel、ActiveRun 同步与静态 Assignment PinSet、有界 Task Graph Revision/Patch 验证、Durable Wait 唤醒 Owner、条件唤醒 Worker、终态 Run 恢复 Worker、固定无进展预算与 Stall Worker、Pi 0.85.1 invoke 与受治理 continue、持久治理 Checkpoint/Resume Permit、Ready Task 认领与可替换执行 Worker、过期 Running 接管、Invocation 装配/完成、迟到 Invocation 观察与 Owner 裁决、验证 CAS、Checkpoint 提交与下游派发、Context/Verification/Learning 基础入口、Draft Capability Candidate 创建、Profile 冻结/Evaluation Run 请求、Gate/Result 强读、Learning Signal/Case/Candidate 有界列表、用途撤回传播、Candidate readiness doctor 和 Evaluation Recovery Worker | Pi 完整 CTK/升级矩阵、生产 Gateway/Pi 装配、完整生产调度托管、迟到证据自动对账策略、真实评测宿主、复杂方差/Canary 分析和生产级学习闭环 |
| 20—21 Identity/Authorization | 当前身份/Grant/fence、身份映射查询期限与取消、用途、Connection、Action 批准效果、OPA、按输入类型隔离的 Mandatory 绑定/Scope 评估与同组织签发、T1/T2 | 正式 bootstrap/governance、真实身份入口、Scope 跨组织/停止条件扩展、策略与 Domain 生产装配 |
| 22 Ledger | 周期/单位目录、Reservation、精确累计量、Commitment、Settlement、超额/尾差、退款/汇率 Correction、只读余额/责任 doctor | 各资源策略生产装配和真实 Domain 规则宿主 |
| 23—24 Tool/Model Gateway | Tool 命令准入、幂等 callKey 内容摘要、Binding 状态/期限、原子 callLimit 和命令回执、显式付费 Tool 的 Ledger 预留/实际用量结算、租户内 Pending 恢复 Worker；Model Route 准入、host callId、Prepared/InFlight/Completed/Failed CAS 与歧义保持 InFlight | 实际外部执行、预算/隔离生产装配、模型路由效果、流式和运行恢复托管 |
| 25 Action | 准备/验证/固定/计划、授权、零派发清理、快照刷新、已派发取消/Reconciling、最终结算、确定性 TransportFailed Safe Retry、受控 safetyStop 围栏/回执退役、专用治理用途、有界候选发现、公开 StartSafetyStop 候选绑定提案、能力元数据登记与 exact 运行时证明 | 正式 Domain/自动 safetyStop 编排、生产发布与治理验收 |
| 26 Operation/Reconciliation | Permit/Attempt/一次性出站、确定性 TransportFailed Safe Retry、响应捕获、Unknown、对账/最终结果、独立 Query 出口/计费/限流/捕获、租户内 Observing 查询/捕获/对账/终态 Worker、终态矛盾报告与实际资源冻结、终态回执持续比较 Worker、safety 回执只退役安全例外、Human Exception 创建、保持 Unknown 和资源冻结的公共 ResolveException HTTP/客户端入口、ApplyCorrection 决议后的授权 Correction 应用与仅释放报告阻塞的治理解冻 | Exception 后续处置编排/责任重路由、生产 Connector/query policy |
| 27 Durable | 原生 pg-boss、Inbox/冻结 Outbox 扇出、Wait Port、Action/Operation 等待 Owner 与统一通知路由、租户内有界恢复 Worker、Outbox Publisher、原生投递代次确认/跨队列同键互斥、逐事件消费者完成凭证/恢复循环、租户运行装配、冻结事件队列消费者、退出排空装配、Worker 身份刷新期限与取消 | 生产 Worker/Publisher 托管与身份/安装治理、受限全局扫描、连续消费水位/新订阅回填、原生清理后的持久去重、保留清理 |
| 28 Data/Artifact/Audit | 内联 Artifact、原始回执编码、摘要/用途、Audit/Outbox、FilesystemObjectStore 单主机 durable adapter、无上限流式上传、公开 HTTP/typed client 上传、Artifact 级上传回放预约、staging/Tracked 清扫、有界二进制、持久反向血缘、授权保留/导出生命周期 | 分布式或 managed cloud ObjectStore adapter、生产上传扫描/隔离验收、真实生产 Domain 保留/导出验收 |
| 29—31 Pack/Release/Secret | 静态 Release/Assignment/实际 Pin 校验、持久签名治理、内容／Schema 校验、本地 staging/恢复、能力登记、NotApplicable 分支 Human 审批与原子 Enable／回执重放、候选 HTTP/SDK、同事务精确解析、内部 Pack 派发／查回／Capture 装配、双签名 Pack 退役后替代查询至 Operation/Action 最终收敛联测、只读 doctor pack 安装诊断、显式 scope 的持久 suspension 回填水位 | 真实 Provider 与生产治理端到端验收、T1 同组能力 fences 的生产装配、生产 scope 目录、退役引用水位/移除治理、兼容证明发行与生产查回治理、验证前提变化后的重验、适用迁移的 Domain/回填/投影验证、安装恢复编排、rollout/canary、真实 Secret 与隔离运行 |
| 40—42 Responsibility/Decision/Correction | Responsibility Assignment、请求路由快照/席位、Decision、完成证据、Authority Effect、终态 Exception 与实际 Request/Decision 绑定、持续异常路由、Unresolved 原席位资格重试、责任/审批/授权效果 Workspace 继承与隔离、请求整体到期关闭/Decision Expired 与扫描宿主装配、责任撤销/必要席位保护与 fence、Pending 撤回/源证据与 Wait 通知、受治理检查约束的新 Route revision 与不可变依据、Unresolved 原路由恢复 Worker 与不可变冻结提案默认读取、内部当前待办分页查询、不可变 Correction 候选/三类目标应用/ApplyCorrection 治理解冻、Core HTTP/typed SDK 提案与强读接入、专用 DelegateSlot 单席位交接、EscalateSlot 四级有界升级、Capability 纠错到 Draft Learning Candidate | Exception 后继编排、生产 reviewer 资格与管理权限装配 |
| 50—51 Projection/Realtime/Workbench | 设计、部分契约、用途过滤的 MissionSummary 与 ResponsibilityInbox Projection Owner、单调 source version vector、durable consumer watermark、授权化 Outbox 事件发现、Inbox 事务消费、历史 gap 回补、ListProjection/fieldSet、异步 RefreshProjection、租户 Runtime 统一监督的 MissionSummary 与 ResponsibilityInbox Worker、MissionSummary、Decision、Action、Run 与组织级订阅装配、授权/游标失效 reset、SSE 用户与组织并发上限、只读 MissionSummary projection doctor、有限标签投影运行指标、Next.js Workbench 基础包、Overview/Inbox/Decision/Mission 首条服务端参考路径、Action 列表/详情/授权可见子项/有理由取消、TanStack Query 授权键控的 Mission 投影/Decision/Action/Run 状态、Overview/Inbox/Action 列表组织级同源 SSE、真实浏览器 Run/Action/补偿变更与断线恢复、acting/resource 组织上下文显示与显式切换 UI、宿主注册补偿模板、JSON Forms/Ajv2020 表单和公开 Action 提案、有界 Settings 快照/命令、可配置 Settings HTTP 生产装配、形状受控的 Mission ECharts 投影，以及覆盖公开 SubmitDecisionPayload 的 JSON Forms/Ajv2020 审批旅程 | 真实补偿治理服务验收、生产身份适配器验收，以及生产进程/租户生命周期托管 |
| 60—62 SDK/CLI/工程 | workspace、契约包、显式 Core HTTP Owner/DTO/Identity 安装、类型化客户端与小 JSON 高层提案、实际入口停机、CI 脚本、本地集成测试、`abh run` 显式业务安装模块连接 assembled HTTP 与 runtime host、`defineBusiness` 声明/稳定摘要/输入校验、hello-business SDK 模板、Business→未签名 Manifest/CTK 计划固定编译及 `abh pack compile-business` | 生产 HTTP 身份/治理和默认启动、hello-business 发行验收、真实异质 Domain、独立 CTK/安全/恢复/性能门禁 |

## 当前 Pack 运行链的待验收项

1. 真实签名非空 Connector 已贯通登记、Human 启用批准、Enabled、实际 Action/Release/Pin、编译/Operation 登记、独立业务批准、T1、Permit、dispatchPackAndCapture 和 Capture 故障重试；实际登记摘要与同组 capability-read fence 已联合验证。双签名退役查回链已验证最终 Operation/Action 归并；仍需真实 Provider／生产治理与非零业务资源计量验收。
2. queryPackAndCapture 已在真实签名包链上通过独立 Scope Authority、预算、派发撤权后的查询及 Capture 恢复；查询次数与一次计费已验证。第二个独立签名 Enabled Pack 已在原包 Retire、Assignment 暂停后完成兼容查询、Capture 恢复与最终收敛；仍需真实 Provider、兼容证明发行及生产安装治理验收。
3. Suspend 已实现原子停用、历史保留、durable 事件及明确安装订阅的 pg-boss 投递／Action 观察／Inbox／OutboxConsumption 联测。消费者核对真实历史 Pack 与能力登记；已接入持久扫描页到 Action 的有界恢复投递、显式 scope 的持久高水位/cursor 回填。Run 通知 Owner 也已接入同一原事件 Inbox 语义并持久化 Run/Task 观察；仍需生产 scope 目录/托管调度、退役引用水位/移除治理以及原能力撤回后兼容查回的生产治理，保持未决 Operation 责任。
4. 完成运行宿主默认安装及真实业务／身份治理；其余 Mission/Run/Pi、Gateway、Workbench 等范围仍按总表保留。

以下为早期阶段顺序与历史批次记录，当前已完成项以顶部总表和后续验证证据为准。

## 下一阶段顺序

1. 将已实现的同组织 Scope 签发接入正式治理入口，并补齐跨组织与停止条件验证，使政策发布和 Connector Fixture 可被生产装配替换。
2. 以部署提供的完整授权装配验收 hello-business；`defineBusiness`→未签名 Manifest/CTK 计划固定编译已实现，正式安全编排仍保留。
3. 将租户内 Worker/Publisher 接入生产托管与受限全局扫描，完成原生队列确认和保留水位问题。
4. 在正式 `defineBusiness` 与 hello-business 模板后，以部署提供的完整授权装配挂载 Fastify、SDK/CLI 入口和开发示例。
5. 实现 Mission/Run/Pi 与 Gateway/Context/Verification，再推进 Pack、Workbench 和学习模块。

Query 当前行为和限制见 [执行 Owner 说明](../../packages/core/src/execution/README.md)；历次实现与验证记录见 [持续实现跟踪](IMPLEMENTATION.md)。


## 2026-09-16：首个领域产品（lime-ads）集成审查发现

以真实领域产品通过 `link:` 依赖 + `abh run` 参考部署接入时的实测发现：

1. **伴生 schema 登记缺口（已由领域侧补齐，框架留观察）**：领域产品与 ABH 同库存放自有业务表（如 `lime.document/audit/credential`）时，readiness 安全清单将其判为 `unregistered-table` 并拒绝启动。领域侧按隔离 Pack 语义登记（专属角色 + 所有权 + 受限角色零权限 + `extension.schema_ownership/schema_roles`，见 lime-ads `apps/api/scripts/register-companion-schema.sql`，并在领域服务启动时自愈维护）。框架侧"伴生 schema 一等登记"（不必伪装成 Pack 隔离 schema）留作改进项。
2. **`assembleAbhService` 能力透传缺口（已修复）**：组合器此前丢弃 `capabilityQuery/artifactStorage/objectUpload/safetyStops/packInspectionDiagnostic/actionCancellation`，导致经 `abh run` 的部署永远无法挂载这些公开命令。已按 `CoreHttpInstallation` 可选字段透传。
3. **hello-service 缺 artifact 存储与能力查询装配（已补）**：CreateMission 需要 goal artifact，但参考部署未提供 `artifactStorage`，写路径不可用；同时补 `capabilityQuery`（空注册表 + 明确未配置的 inspect）与 provision 的 `abh.artifacts.store-inline` 授权。
4. **run.mjs 安全清单违规明示（已补）**：readiness 失败现在无条件输出违规明细（部署操作员的修复清单，非机密）；`ABH_RUN_DEBUG=1` 仍输出被掩码错误的 cause。
5. **待查回归**：空库上 `abh.missions.list` 返回 `INVALID_ARGUMENT`（grants 解析成功、事务内抛出）；grants/授权/身份均已验证正确。待并行重构稳定后定位。
6. 文档修正：hello-service README 迁移数 94 → 96。


## 2026-09-08：HTTP 适配层

新增 adapter-fastify，固定 Fastify 5.12.3。显式安装公开路由、可信认证上下文、Contract Package 请求/响应校验、ETag/Location、脱敏错误和有界取消已实现。真实 TCP 验证重复幂等头拒绝。Core 业务授权/DTO、生产身份、真实 readiness、SDK/CLI 和 hello-business 仍未装配；不能把传输层测试当成公开业务链路验收。


## 2026-09-08：Decision 撤回业务链路

Core 服务装配层已通过实际 IdentityIngress、当前 Grant 与 withdrawDecision 事务提供显式安装的撤回 HTTP 路由。私有 VerifiedContext 证据与单次请求绑定，响应使用持久回执原 commandId；并发、重放、当前治理/身份 epoch/Grant 撤销经真实 PG 验证。生产凭据解析和原事项来源治理仍由必需安装提供；其他公开命令、DecisionView 查询、Workspace 身份选择和完整服务发行未完成。


## 2026-09-08：Decision 提交与持久效果意图

SubmitDecision 已接入 HTTP/IdentityIngress/当前 Grant/冻结席位验证，重放仍查当前 Human Assignment 与治理。40 号迁移保存不可变 Pending 效果意图，与最终批准、整体完成凭证和 Outbox 同事务；计划为空、重复 effectKey 或错误目标会回滚。部分批准和拒绝不创建效果，命令重放返回原 commandId 和稳定 effectTrackingRefs。目标 Owner Effect 消费、Applied/Blocked/Abandoned 回执、重投 Worker、连续状态查询和生产治理装配仍未完成。


## 2026-09-08：Control Effect Applied 回执

同库 Control 效果已原子提交有限 Service Grant、Action Authority、不可变完整回执及 Audit/Outbox/CommandReceipt。独立管理权限使用 abh.execution-authority.create，重放仍执行当前管理准入；已撤销 Authority 不复活。仍缺 Domain 效果、Blocked/Abandoned 与新责任事项、冻结签发参数的生产装配、队列消费/重投 Worker、公开状态查询及完整服务验收。


## 2026-09-08：Control Effect 恢复

签发参数已在受权独立事务冻结，Apply 强制匹配；租户 Service Worker 从持久参数恢复尚无回执的效果，固定身份/组织/Workspace/用途，多 Worker 复用稳定命令幂等提交，runtime host 可安装。仍缺生产策略构建、错误分类退避、Blocked/Abandoned/新责任事项、Domain 效果、事件队列路径、全局发现、容量/SLO 和公开效果查询。


queryDecisionEffects 已提供基于当前 Decision 读权/证据可见性的内部 Pending/Applied 摘要，核对真实完成凭证与命令回执；完整 DecisionView、QueryMeta、availableActions 和 HTTP 查询仍待装配。

readDecisionView 已组合完整 Package、持久效果摘要和当前 Grant/前置条件约束的可用操作；完整 QueryMeta/连续水位、HTTP get/list-inbox 和 SDK 仍未装配。

Decision 单对象 Strong GET 已接入 HTTP，返回当前权限裁剪的完整视图、数据库 asOf 与对象 source 指纹水位。此水位不代表连续事件消费；Projection、ListInbox HTTP、SSE/连续水位和生产装配仍未完成。

Strong Decision Inbox HTTP 已按当前读权返回完整分页视图，过滤空页保留扫描游标，类型映射明确安装。当前为页级源指纹与独立当前读取；跨页快照、Projection/SSE 连续水位和生产类型目录仍未完成。


## 2026-09-08：浏览器客户端入口

`@abh/core/client` 已提供 Decision、Action 查询/取消/请求授权/高层提案、Artifact、Mission、Run、Learning、Correction 和 Exception 调用的类型化传输，复用请求和响应契约，期限与流大小有界，不自动重试写入。Decision 提交重放经过真实身份/Grant/PG 验证，Action 为显式处理器的适配层互通。`defineBusiness`/专业 SDK、hello-business 发行模板和生产验收仍未完成。接口与不确定结果处理见 [客户端说明](../../packages/core/src/CLIENT.md)。


## 2026-09-08：Action 提案业务 HTTP

proposeAction/actionProposal 已连接实际 IdentityIngress、独立当前提案 Grant、现存 Artifact 和 ActionOwner，原子提交 Action/Intent/回执/事件，202 重放保留原 commandId 与 v1 引用。治理回调副本隔离和真实客户端并发/撤权/回滚均有验证。仍需生产来源/定义策略、Action get/list/cancel/request-authorization HTTP、输入 Artifact 上传/高层提案编排与完整执行发行。


## 2026-09-08：Action Strong 单对象 HTTP 查询

getActionQuery/actionQuery 已组合实际授权 Snapshot、子 Operation、当前责任 Request 与技术资源冻结，逐项可见性裁剪，当前读取 Grant 独立于按钮命令权限。HTTP/client 查询、404 隐藏、撤权、取消后的水位改变、授权和 Unknown 资源占位均有真实 PG 测试。当前仍为对象来源指纹；Action 列表倒序分页、Projection/SSE 连续水位、取消/请求授权 HTTP 与生产治理未完成。


## 2026-09-08：Action 倒序列表与加密分页

Action List HTTP 已支持创建时间/UUID 倒序、全部注册筛选、整页 fence/父锁、独立空页读权和完整 ActionView。ac1 游标加密并绑定身份/范围/筛选，保留微秒，真实 PG/HTTP/client 验证连续翻页和过滤空页。跨页快照、连续 Projection/SSE、取消/请求授权 HTTP、上传与生产装配仍未完成。


## 2026-09-08：统一 Action 取消 HTTP

取消 HTTP 已连接实际身份/独立取消 Grant 与当前来源准入，统一准备取消、Authorized 零派发资源清理、已派发停止并保留对账责任。稳定回执、执行撤权后取消、回滚及 Permit 竞争有真实测试。生产治理、持续义务清理、请求授权 HTTP 和 Artifact 上传继续实施。

## 2026-09-08：T1 身份边界

首次 Action T1 已与刷新路径统一检查当前执行 Service/凭据 epoch/成员关系/Scope epoch，拒绝用 Human 请求上下文直接签发 Snapshot。RequestAuthorization HTTP 仍需明确区分调用者的请求权限与执行 Service 的当前执行上下文，并持久推进准备/责任/授权步骤；不能以直接转调 Resolver 冒充完整装配。

## 2026-09-08：Service T1 事务入口

已有计划 Action 可通过 authorizePreparedAction 在当前配置 Service 下原子授权并持久幂等查回，重放仍查当前来源/身份/安装准入。并发、Snapshot 写入回滚、连接重建、Authority 断言和撤权已有真实测试。它只承担准备完成后的执行步骤；Human 请求接收、持久推进任务、计划准备、必要责任请求和 RequestAuthorization HTTP 尚未完成。

## 2026-09-08：内部领域验证准入

validateAction 已通过独立当前内部 Grant、来源/证据与实际 Artifact 校验组合已有 Validator/ActionOwner 和回执，支持领域拒绝回滚、并发幂等与取消后的历史结果查回。计划准备、责任请求、Human 到 Service 持久推进和公开请求授权仍需继续装配；此入口不代替生产 Validator 证据实现。

## 2026-09-08：无执行委托的版本准备

ResolveAndPinRequest 已支持准备 Grant；pinAction 用独立内部当前权限完成 Action/PinSet 原子绑定和当前重放检查，消除先审批才能固定准备版本的循环。Compiler/计划注册准入、生产能力读取策略、责任分支和完整 RequestAuthorization 持久推进仍需实现。

## 2026-09-08：计划注册准入

registerOperationPlan 已组合当前准备 Grant、固定版本、来源/范围证明和 Artifact 校验，原子提交 Plan/Operation/Action/回执，支持当前权限重验及稳定重放。它接收已编译产物；生产 Compiler 绑定和调用、必要责任请求、Human 到 Service 持久推进及 RequestAuthorization HTTP 仍未完成。

## 2026-09-08：固定 Compiler 宿主

内部 ActionCompilerHost 已支持精确 PinSet 能力选择、有界取消、输入副本和绑定/摘要验证，候选计划可进入实际 registerOperationPlan 事务。生产 Compiler 实现、公开编译 Port/SDK、已授权输入获取、持久授权推进和进程隔离仍未完成；此宿主不是外部代码安全沙箱。

### 编译输入的当前授权读取

`compilePreparedAction` 已组合真实数据库输入、当前准备 Grant、Release/来源/Artifact 校验及固定 Compiler 宿主，编译前后校验并拒绝取消或撤权后的输出。尚未提供持久编译任务、生产正文读取能力、专业 SDK 或完整 RequestAuthorization 调度；不能将此内部入口视为公开请求自动推进已经完成。

### RequestAuthorization 请求事实

已新增内部当前 Grant 下的不可变请求接收，使用原 Command 去重并与 Audit/Outbox 原子提交，Human 身份不被当作执行权限。请求接收不是自动推进完成：RequestAuthorization HTTP、恢复发现、阶段子键与产物恢复、必要责任分支和 Service T1 装配仍未完成。迁移 43 及真实并发/回滚/重放测试覆盖持久接收边界。

### 授权请求恢复发现入口

已有固定执行 Service 下当前权限校验的请求分页发现，按当前 Action 判断 Validate/Pin/Compile/Authorize，取消后不再返回，隐藏行与空页支持继续扫描。扫描不是工作租约、阶段完成回执或授权；宿主循环、稳定阶段子键、编译产物恢复、必要责任分支和 Service T1 自动衔接仍待实现。

### 原请求的实际准备阶段

验证与 Pin 已通过 `validateRequestedAction`/`pinRequestedAction` 在固定 Service 当前 Grant 和请求来源准入下落到实际 Owner，具有稳定阶段幂等键及原回执重放。恢复发现后已可调用真实准备步骤；尚缺运行宿主、编译候选持久恢复、必要责任分支和 T1 自动推进，不能据此声称 RequestAuthorization 端到端完成。

### 请求编译注册恢复

`compileRequestedAction` 已串接实际 Compiler 和注册 Owner，以已提交不可变计划恢复阶段；并发候选收敛于原计划，重启不重新编译已提交输出。未提交候选无副作用，可重新计算，不新增独立候选 Workflow。尚需准备运行宿主、生产 Compiler 与已授权正文读取、必要责任分支及 Service T1 自动衔接。

### 原请求绑定的执行阶段

已有 `authorizeRequestedAction` 在固定执行 Service 下使用持久断言与稳定阶段键调用真实有限 T1，重验请求来源/当前批准/策略/预算并支持原回执恢复。它要求必要批准和 Authority 已经存在；自动责任分支、Wait 恢复到授权、阶段运行宿主与公开 RequestAuthorization HTTP 仍待装配。

### 授权准备阶段宿主

已有 `runAuthorizationWorker` 和租户宿主可选装配，真实验证/Pin/编译注册可以由恢复扫描自动推进。可配置独立执行上下文调用 T1，但宿主 T1 分支/宿主集成尚缺专项端到端证据。必要责任创建和 Wait 恢复、生产安装/身份/正文读取策略与公开 HTTP 仍未完成；缺权/缺批准失败不会被当作完成或自动批准。

### 宿主 T1 提交后恢复证据

宿主 T1 分支已有真实 PostgreSQL 集成覆盖：恢复发现、同一主体的独立执行用途、真实 T1、提交后通知失败、新连接重启不重复授权，以及身份变化/准入撤回拒绝。关闭此前“宿主 T1 分支缺专项证据”缺口。自动责任创建与 Wait 恢复、多循环租户宿主端到端、生产治理和公开 HTTP 仍未完成。

### 原请求的责任创建 Owner 装配

已有 `openRequestedResponsibility` 将持久授权请求、已计划 Action、独立开单 Grant 和当前来源准入组合到实际 Decision Owner，并使用固定请求级幂等回执。尚未由宿主自动选择必要责任策略、注册 Wait 或从责任效果恢复授权；业务安装仍需证明必要席位与证据覆盖。

### 责任创建后的恢复读取

已可依据原授权请求 ID 从持久开单回执和首次冻结提案恢复原责任，不要求调用方重新生成随机路由参数；Open/Closed 后仍重验当前开单权限并返回原回执及当前状态。尚缺自动责任策略选择、Wait 注册与效果完成后的宿主授权恢复。

### 责任等待装配入口

已有原授权请求→恢复首次责任提案→独立当前投递身份→真实 Action Wait Owner/Wait Port 的装配，等待参数与幂等键稳定，支持重连及实际关闭事件回源生成唤醒。尚未由授权宿主自动选择责任策略和调用此入口；责任关闭到 Authority Effect 完成后的 T1 恢复仍需衔接。

### 责任效果恢复状态

已可在原请求当前准入下读取责任及指定 Control Effect 的历史进度，区分责任关闭与效果应用；实际应用后仍须 T1 重验当前权限。宿主自动责任策略及 Effect 到 T1 的调度尚未装配。

### 宿主必需责任等待

明确要求责任批准的宿主安装已可自动检查原责任、注册/复用 Wait、等待 Control Effect 并阻止提前 T1。缺失原路由会失败，不绕过审批。自动首次创建路由、按业务类型选择责任策略、EffectApplied→宿主 T1 联合验证及生产装配仍未完成。

### 首次责任策略已接入宿主

显式责任安装现在可通过受信 policy 回调依据当前持久 Action/Intent/Plan 构造首次路由，真实 Owner 冻结后在重启与并发中复用，并自动接入 Wait。策略本身不构成批准或执行权限，必需席位/证据仍由安装治理重验；生产业务策略、默认部署与 Applied Effect→宿主 T1 联合证据尚缺。联测发现不同 Grant 的相同 Wait condition 安装会扫描彼此待办，恢复扫描仍需按安装边界隔离。

### Wait 恢复安装隔离

同一 condition 的多 Grant 安装互扫缺口已修复：业务 Wait Owner 绑定精确 recoveryAuthorityRef，数据库在分页前裁剪到对应安装；当前权限复核不变。生产环境仍需明确安装 Grant 的生命周期和旧 Grant 待办接管策略。

### RequestAuthorization HTTP 已装配

可显式安装持久授权请求的公开 HTTP 入口，客户端调用经真实身份/Grant/来源检查进入 Owner；受理和执行分离，后续可由授权宿主扫描。尚缺高层 actions.propose 自动创建请求的稳定子命令键、StoreArtifact HTTP、生产安装及完整效果到授权联合验证。

### 必需责任 Effect→T1 联合链路

现有真实联合场景已连接首次策略开单、Wait、Decision 提交、Control Effect 冻结/实际应用、必需责任宿主和 T1。验证 Pending 不执行、T1 回滚、提交后重启去重与历史 Applied 后撤权拒绝。此前缺少这一联合证据的缺口已关闭；多循环租户运行时、生产业务资格/范围策略、高层提案编排和全 V1 验收仍未完成。

### 多循环授权宿主收尾证据

必需责任授权、Operation 恢复、Outbox Publisher、消费覆盖和 Wait 恢复已在真实数据库下联合运行并验证失败取消/收尾。已提交 T1 保留且重连无重复。队列未接收作为显式 Fixture；生产队列投递/消费/效果/授权整体场景、生产启动与托管仍未验收。

### Artifact 准备输入受理

现有内联 Owner 已有组织级当前 Grant、来源和数据治理受理入口，并以同事务回执去重。该入口支持既有 64 KiB 惰性正文；StoreArtifact HTTP、大对象流式上传和高层 actions.propose 自动编排已实现，生产上传扫描/隔离和完整 Domain 治理仍待验收。

### 内联 Artifact 公开存储

组织级 store-inline 和对象上传已有公开 HTTP 与 typed client 路径，接入真实身份、当前存储 Grant、数据治理、ObjectStore digest/size 复核和持久回执。同一幂等键在 Artifact 层预约去重；生产上传扫描/隔离和高层 actions.propose 自动编排仍待完成。

### 高层内联 JSON 提案

客户端已可用稳定子键完成 StoreInlineArtifact→ProposeAction，同 Artifact 同时作为来源和输入。真实响应丢失恢复与同键异参已有覆盖。此功能覆盖小 JSON 输入的高层存储/提案，完整流式输入、服务端提案后自动接收授权请求、生产业务声明/SDK/CLI 仍未完成。

### 提案后自动请求原子接收

已可显式安装提案同事务自动授权请求，消除提案提交后中断导致的无人推进窗口。当前请求 Grant/来源治理与提案权限分别检查，原请求供既有宿主继续执行。生产默认安装、完整客户端到原生队列执行全链路及其他 V1 模块仍需完成。

### 高层自动提案恢复发现

高层客户端存储/提案、同事务自动请求和固定 Service 恢复发现/实际验证已联合覆盖，重连不重复验证且原提案回执稳定。后续 Pin/编译/责任/T1 各装配已有分段证据；完整公开入口到生产队列执行、默认启动及业务治理仍未整体验收。

### HTTP 入口实际停机装配

已提供 stopHttpIngress 并与 RuntimeService 联测：关闭准入后等待真实认证/Owner 工作，包括 HTTP 已超时的工作，随后才排空队列、保存报告和关闭依赖。已关闭“HTTP 停止钩子没有实际实现”的缺口。有界收尾仍依赖受信处理器遵守取消；生产默认启动、所有清理回调期限及完整原生队列链路尚未验收。

### HTTP 监听与进程生命周期统一宿主

已有 runHttpService 将已安装 HTTP app、恢复循环、进程信号、独立 drain 身份、报告持久化与依赖关闭组合，真实 TCP 覆盖正常启动、端口占用、启动前取消、监听通知失败和启动期间 SIGTERM。修复 close 早于 listen 完成造成端口遗留的竞争。该入口要求显式业务安装，不等于生产默认 bootstrap、完整 readiness 或公开入口到原生队列全链路验收。

### HTTP 与租户循环直接监督

runHttpService 可直接安装租户的各业务循环，复用共享租户绑定并要求相同 Database 实例。关闭了内层 Worker 失败必须等同伴收尾后才通知 HTTP 停机的装配缺口。测试以真实 PostgreSQL/HTTP 注入身份失败并延迟同伴收尾，确认端口先关闭而 drain 等工作 join 后执行；完整成功业务与原生队列执行链路仍需验收。

### 监听前能力检查

统一宿主已支持具名只读 startup 检查，共享有界期限且必须在监听/Worker 前完成；失败/取消/晚到输出不开放服务。真实 PostgreSQL 场景验证只读事务标记，生命周期场景验证顺序与取消。检查的实际身份/Pack/Policy/Secret 实现仍由安装提供，生产默认检查集与连续 readiness 尚未完成。

### 生命周期配置与启动诊断

RuntimeService 接管后固定原生命周期回调、循环和依赖方法，避免调用方改写配置导致错误资源被排空/关闭；绑定保留实例私有字段。启动失败已带具名检查与原始 cause。仍未提供生产默认安装、持续健康汇总或完整 CLI doctor。

### 实际 Service 身份启动检查

已提供 serviceIdentityCheck，连接当前 ContextSource、同组织固定 Service 绑定和实际 Identity Owner 只读检查，覆盖数据库凭据/成员/组织停止与 epoch 失效。当前无 Workspace；跨组织启动核验及生产 IdP/Secret/能力检查集仍未完成。启动通过不替代每次 Worker 当前 Grant 与执行权限。

### 身份到 HTTP 启动联合证据

同组织 Service 已有 IdP Port（Workload Fixture）→真实映射/IdentityIngress/成员检查→startup→实际 HTTP socket 的联合成功/撤销场景，补足只测内部 VerifiedContext 的证据缺口。撤销时没有 Worker、监听或越过排空准入；退出释放连接与信号监听。生产 IdP、原生队列与完整业务成功链路仍未完成。

### 身份启动与原生队列排空

身份→HTTP→退出场景现使用实际 pg-boss 与 QueueAdmissionDirectory/当前 drain Grant。验证空队列真实排空与启动后撤权拒绝，不生成伪成功报告。关闭这一场景仅使用 Fixture 队列的证据缺口；业务 Job 投递/执行/恢复全链路和生产 IdP 仍待完成。

### 租户投递消费循环

租户宿主现可直接安装 deliveries，共享租户绑定并由外层监督故障。真实原生重投已通过宿主生成的投递循环，复用实际 Inbox 后确认；onHandled 的期限/取消已补齐。不合作观察回调不再阻塞退出，Owner 提交和原生确认顺序保留。完整公开业务入口到执行全链路仍缺联合验收。

### 投递消费者安装快照

Delivery Worker 已固定本次消费者与队列方法，实际数据库测试验证等待 fetch 时替换安装回调不影响原准入/确认，且 Inbox 不重复。生产业务安装、完整公开 Action 执行链路及其他 V1 缺口仍未完成。

### HTTP 宿主恢复实际原生投递

已联合验证已提交 Ledger Owner 效果/确认丢失→新数据库与原生队列实例→HTTP 托管 delivery 重投→原 Inbox 复用→原生确认→SIGTERM/当前 Grant 排空/关闭。关闭此前原生投递循环未与 HTTP 生命周期联测的缺口。该场景仅运行 delivery，生产默认身份和完整公开 Action 执行链路仍未完成。

### 排空身份解析期限

QueueAdmissionDirectory 提供的排空身份解析已受独立期限约束并传播取消，关闭原 context() Promise 永久挂起的缺口。真实数据库生命周期测试确认超时不排空、不伪造报告而继续关闭连接；报告保存/关闭回调及完整生产生命周期仍需后续实现。

### Pack 摘要公共基础

Contracts 已实现 V1 Pack 的 Manifest/Artifact 集合/包摘要与签名原文算法，提供固定跨语言向量；JSON/路径/元数据拒绝及异步快照已有覆盖。defineBusiness 依赖的完整 Manifest Schema、原始字节核验、构建器、签名/信任/CTK Loader 仍缺，不能将元数据摘要实现视为 Pack 安装完成。

### Pack 原始内容核验

Core 已提供 verifyPackContent，复用公共 Pack 摘要并流式校验 Artifact/Migration 字节、长度和完整 Payload 路径集合，显式数量/字节/时间限制与取消。完整 Manifest Schema、归档扫描与链接拒绝、签名/来源/CTK 和 Pack 启用仍缺，不能只凭内容核验执行制品。

### Pack Manifest 正式结构契约

Contracts 已新增 PackManifest 及文件/能力/资源子类型，生成 Schema/类型/API 并校验信任模式、资源、迁移与路径约束。版本范围解析、命名空间信任、部署资源上限和完整字节/签名/CTK 验证装配仍待 Loader 完成；defineBusiness 尚未实现。

### Manifest 与内容核验组合

verifyPackContent 已强制正式 PackManifest 静态校验，并修复 open 接收的取消信号只覆盖打开阶段而未覆盖完整流的问题。非法信任/权限声明即使摘要一致也不读取。归档/证明/信任及 Pack 启用仍未完成。

### 本地 Pack 内容目录扫描

已有受保护 staging 目录扫描，拒绝链接、特殊/额外/缺失文件，限制总字节与目录项并生成 Payload/证明私有快照。要求目录由部署方控制且不可变；敌对可写目录隔离、压缩归档解包、签名及完整启用仍未完成。

### Pack 部署包络准入

新增实际静态部署准入：semver 兼容范围、Pack/模式/许可允许列表、权限子集、能力命名空间、精确 HostProfile 及 Isolated 可用性/资源 ceiling。生产签名者授权、能力依赖图、CTK/动态撤销与最终启用未完成；该检查不赋予业务权限。

### Pack 能力依赖图

已有确定性候选依赖解析与精确选择，拒绝缺失/歧义/循环/自依赖和冲突，返回依赖优先顺序与诊断链。能力独立 Schema/Digest 尚缺，重复能力身份保守拒绝；安装状态/Scope Release/信任与 Loader 原子启用仍未装配。

### 本地 Pack 预检装配

prepareLocalPack 已串接部署策略、实际目录扫描及内容校验，共享期限并返回固定快照，拒绝非法策略后仍读文件或校验失败后返回候选。签名/来源/CTK、持久安装与启用尚未装配，候选不代表可信执行能力。

### Pack 离线签名与构建来源

已有真实 Cosign 固定公钥验证：重建原文签名、精确 Pack 发布者策略、独立构建公钥 DSSE/SLSA 来源验证以及 subject/Builder/buildType/源码固定。只支持显式离线公钥策略，尚无 Fulcio/Rekor 策略、签名撤销与历史版本冲突治理。CTK 缺少正式报告契约及独立签名准入，完整 Loader/持久安装/启用仍未完成。

### CTK 报告合同与独立签名准入

Contracts 已生成 ConformanceReport/CaseResult/CapabilityClaim/Environment，包含完整性状态、结果/声明/环境/时间/证据引用及排除自身摘要与签名路径的报告摘要政策。Core 已用独立 Cosign DSSE 公钥验证报告并比较部署固定 Suite/case/环境/有效期/能力集合，拒绝不完整、失败、偏差及错误 subject。尚缺完整 @abh/conformance Suite、隔离 Runner/恢复、证据内容复验、Official 门禁及 Loader 持久安装/启用。

### 本地 Pack 内容与三证明联合验证

validateLocalPack 已将实际字节、发布者签名、SLSA 来源和 CTK 组合在相同快照/期限内，联合真实 Cosign 回归通过。仍缺部署治理 Command/持久报告、策略版本及撤回、安装依赖检查、数据影响/迁移、Stage/Enable 状态与恢复；不把验证成功当成安装或权限。

### Pack 验证报告合同

PackValidationReport 已绑定实际证明字节、部署策略、制品摘要与 CTK 有效期，validateLocalPack 输出独立报告副本。持久部署治理报告、TrustPolicy 版本引用与当前撤回检查仍缺；现有 InlineArtifact Command 限 Action 准备用途，不能绕过其用途授权保存部署报告。

### 当前 Pack 治理读取边界

validateCurrentPack 已要求当前部署策略源，联合验证前后重读并拒绝快照变化、撤回和历史身份冲突，返回治理 Ref 供 Stage 原子比较。测试为内存治理源加真实 Cosign；持久认证治理源、Stage 同事务版本锁/授权/审计与完整安装状态仍缺。

### 治理快照完整绑定

GovernedLocalPack 已返回治理完整快照摘要，供 Stage 在同事务锁内与 policyRef 一起比较；拒绝重复历史身份/撤回项。仅策略版本无法绑定独立变更的撤回和保留列表。数据库治理源、原子比较及持久安装仍待实现。

### 有界 Manifest 文档解析

已实现 JSON/YAML UTF-8 字节解析并接入当前治理联合验证：拒绝重复键/别名/标签/不安全数值，独立 Worker 限制解析资源并支持取消。仍缺归档容器解包、Manifest 文件发现与有界读取、持久治理及 Stage/Enable，不等于完整 Loader。

### tar/gzip 本地验证输入

已接 tar/tar.gz 有界解包至私有 staging、根 Manifest 解析、精确文件集合及完整密码学/治理验证，失败清理。限制压缩/全部展开字节和有效条目，当前总内容快照 64 MiB；尚缺 500 MiB 级流式内容存储、独立原始 tar 元数据头数量限制、文件有界读取入口及持久 Stage/Enable。

### 隐藏归档元数据计数

tar-stream 内部处理的扩展头现按公开偏移量间隙逐 512 字节块保守计入条目预算（包含扩展内容），文件前后均检查，结束双零块必需。此前缺少原始扩展头计数的缺口已补；64 MiB 快照/大包流式存储、持久治理及 Stage/Enable 仍缺。

### 本地发行包文件入口

已补 readPackArchive/validatePackArchiveFile，从规范绝对路径有界读取受保护普通文件并进入完整验证，拒绝超限/链接/非普通文件并关闭句柄。仍需部署保护目录与挂载；大包流式存储、持久治理和 Stage/Enable 未完成。

### Pack 验证报告持久化原语

已新增 extension.validation_reports 及不可变租户 Owner，保存真实验证候选、治理 Ref/摘要并原子写审计/Outbox，运行时无更新/删除权限。仍缺正式部署治理 Command/用途/Grant、幂等与治理锁、持久 trust_policies/installed_packs 以及 Stage/Enable；内部 admit 回调不是默认放行或生产授权实现。

### Pack 报告内部幂等命令

RecordPackValidationCommand 已正式登记为 Internal，使用公共命令意图摘要，绑定报告/治理 Payload 与当前租户，并通过 executeCommand 原子记录回执、报告、审计与 Outbox。重放重新准入，同键异参拒绝。仍缺公开异步 ValidatePack、生产部署用途/Grant/治理锁、跨进程验证任务恢复及完整 Stage/Enable。

### Pack 记录用途与当前 Grant 装配

recordPackValidation 已装配专用 abh.pack.manage、本组织 Human/Service、无 Workspace、当前身份与组织 Grant/fence，重放重新验证。尚缺真实部署管理员 IdP/MFA、持久 Trust Policy 版本锁/撤回/保留治理实现、异步 ValidatePack 与 Stage/Enable；测试的治理检查仍为显式 Fixture。

### 持久 Pack 治理快照与版本锁

新增不可变 extension.trust_policies、PackTrustPolicyOwner 及数据库治理源，最高版本/完整摘要校验，连续版本 CAS，历史身份保留，publish/match 共用事务锁，记录阶段实际拒绝策略改变后的旧候选。尚缺正式签名 TrustPolicy 契约、管理发布 Command/Grant/审计/幂等和真实部署认证，快照为内部 JSON；Stage/Enable 未完成。

### 持久治理签名门禁

新增独立管理公钥 Cosign 签名封装（组织/有效期/完整快照），publish 仅接受真实验签候选并保存证明；旧无签名或已过期版本不能作为当前策略。尚缺正式公共策略 Schema、管理根撤回、发布 Command/Grant/审计/幂等与发行工具，当前签名协议为内部 TypeScript 合同。

### 正式治理策略合同

已生成六类部署/证明/治理/签名文档 Schema 与类型，并接入验签、持久发布/读取及静态部署检查。此前缺少公共治理 Schema 的缺口已补。仍缺管理根撤回、正式管理发布 Command/Grant/审计/幂等与 CLI，及 Stage/Enable/完整 V1。


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

后续队列接入已确认前置缺口：workflow.schema.json 的 JobEnvelope 目前只登记 Action、Operation、Decision 类型与目标，未登记巡检 Job。需要先补契约/目标关系与路由准入，再接 pg-boss 投递、当前管理 Context、Owner 幂等和确认；不能把长时间检查塞进 Inbox 的单个事务，或绕过 Durable Port 另建队列。

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

## 2026-09-10：终态 Run 恢复 Worker

`abh.runs.recover` 以内部命令接入正式协议和 `RecoverRunPayload`。恢复入口要求 Service 身份和 `abh.runtime.deliver` 用途，先声明 Run 目标 WorkLease，再在独立恢复 UoW 中重新检查当前 Grant、终态 Run 与 fencing token。事务内只取消 Pending/Ready/Running/Verifying 任务，逐个记录 `abh.task.cancelled`；仅当 Mission 的 `activeRunRef` 精确指向该 Run 时原子清理引用，并记录 `abh.run.recovered`。没有可恢复效果时不伪造事件。

`runRunRecoveryWorker` 按租户做有界分页扫描，候选必须已终态且仍有非终态任务或 stale ActiveRun。单候选的 PRECONDITION、版本漂移和资源缺失不阻断后续候选；身份源漂移、权限失败和基础设施失败仍向宿主传播。扫描、身份、回调均接受停机信号。公开包装器把租约声明、业务恢复与租约释放分成明确 UoW；业务命令幂等键固定原始授权意图，避免 fencing token 变化造成重试冲突。真实重放不重复写 Audit/Outbox。

真实 PG 集成测试覆盖孤儿任务取消、终态任务保留、Mission 清理、事件账本、同命令重放、非终态拒绝、第二个 worker 被现存租约阻止，以及 worker 扫描和停机闭环。Contracts 51 项生成物、Core 523 项测试（517 通过、6 项外部 Cosign 跳过）、728 个文档链接、构建和 API 报告均通过。Run 编排主要缺口已关闭；Pi Agent 完整恢复/CTK、生产 Gateway 装配、学习与独立评测闭环仍待实现。当前按模块覆盖约 96%，不能据此宣称生产装配完成。验证见 [Run 恢复验证](verification-2026-09-10-run-recovery.json)。

## 2026-09-10：Pi Agent 受治理 continue

`@abh/adapter-pi` 新增 `continue` 公共入口，并把 invoke 与 continue 收敛到同一 Pi Agent、Model Gateway、Tool Gateway、预算、事件和取消路径。可安装 `checkpointSink`；只有 Assistant Tool Call 已产生 Tool Result 的等待点保存恢复点，内容包括最小 Transcript、已查回 Tool Receipt Refs、事件水位、Token 预算、Turn 数和逐 Binding 工具计数。中途输出完成点不伪造可恢复状态。

`continue` 要求独立的 checkpoint Artifact Ref 与 resume permit Ref。显式 `checkpointGateway` 读取受治理恢复点，显式 `resumeAdmission` 复验固定 Pi/Definition/Context digest、当前授权、剩余预算、Transcript 终点和未查回 Receipt；任何缺失、拒绝或加载失败统一返回 `INVOCATION_RESUME_UNSAFE`，不把私有错误正文泄漏给调用方。通过检查后调用 Pi 原生 `continue()`，不重放已观察工具。

恢复安全矩阵验证：真实 Tool Loop 生成 checkpoint 且终点是 Tool Result；恢复后模型调用继续、工具不重放；Receipt Ref 进入 checkpoint 并由 admission 核验；缺少恢复网关、checkpoint 加载失败、permit 拒绝和合同绑定缺失全部 fail closed；未绑定工具在真实 Tool Gateway 执行前阻断；Turn 耗尽仍带未解 Tool Call 时标为 `NoProgress` 而非 Completed。包类型检查、10/10 测试和构建通过；Contracts 与文档链接复核通过。本批未重跑全量 Core，生产 Artifact Checkpoint Owner、完整升级矩阵和 Gateway 装配仍未完成。见 [Pi 恢复验证](verification-2026-09-10-pi-resume.json)。

## 2026-09-10：持久治理 Agent Checkpoint

Core 新增受控 `@abh/core/agent` 导出和 `AgentCheckpointOwner`，不引入对 Pi 的依赖，使用结构兼容的最小恢复点协议。检查点和 Resume Permit 都是 Inline Artifact：前者以 Invocation 拥有，绑定 runtime/version、definition、context digest、事件水位、预算、Turn、Transcript、工具计数和已查回 Receipt 来源；后者同样以 Invocation 拥有，并把 checkpoint Artifact 作为唯一 source。两个文档都是 canonical JSON，检查点内容单独计算 SHA-256，permit 保存该摘要。

写入路径进入正式 `abh.artifacts.store-inline` 命令、幂等回执、Audit/Outbox 和 Staged→Available 原子流；外部治理回调必须在写入前复核 fence、当前准入和引用。读取路径先对 permit/checkpoint 取共享行锁，再验证 Available、租户/用途可见性、Artifact 字节摘要、canonical 格式、checkpoint 完整摘要、Invocation/Definition/Runtime/Context/授权 Context 绑定、permit 期限、checkpoint source 与 Receipt 集合一致，最后交独立 Resume admission。未解 Receipt、过期 permit、错租户、错引用、错绑定和字节篡改全部拒绝。

真实 PostgreSQL 集成测试覆盖持久化事件、匹配 permit 读取、错授权 Context/checkpoint/Invocation/Definition/digest、Inline 字节篡改、过期 permit、未解 Receipt 与租户隔离。本批关闭持久 Checkpoint Owner 主路径；宿主仍需用轻量结构桥把 Core 结果接入 `checkpointGateway`/`resumeAdmission`，生产 Model/Tool Gateway、完整升级矩阵和学习评测闭环仍待实现。按功能模块覆盖仍约 96%，但不代表生产装配验收完成。

## 2026-09-10：Tool Binding 原子 Call Limit

`ToolGatewayOwner.bind` 现在固定 Invocation/Tool Capability 引用类型，并把 `callLimit` 限制为 1—10000 的安全整数。`invoke` 读取时对 Binding 行取 `FOR UPDATE` 锁，验证租户、持久记录与行状态一致、payload Binding 与公共命令 target 精确一致、Binding 仍为 Active 且未过 deadline。通过后统计同一 Binding 的全部非重放调用，超过 `callLimit` 统一 `LIMIT_EXCEEDED`；同 callKey 重放仍按参数摘要回读原 Call，不消耗新额度。

deadline 已过期时在当前事务中 CAS 到 `Expired` 后拒绝；因为公共工具命令失败整体回滚，这次过期标记不会在拒绝命令中留下部分事实。真正的后台到期归档仍需独立 Worker。外部能力执行、费用预留、输出 Schema 校验和 Workspace/Scope 重验仍未实现；当前 Completed Result 仍是网关测试桩，不得当作生产 Connector 证据。

真实 PostgreSQL 回归覆盖 Binding 元数据校验、target/payload 错配、两次调用后第三次拒绝、同 key 重放不增计数、三请求并发争两个额度只有两次持久调用，以及过期 Binding 拒绝。该批收敛了 Tool Gateway 的调用资格主路径，但不关闭实际外部执行缺口。

## 2026-09-10：Model Call 生命周期与固定 Route 准入

新增内部 `ModelGatewayOwner` 和 `callModel` 装配。Route 仍是发布/管理侧冻结事实，runtime 只能按精确版本读取，不能改写；Call 由宿主签发 `abh.model-call` id。准备阶段校验租户、Route 版本、当前用途、allowedModels、输入 Manifest 类型和内容摘要，并把请求上限与 Route 上限取交。同 callId 相同请求幂等回读，不同模型/Manifest/摘要/Route 冲突。

执行按 `Prepared→InFlight→Completed/Failed` 单向 CAS，记录版本与行版本同步推进。Adapter 回调收到冻结 Route、选定模型、caller、Manifest 引用、摘要和费用上限；成功只接受非负 Token usage。Adapter 抛错或出站结果未知时不伪造 Failed/Completed，Call 保持 InFlight 并返回 Unknown，等待后续独立对账。显式 `fail` 只允许已确认进入 InFlight 且要终止的调用。本批不含供应商传输、Secret、Ledger 预留/结算、原始响应 Artifact、输出 Schema 校验、流式事件和 fallback。

真实 PostgreSQL 回归覆盖 Route 版本/模型/预算/用途错配、同 callId 幂等与异参冲突、冻结 Route 请求透传、成功完成一次性、Adapter 歧义保持 InFlight、显式 Failed 单向转换和租户隔离。readiness 同时确认 runtime 不能更新 `core.model_routes`，维持 Route 冻结边界。

## 2026-09-10：Model Call 接入真实资源预算

`core.model_call_reservations` 现在把宿主 Call 与 Resource Ledger Reservation 持久绑定。`prepare` 在同一事务内通过 `LedgerOwner.reserveAll` 预留预算：Ledger 不存在、版本过期、关闭或余额不足都会整体回滚，Adapter 不会收到请求；同一 callId replay 回读原关联，不重复预留，修改 Ledger 或金额则幂等冲突。

成功结果按实际 input/output token 合计 `consume` cumulative 预算；capacity 预算不伪造消费，改用 `Completed` evidence 返还。显式 `fail` 只有在调用方提供 `ConfirmedNoEffect` evidence 时才 release；Adapter 抛错、超时或结果未知继续保留 reservation 和 `InFlight`，等待独立对账。完成/失败路径先取得 Ledger 责任锁，再做 Model 聚合终态 CAS，避免锁序倒置。

真实 PostgreSQL 覆盖预留创建、幂等 replay、预算冲突、耗尽零调用、成功消费、capacity 返还、显式安全释放和歧义保留；readiness、doctor、Core 全量、Contracts、Docs 和全仓 build 通过。供应商传输、Secret、原始响应 Artifact、输出 Schema、TTL 恢复、流式和 fallback 仍未实现。验证见 [Model Call 预算记录](verification-2026-09-10-model-call-budget.json)。

## 2026-09-10：Model Call 未知结果证据对账

新增 `reconcile` 关闭 InFlight 歧义后的收敛路径。`Completed` 对账必须携带非负实际 usage，先按 cumulative 消费或按 capacity 返还，再原子推进 Completed；`Failed` 对账必须提供 `abh.artifact` 形式的 no-effect evidence，先 release 再 CAS 到 Failed。两条路径都保持 Ledger 责任锁先于 Model 终态锁。

对账显式拒绝 TTL-only、负数 usage 和非 Artifact 证据；没有证据的预算化 Call 不允许直接 `fail`，因此不会出现终态 Failed 但 reservation 仍无法收敛的状态。Adapter 超时/异常仍然只返回 Unknown 并保留 InFlight，等待这种显式证据对账或后续人工调查。

真实 PostgreSQL 测试覆盖歧义成功对账、usage/evidence 校验、TTL-only 拒绝、确认无效果释放、capacity 返还和锁序；Core 全量 537 项中 531 通过、6 项外部 Cosign 跳过、0 失败。自动轮询、生产回调恢复、原始响应 Artifact、输出 Schema 和流式仍待实现。验证见 [Model Call 对账记录](verification-2026-09-10-model-call-reconciliation.json)。

## 2026-09-10：Model Call 原始响应与输出校验

Adapter 成功结果现在必须返回 `rawResponse`，并由 `callModel` 要求显式 `outputValidator`；Validator 拒绝时 Call 保持在 InFlight，预算继续持有，不存储响应、不记录 usage、不推进 Completed。通过校验后，Gateway 在与预算结算和 Call 终态相同的事务中用 `InlineArtifactOwner` 保存 bounded raw transport JSON，路由的 dataClass/region 决定存储分类，Artifact owner 精确绑定 Model Call，source 绑定输入 Manifest 和 Route。

`ModelCallRecord.rawResponseRef` 进入正式 Contracts，完成后只有通过完整性验证的 Available Artifact 才能回读。超过 64 KiB 的 raw response 会整体回滚，保持 Unknown/InFlight 和预算持有；capacity 成功仍使用 Completed evidence 返还预留并同时保存响应。该机制要求宿主安装具体 JSON Schema/契约 Validator，Adapter 不能自我认证输出。

真实 PostgreSQL 覆盖成功响应读取、校验拒绝、 oversized 回滚、capacity 返还和原子性；Core 全量 539 项中 533 通过、6 项外部 Cosign 跳过、0 失败，Contracts 51 项和 Core API 报告一致。实际供应商传输、Secret 隔离、大型 staged Object Store、流式和生产 Adapter 装配仍待实现。验证见 [Model Response 证据记录](verification-2026-09-10-model-response-evidence.json)。

## 2026-09-10：Tool Call 真实执行生命周期

Tool Gateway 不再把 `invokeTool` 直接伪造为 Completed。命令事务先完成授权、Binding、deadline、callLimit 和幂等检查，并持久化 Pending ToolCall；Adapter 只在该事务提交后收到冻结 Binding、callKey、arguments 和 targetRefs。Adapter 显式 `Failed` 且携带 Digest 时才原子 CAS 到 Failed；显式成功必须先通过宿主安装的 `outputValidator`，再在与 ToolCall 终态相同的事务中通过 `InlineArtifactOwner` 保存 bounded JSON 结果。

Artifact owner 精确绑定终态 ToolCall，source 绑定 Binding、Capability 和命令声明的 targetRefs，并通过字节长度、UTF-8、JSON、digest 和 Available 状态校验。Adapter 抛错、超时、返回未知形态、输出校验拒绝或 Artifact 超限时，ToolCall 保持 Pending，不伪造 Failed/Completed，也不允许同一 callKey 的后续命令再次外呼。HTTP 安装必须显式提供 Tool Adapter、Validator 和存储分类；没有生产实现时不能回退测试桩。

真实 PostgreSQL 回归覆盖成功 Artifact 内容与 digest、显式 Failed 与终态回放、Pending 歧义不重复外呼、输出校验失败保持 Pending、Pending 计入 callLimit、并发额度、target/payload 冲突、同 command 幂等和过期 Binding 拒绝。Core 全量 539 项中 533 通过、6 项外部 Cosign 跳过、0 失败，Contracts 51 项、Core API 4 个入口、Docs 733 个链接和全仓 build 均通过。生产远端 Adapter、Pending 独立对账、失败证据 Artifact 和费用预留仍待实现。验证见 [Tool Call 执行证据](verification-2026-09-10-tool-call-execution.json)。

## 2026-09-10：Tool Call Pending 对账与失败证据

新增内部 `reconcileToolCall` 收敛 Adapter 歧义后留下的 Pending Call。Completed 对账沿用同一显式 outputValidator、bounded Inline Artifact 和 Pending→Completed CAS；Failed 对账必须提供真实 Available JSON Artifact，而不是只给错误摘要。证据 owner 必须是 Binding 的 Invocation，source 必须精确绑定当前 ToolCall，正文必须严格等于 `ToolCallNoEffect` 规范文档并包含终态 Call 引用和 errorDigest。Artifact 先加共享锁再读取，CAS 到 Failed 与证据验证在同一事务内完成。

`ToolCallRecord` 正式增加 `errorDigest` 和 `failureEvidenceRef`。显式 Adapter Failed 现在持久保存错误摘要，重放不再丢失；对账 Failed 额外绑定无效果证据 Artifact。Pending 对账不增加 callLimit，也不会调用原始 Adapter；Binding 即使在出站后 Expired/Revoked，也允许 Owner 用当前授权收敛已受理结果，新调用仍被拒绝。

真实 PostgreSQL 回归覆盖 Pending Completed 对账与 Artifact 引用、缺少证据拒绝、证据正文/owner/source 绑定、Failed CAS、错误摘要和证据引用持久化。Core 全量 539 项中 533 通过、6 项外部 Cosign 跳过、0 失败，Contracts 51 项一致。自动 Pending 扫描、公共 InspectToolCall 入口、费用预留/结算和生产远端 Adapter 仍待实现。验证见 [Tool Call 对账证据](verification-2026-09-10-tool-call-reconciliation.json)。

## 2026-09-10：InspectToolCall 公共观察入口

新增公共 `abh.tools.get` 查询和 `ToolCallInspection` 契约，补上 V1 Tool Gateway 的 `InspectToolCall` 观察路径。查询按 ToolCall id 返回当前 record、trackingRef、错误摘要和 `cost:{metered:false}` 的明确计费状态；trackingRef 当前就是 ToolCall 自身，等待未来 Operation/费用证据接管。响应不内联结果正文，消费方继续通过 `resultArtifactRef` 做授权读取，避免绕过 Artifact 保留策略和来源授权。

HTTP 查询要求宿主安装 `inspectionGrants` 解析器，没有缺省授权。事务内先锁当前 organization/Grant fences，再通过 Control 校验 `abh.tools.read` 对 ToolCall 的当前授权；同一命令仍要求 mission 用途。Core HTTP 已装配查询，typed client 暴露 `tools.get`。

真实 PostgreSQL 回归覆盖 Failed Call 检查、trackingRef/errorDigest 返回、空授权拒绝；Core 全量 539 项中 533 通过、6 项外部 Cosign 跳过、0 失败，Contracts 51 项一致。计费、外部 tracking/Operation 绑定、Pending 自动扫描和生产远端 Adapter 仍待实现。验证见 [Tool Call 观察证据](verification-2026-09-10-tool-call-inspection.json)。

## 2026-09-10：付费 Tool 预留与实际用量结算

`InvokeToolPayload` 新增显式 `budget`，必须指定 Ledger、预留上限和有效期；没有隐藏宿主默认预算。`ToolGatewayOwner.prepare` 在同一个租户事务里锁定 Binding、执行原子 callLimit、创建 Pending ToolCall，并通过 Resource Ledger `reserveAll` 创建 Held Reservation 和 `core.tool_call_reservations` 链接。任何一步失败都会整体回滚，Pending 重放核对 Ledger id 与金额，不会重复预留或重复消耗 callLimit。

出站前单独事务确认 Reservation 仍为 Held 且未过期；输入 canonical JSON 超过 64 KiB 在准备期拒绝。受信 Tool Adapter 的 Completed 结果现在可携带实际 `usage`。成功 Artifact、实际用量结算和 Pending→Completed CAS 在同一事务提交；累计量模式只允许实际用量不大于预留上限并按实际值 `consume`，容量模式在成功后安全 `release`。Adapter 异常、输出验证失败和结果未知时 Reservation 保持 Held；显式 Adapter Failed 也保留费用责任。Pending Failed 对账仍必须提供真实无效果 Artifact，验证通过后才在同一事务 `release`。

`ToolCallRecord` 记录 `costReservationRef`；`abh.tools.get` 的 cost 从固定 unmetered 改为返回 Reservation 状态和引用，免费调用继续明确返回 `metered:false`。新增 `core.tool_call_reservations` 迁移、readiness 清单、契约/API 生成和真实 PostgreSQL 回归，覆盖成功实际用量消费、Pending 预留保持、显式 Failed 保留、无效果 Pending 释放和 InspectToolCall 状态。生产出站隔离、远端 Tool Adapter、外部 Operation/tracking、Pending 自动扫描和 256 KiB Object Store 输出 staging 仍待实现。验证见 [Tool 费用预留证据](verification-2026-09-10-tool-cost-reservation.json)。

## 2026-09-11：Tool Pending 租约恢复 Worker

新增租户内 `runToolRecoveryWorker` 和单次 `recoverPendingToolCall`。Worker 按稳定 UUID 游标扫描超时 Pending ToolCall，每一项都必须由宿主显式安装 `ToolRecoveryPort` 查回；Core 不猜测外部结果，也不把时间流逝当证据。扫描要求 `abh.mission.manage` 用途，单次恢复要求 Service 身份、当前 `abh.tools.invoke` Grant、organization/Grant fences 和 Pending 状态。

恢复前通过 Work Lease 认领 ToolCall，最多 30 秒，防止同租户 Worker 并发查回；Recovery 回调受同一 Lease 有效期和取消信号约束。返回 Completed 时继续使用原 `outputValidator`、结果存储、Artifact owner/source 校验、付费实际用量结算和 Pending→终态 CAS；返回 Failed 时保存错误摘要但付费 Reservation 保持 Held。Lease 已过期、状态竞争或授权变化会导致最终 CAS 事务整体回滚。查询返回 `undefined` 只保留 Pending，不会释放费用。终态后 Worker 释放 Lease，进程中断也只留下自然到期租约。

真实 PostgreSQL 回归覆盖三个 Pending 候选：远端查回成功按实际用量消费、远端显式 Failed 保留费用责任、查回未知保持 Pending。断言 Recovery Adapter 恰好查回三次、成功 Artifact 推进版本、三种 Lease 均释放、Granted Worker 能恢复而默认无权限路径被既有 Control 门禁拒绝。`createTenantRuntimeLoops` 现在可选安装 `toolRecovery`，统一绑定租户 Context Source 并在创建 loop 集时快照配置；运行中替换 Context、Recovery Port 或年龄阈值不会影响当前 Worker。该测试通过 Runtime loop 完成同样的真实恢复闭环，生产 Tenant Runtime 不再需要单独复制托管逻辑。

远端 Transport/隔离和外部 Operation/tracking 仍待实现。验证见 [Tool Pending 恢复证据](verification-2026-09-11-tool-pending-recovery.json)。

## 2026-09-11：Tool 输出 Object Store Staging

新增 `data.object_artifacts` 持久绑定表和第 62 批 Expand 迁移：`data.artifacts.inline_body` 允许空值后，64 KiB 以内的 Inline Artifact 语义完全不变；65 KiB 至 256 KiB 的 Tool JSON 结果可由宿主安装的 `ObjectStorePort` 保存。数据库只保存 Artifact 元数据、StoredObjectRef、digest、size 和 mediaType，不内联正文。新表强制租户 RLS、runtime 最小 DML 权限，并纳入 readiness manifest 精确核对。

跨存储流程固定为 T1 持久 Staged Artifact → 事务外 `put` → 事务外 `read` 回收字节并重算 SHA-256 → T2 校验 Completed 描述符后原子绑定/发布 Available Artifact → Tool 终态、费用结算和 Pending CAS。输入/输出契约校验、owner/source/region/retention 绑定在最终事务复核；Tracked、Rejected、Cancelled、读回缺失或 Hash 漂移都不会把 Tool 伪造成 Completed，费用保持 Held。64 KiB 以内继续走原有 Inline 事务路径。

代理读取在读取前的事务中执行 Artifact 租户/用途/版本/状态授权，然后只通过宿主 ObjectStorePort 取字节，不生成直连 URL；读取后重新执行同一授权和元数据复核。全量读取验证 SHA-256 与长度；范围读取强制端点边界、返回长度和响应 range 与请求一致，但只验证对象描述符和字节数，不把局部 range 误报为整对象 Hash。并发作废/版本漂移会被读取后复核拒绝。

真实 PostgreSQL 覆盖 70 KiB Tool 输出的显式 ObjectStorePort 往返、Readback Hash、StoredObject 绑定、实际用量消费、owner/source 校验和 Inline 读取隔离；Artifact Owner 单独覆盖大小边界、Staged 不泄露正文、错误描述符不发布、全量/range 代理读取、读取后作废复核和跨租户隔离。Core 全量 541 项中 535 通过、6 项外部 Cosign 跳过、0 失败。生产云/远端 ObjectStore Adapter 仍待实现；通用 Staged 孤儿清扫中的 Tracked 路径见下批实现，Pending/未知 Completed 仍待 broader recovery。验证见 [Tool Object Staging 证据](verification-2026-09-11-tool-object-staging.json)。

## 2026-09-11：Tracked Object Staging 清扫

新增第 63 批 Expand 迁移和 `data.object_staging_attempts`：表只保存 staging/attempt 元数据，不保存正文；强制租户 RLS、runtime 最小 DML 权限，并纳入 readiness manifest。`put` 返回 `Tracked` 时，Core 持久化契约中的 Artifact tracking ref；绝不把它伪装成 `StoredObjectRef`。宿主必须通过显式 `resolveTracking` 回调查回对象引用，Core 复核当前 delete Grant、租约和 fence 后才把它提升为 `Ready`。

Completed put 会先精确校验 digest/size/mediaType，再把对象引用持久化为 `Recorded`；后续 readback、Hash 或 publish 失败不会留下不可寻址孤儿。清扫 Worker 处理到期 `Recorded`、`Ready`/`CleanupQueued`。T1 持久化稳定 deletion-proof id、delete idempotency key 和 `CleanupQueued`；事务外调用 `ObjectStorePort.delete`；只有完成回执精确匹配已解析对象引用时，T2 才在同一事务中墓碑化 Staged Artifact、记录 `CleanupCompleted` 并复核租约。未解析 `Tracked`、delete 不确定和权限变化都会保留可重试元数据，不会伪造物理删除。Runtime loop 启动前快照 Cleanup 配置。

真实 PostgreSQL 覆盖 tracking ref 持久化、显式对象解析、Completed 后 readback 取消、delete 请求、授权、租约释放、外部回执精确复核、Artifact 墓碑 CAS、attempt 终态和 Worker 自动清扫。Core 全量 542 项中 536 通过、6 项外部 Cosign 跳过、0 失败。生产远端 tracking resolution/ObjectStore Adapter、从未收到 tracking ref 的 Pending、进程在外部返回与数据库记录之间崩溃的极窄窗口，以及二进制 media staging 仍待实现。验证见 [Tracked Object Staging 清扫证据](verification-2026-09-11-object-staging-cleanup.json)。

## 2026-09-11：有界二进制 Object Staging

`storeObjectArtifact` 现在按内容类型分流：字符串继续走原有 text/JSON staging 与 Tool JSON 输出路径；`Uint8Array` 进入新的 `stageBinary`。二进制内容只允许 65,536 字节以上、262,144 字节以内，MIME 只允许 PNG、JPEG、WebP 和 GIF。Core 会把输入复制到私有 `Uint8Array`，嗅探 magic bytes，并在声明 MIME 与嗅探结果不一致时拒绝；后续仍复用既有 T1 staging → 外部 put → readback hash/size → T2 publish 协议。数据库继续只保存 Artifact 元数据，`inline_body` 保持空。

真实 PostgreSQL 覆盖 70,000 字节 PNG 的完整 put/readback/publish/read、`inline_body` 空载体、attempt `Published` 状态，以及 64 KiB、超过 256 KiB、伪造图片、声明 PNG/嗅探结果不符和声明 JPEG/实际 PNG 等拒绝路径。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败。生产云/远端 ObjectStore Adapter、无 tracking ref 的 Pending attempt 和外部 Completed 返回与数据库记录之间的极窄崩溃窗口仍待后续工作。验证见 [Binary Object Staging 证据](verification-2026-09-11-binary-object-staging.json)。

## 2026-09-11：Mission Summary Projection 单调恢复

`read.projections` 通过第 65 批 Expand 迁移补充 `purpose_names`、`source_version_vector` 和 `built_at`。新增 `ProjectionOwner` 在读取时绑定精确 projection type、当前用途和 Workspace，不再允许同 subject 的其他投影或无权用途命中缓存。MissionSummary 重建先锁定并复核 Mission 源事实，再统计 pending trigger 和未解决 blocker，把 missionVersion、goalRevision、stopEpoch 与两类计数组成 source vector；data、watermark、builtAt 和可用动作提示在同一事务写入。

相同 source vector 重放不推进 Projection 版本；变化向量原子切换并递增版本；旧向量在 missionVersion、goalRevision、stopEpoch、trigger 或 blocker 任一维度更高时都不会回退，而是返回当前投影。读取时按当前用途重新过滤，撤权后的缓存命中不会越过读权。真实 PostgreSQL 覆盖首次构建、同源重放、状态推进、旧事件保持、版本列变化、错误用途 404/拒绝，以及 pg-boss 投递的有界可见性等待。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败；Contracts 51 项、Core API 4 个入口、Docs 740 个链接和全工作区构建通过。

目前只实现 MissionSummary 和同步 source-backed refresh。事件驱动 Outbox 消费、RefreshProjection Job、SSE reset、consumer gap、ListProjection/fieldSet、其余四类投影和实际 Workbench 仍待实现。验证见 [Mission Projection 恢复证据](verification-2026-09-11-mission-projection-recovery.json)。

## 2026-09-11：Mission Summary 事件驱动失效

Mission 生命周期 Owner 现在从真实 Command identity 写入已注册状态转换 Outbox 事件：Activate、Pause、Cancel、Resume、Resolve、Block、Complete 分别生成对应 `abh.mission.*` 事实，不再使用合成命令兜底。`MissionSummaryEventConsumer` 复用 `InboxOwner` 协议：Service 身份必须具备 `abh.runtime.deliver` 用途和当前 `abh.runtime.consume-event` Grant，语义去重锁、fence、身份 epoch 和事件摘要都在业务效果前复核。

新增 `read.projection_consumer_watermarks` 以 `(created_at,id)` 保存 durable 游标，并记录 consumer、projection、Workspace、用途和最小租户列。`pendingMissionEvents` 在 `abh.runtime.drain` 当前授权下扫描真实 `data.outbox`，用 `(consumer_id,event_id)` 反连接 `runtime.inbox`，按游标单调返回待处理 Mission 事件。Consumer 的 `handle` 在同一事务中重新检查 `abh.projections.build-mission-summary`、锁定并重建 MissionSummary、更新 watermark，随后才提交 Inbox 事实；任何授权、源、投影或 watermark 失败都会原子回滚。

真实 PostgreSQL 端到端覆盖 `pauseMission` 发射事件、发现并消费一次、Inbox 建立去重凭证、watermark 到达事件游标、Projection 进入 Paused、撤权后重放拒绝且投影不变，以及错误用途无法读取投影。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败；Contracts 51 项、Contracts API 9 个入口、Docs 742 个链接和全工作区构建通过。RefreshProjection Job、SSE reset、跨页 gap 回补、ListProjection/fieldSet 和其余投影仍待实现。验证见 [Mission Projection 事件消费证据](verification-2026-09-11-mission-projection-event-consumer.json)。

## 2026-09-11：Projection 字段裁剪、列表分页与 Mission 结果透出

`GetProjection` 新增服务端 `fieldSet`：只接受 MissionSummary 注册字段白名单，未知字段和重复字段都会拒绝；返回 Envelope 在 Owner 读取和权限校验之后裁剪，前端不会收到未请求的敏感字段。查询仍只接受 `abh.projection.mission-summary`，其他 projection type 保持安全 `RESOURCE_NOT_FOUND`。

Mission close 现在把 `resultRefs` 持久化到 `MissionRecord`，MissionSummary 在源重建时透出 `businessStageRef` 和 `resultRefs`。两者都进入固定 fieldSet 白名单，不会绕过读取授权或动态字段表达式。

新增公共 `abh.projections.list` 和 `ProjectionListResult`。列表固定按 `(updated_at,id)` 降序 keyset 分页，默认 25、上限 100；`missionStatus` 与 `domainType` 只使用注册 filter，不支持动态字段或 SQL 表达式。每一行都在当前事务里重新检查 `abh.projections.read`，拒绝行只被安全跳过，不泄露 subject id 或数量。扫描会越过拒绝行继续取页，避免权限过滤造成漏页。continuation cursor 是 `pc1` AES-256-GCM 加密令牌，绑定 actor、organization、Workspace、purpose、epoch、projection type 和全部 filter，跨用户、改过滤条件、篡改或过期都会拒绝。数据库游标内部保留 PostgreSQL 微秒精度，公开契约仍使用合法 RFC 3339 时间。

真实 PostgreSQL 覆盖 fieldSet 裁剪、未知/重复字段拒绝、错误 type 拒绝、两页 keyset 分页、状态过滤、不支持投影、Completed Mission result 持久化与投影透出、codec round-trip、filter 变更拒绝以及 tenant/purpose 读取。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败；Contracts 51 项、Contracts API 9 个入口、Docs 743 个链接和全工作区构建通过。RefreshProjection Job、SSE reset、订阅游标和其余四类投影仍待实现。验证见 [Projection Query 证据](verification-2026-09-11-projection-query.json)。

## 2026-09-11：RefreshProjection 异步请求与消费水位

`abh.projections.refresh-mission-summary` 现在是正式 V1 命令：HTTP 层返回 `202` 和 `ProjectionRefreshReceipt`。请求在事务内重新检查 `abh.projections.request-mission-summary` 与 `abh.mission.manage`，校验 projection type、当前 Mission 版本和用途；同 idempotency key 回读原回执，旧版本返回 `VERSION_CONFLICT`，未注册投影返回 `SCHEMA_UNSUPPORTED`。接受请求只追加 `abh.mission.projection-refresh-requested`，不同步重建，并按聚合分配 `eventOrdinal`，避免同版本 Outbox 唯一约束冲突。

MissionSummary consumer 的发现范围纳入刷新事件。消费时先复核 `abh.runtime.consume-event`，再以当前 Mission 源事实执行 `abh.projections.build-mission-summary`；投影、Inbox、审计 Outbox 和水位仍在同一事务提交。消费水位改为基于 `event.created_at,event.id` 的单条 upsert，比较和写入都使用 PostgreSQL `timestamptz` 微秒值，不再经过 JS `Date`；并发同消费者写入有统一冲突目标，同毫秒事件不再造成插入唯一键冲突。新增安装式 `missionSummaryProjection` 循环：每次扫描都有界并重新验证 `abh.runtime.drain`，事件消费再次验证 `abh.runtime.consume-event` 与投影构建授权；空页按间隔等待，满页继续连续排水，运行时失败交给宿主监督。

真实 PostgreSQL 回归覆盖刷新提交、幂等回放、旧版本与不支持类型拒绝、安装 Worker 自动发现并消费刷新事件、重建后读取和水位推进。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败；Contracts 51 项、Contracts API 9 个入口、Docs 744 个链接和全工作区构建通过。SSE reset、订阅游标、consumer gap 回补和其余四类投影待实现。验证见 [Projection Refresh Job 证据](verification-2026-09-11-projection-refresh-job.json)。

## 2026-09-11：MissionSummary 订阅与 SSE 断线恢复

新增 `subscribeMissionSummaryChanges` 作为授权化投影变更源。连接不传 `Last-Event-ID` 时从当前已消费事件建立基线，只接收新提示；传零 UUID 时从起点追赶；传已知事件 ID 时按 PostgreSQL `(created_at,id)` 精确续读。提示只来自 projection consumer 提交后的 Inbox/Outbox 事实，不把业务 Outbox 误报为投影完成；每次扫描和逐条出流都重读当前 Mission、MissionSummary 投影和 `abh.projections.read` Grant，上下文到期、撤权或源不可见都会停止流。

Fastify SSE 路由现在读取 `Last-Event-ID`，为每条提示写入不透明 `id:` 游标，按 15 秒写心跳，并在 256 条未排空提示处断开慢客户端。`createCoreHttpApp` 增加 `projectionEvents` 显式安装；宿主只提供 Grant 解析和轮询间隔，用户身份仍由 IdentityIngress 产生，授权由投影源在每个轮询周期重新验证。

真实 PostgreSQL 回归覆盖空授权拒绝、零起点追赶、事件 ID/version/watermark、刷新事件续读和游标推进；传输层覆盖 Last-Event-ID 传递、SSE id/event 帧、真实 TCP socket 和慢流取消。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败，Fastify 13 项通过；Contracts 51 项、Contracts API 9 个入口、Docs 745 个链接和全工作区构建通过。通用 reset 提示、其余投影订阅、历史 gap 回补和生产指标待实现。验证见 [Projection Subscribe SSE 证据](verification-2026-09-11-projection-subscribe-sse.json)。

## 2026-09-11：SSE reset 与连接上限

`subscribeMissionSummaryChanges` 改为输出带 `kind` 的授权提示：正常提示为 `change`，游标畸形或不可解析、锚点不在该 Mission、当前授权不足、身份上下文失效或读侧投影不可见时输出固定 `reset` 后结束；请求已中止不会补发 reset。reset 不携带异常文本、subject、actor、SQL 或内部错误码，客户端只能重新 Query，不能盲续旧敏感事件。

Fastify SSE 将 reset 映射为 `projection_reset`，`data` 固定为 `{"reason":"reset"}`，不写入游标或对象信息。认证成功后、写 SSE 响应头前检查并发台账：同一 actor 最多 5 条，同一 organization 最多 50 条；超限返回合同定义的 `RATE_LIMITED` 429。连接关闭时释放两个计数，认证失败不占位，取消/关闭路径不泄漏台账。原 Last-Event-ID 恢复、15 秒心跳和 256 条慢客户端断开保持不变。

真实 PostgreSQL 回归覆盖空授权 reset、未知 UUID 游标 reset、正常 change 联合类型和历史/续读游标推进；传输层覆盖 reset 帧无对象信息、同一用户第 6 条连接 429、原有 SSE 恢复/慢流和完整 Fastify 套件。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败，Fastify 15 项通过；Contracts 51 项、Contracts API 9 个入口、Docs 746 个链接和全工作区构建通过。MissionSummary 历史 gap 主动回补、其余投影订阅、生产指标和工作台待实现。验证见 [Projection Reset 与连接上限证据](verification-2026-09-11-projection-reset-limits.json)。

## 2026-09-11：MissionSummary 历史 gap 回补

Projection consumer 现在具备历史缺口发现与修复路径。`historicalMissionEvents` 只扫描不高于当前 consumer 水位的 MissionSummary 合格 Outbox 事件，并要求该事件没有对应 Inbox；每次仍检查 `abh.runtime.deliver` 用途和当前 `abh.runtime.drain` Grant，按 `(created_at,id)` 最旧优先、单页最多 100 条。这样水位异常超前或历史处理遗漏时，普通水位扫描隐藏的旧事件会被显式发现，而不会把未消费事件误认为已完成。

安装式 MissionSummary Worker 在处理水位之后的新事件前先逐页回补历史 gap。每个 gap 仍通过既有 `consumeCommittedEvent`：advisory key 幂等、consumer 准入、事件摘要、当前 Grant/fence、投影重建、Inbox、审计 Outbox 和水位写入保持在同一事务内；旧 gap 的水位写入受单调保护，不会把全局水位倒拨。Worker 的 `onPage` 结果新增 `repaired`，宿主可以区分新事件处理和历史修复量。

真实 PostgreSQL 回归先把刷新事件水位安全地推进到待消费事件之前，验证普通 `pendingMissionEvents` 为空而历史扫描能发现该事件；随后安装 Worker 自动重建 Inbox、刷新投影并报告 `repaired=1`，修复后历史扫描为空。Core 全量 543 项中 537 通过、6 项外部 Cosign 跳过、0 失败，Fastify 15 项通过；Contracts 51 项、Contracts API 9 个入口、Docs 747 个链接和全工作区构建通过。其余投影订阅、生产投影指标和实际工作台待实现。验证见 [Projection Gap Recovery 证据](verification-2026-09-11-projection-gap-recovery.json)。

## 2026-09-11：MissionSummary projection doctor

新增 `inspectProjectionHealth` 和 `abh doctor projection --subject`。诊断使用只读 PostgreSQL 连接设置组织、Workspace、actor 和 `abh.mission.manage` 用途上下文，核对 Mission 源版本/目标版本/停止代次、MissionSummary 是否存在、consumer watermark、最新合格 Outbox 事件、lag 和未消费 gap。输出只包含健康事实与安全异步重建命令名，不返回投影 payload、SQL、驱动异常、连接串或凭据。

CLI 严格解析 organization、subject、可选 Workspace/actor 的 UUID、格式和 100—30000ms 超时；任何无效参数都使用固定零 UUID 占位并拒绝触达数据库，不回显调用方输入。`Passed` 绑定零错误且无 remediation；`PRECONDITION_FAILED` 绑定真实违规数；参数、权限、依赖超时和不可用保持可操作 remediation，但不伪造 Command receipt 或持久 evidence。

真实 PostgreSQL Run lifecycle 回归验证健康投影返回 `Passed`、`present=true`、`stale=false`、`gapCount=0` 和安全重建命令。Contracts 覆盖健康事实、CLI 回执所有权、成功/前置失败一致性、禁止虚构 evidence，以及健康字段越界拒绝。CLI 覆盖无效参数、凭据与标识符不外泄。其余投影订阅、生产投影指标和实际工作台待实现。验证见 [Projection Doctor 证据](verification-2026-09-11-projection-doctor.json)。

## 2026-09-11：MissionSummary 生产投影指标

新增固定标签的 `ProjectionMetrics` 出口，覆盖 `projection_lag`、`gap_count`、`rebuild_failure`、`sse_drop` 和 `query_redaction_count`。指标快照不使用 actor、subject、organization 或对象 ID 标签；SSE 丢弃只记录 `slow`、`reset`、`disconnected` 三种有界原因。`ProjectionMetricsCollector` 保存可导出的最新 gauges 和累计 counters，拒绝负数、非整数和越界值；导出器异常不会中断查询、消费或 SSE。

投影 worker 在当前 `abh.runtime.deliver` 用途和 `abh.runtime.drain` 授权下聚合租户内未消费 Mission 事件数量与最旧事件年龄，上报 gap 和 lag；每次消费失败单独计入 rebuild failure。MissionSummary `fieldSet` 成功裁剪计入 query redaction，非法 fieldSet 不伪造成功裁剪。Fastify SSE 在慢客户端断开、授权/游标 reset 和传输中断时分别上报；onPage 继续提供有界 `scanned/handled/repaired/lagMs/gapCount` 周期结果。

单元测试覆盖固定标签、计数/水位更新、非法值和导出器故障隔离。真实 PostgreSQL Run lifecycle 修复历史 gap 后上报 `gapCount=0`、`lagMs=0` 且无 rebuild failure；查询联测确认成功 fieldSet 只增加一次 redaction；Fastify 覆盖 reset 指标和原 SSE 语义。其余投影订阅和实际工作台待实现。验证见 [Projection Metrics 证据](verification-2026-09-11-projection-metrics.json)。

## 2026-09-11：ResponsibilityInbox projection 订阅

新增 `abh.projection.responsibility-inbox` Owner 和 `abh.projection-consumer.responsibility-inbox` durable consumer。每个 `DecisionRecord` 是独立 subject，避免同 Request 多席位被压缩成一个 assignee；投影只保存 request/kind/assignee、有界 impact summary、deadline、evidence refs、当前可响应动作和 source version vector，不泄露问题正文、风险明细或 Decision payload。Worker 监听 Decision 与 Responsibility Request 生命周期事件，在 pending 扫描前执行有界历史扫描，水位按 `(created_at,id)` 单调推进。

订阅只从已提交 Inbox 的 `resultRef` 建立 Decision 变更提示：无 `Last-Event-ID` 时建立当前基线，零 UUID 从起点追赶，已知事件 ID 按 PostgreSQL `(created_at,id)` 精确续读。每条提示在出流前复核 Decision 投影、Organization、当前用户和 `abh.projections.read` Grant；HTTP SSE `abh.decision` subject 与 Mission subject 共用连接上限、reset、慢客户端和 Last-Event-ID 语义。协议目录把 `abh.decisions.read` 授权扩展到 runtime deliver purpose，并把 `abh.projections.read` 目标扩展到 Decision review/runtime。

真实 PostgreSQL 覆盖 Pending/Approved 投影更新、错误用途与缺授权拒绝、worker pending 消费、水位推进、重放不改投影版本、投影删除后 source-backed 重建和授权订阅提示不携带业务 payload。Core 全量 546 项中 540 通过、6 项外部 Cosign 跳过、0 失败；Contracts 51 项、Contracts API 9 个入口和 Fastify 15 项通过。实际 Workbench 与生产投影订阅托管仍待实现。验证见 [ResponsibilityInbox Projection 证据](verification-2026-09-11-responsibility-inbox-projection.json)。

## 2026-09-11：ResponsibilityInbox Worker 租户运行装配

`createTenantRuntimeLoops` 新增显式可选 `responsibilityInboxProjection` 安装项。循环集合在启动前快照 Context Source、Grant refs、页大小、周期和回调；宿主在运行期间替换安装对象、Context Source、Grant 或调参不会影响已创建 loop。Context 经共享租户绑定器限制在同一 organization/Workspace/acting organization；Grant 深复制，`onPage` 保留安装对象接收者。新增 loop 与其他 Worker 一样进入统一 supervisor：一个 loop 失败会取消 peer，外层取消会传播给正在等待或扫描的投影 Worker。

结构测试确认该 Worker 是可选 loop、安装项在创建后被替换不生效、运行期间外层 AbortSignal 会取消等待中的身份解析。真实 PostgreSQL 联测通过 Runtime loop 一次性消费同一 Request 的三个创建/路由事件，建立 Decision 投影并回报 `scanned=3`、`handled=3`、`repaired=0`；后续 pending 扫描为空。配置对象仍必须由宿主显式提供，Runtime 不隐式创建 Service 身份或 Grant。

验证命令与证据见 [ResponsibilityInbox Runtime 证据](verification-2026-09-11-responsibility-inbox-runtime.json)。剩余范围是实际 Workbench，以及生产进程级服务发现、租户注册/撤销和 worker 生命周期托管。

## 2026-09-11：Business Workbench 基础参考路径

新增可选 `@abh/workbench` Next.js 包，落地第一条服务端渲染路径：Overview 汇总 Mission 与待审批；Inbox 展示责任待办；Decision 详情读取冻结影响、证据与当前版本，并在服务端确认后提交 Approved/Rejected；Mission 详情读取投影与时间线，支持 Pause/Resume。所有会话都经过显式 Workbench Identity Adapter；默认 `denyAllIdentityAdapter` 不发请求，宿主必须安装真实 IdP 映射。API URL 必须由宿主显式配置，凭据只留在服务端/BFF。

Decision 与 Mission mutation 使用受保护意图派生的稳定幂等键；输入先做有界服务端校验，失败只显示有界错误码。审批结果只在服务端返回或重取后展示，不进行乐观“已生效”更新。`@abh/core/client` 补充 `projections.get`，Core API 报告已同步。该批不是完整 Workbench：还没有 TanStack Query、SSE 订阅 UI、JSON Forms、ECharts、组织切换器、Action Detail、Settings、端到端浏览器验证、无障碍与性能实测；生产身份适配器仍必须由宿主显式提供。

Workbench 单测、类型检查和 Next.js 生产构建通过；Core 全量 547 项中 541 通过、6 项外部 Cosign 跳过、0 失败；Contracts 51 项、Contracts/Core API 13 个入口、Docs 752 个链接、全工作区类型检查和构建通过。验证与限制见 [Workbench Foundation 证据](verification-2026-09-11-workbench-foundation.json)。

## 2026-09-11：Business Workbench Action Detail

Workbench 新增授权筛选的 Action 列表和详情页。列表支持 Mission、生命周期、结果和 cursor 过滤，只请求 Strong 一致性；详情读取服务端裁剪后的 Action View，展示授权摘要、快照期限、可见 Operation 时间线和待确认引用。`Unknown` 明确显示“外部结果待确认”，不把它伪装成成功或失败，也不提供新的普通写入入口。

当服务端 Action View 当前开放 `abh.actions.cancel` 时，详情页提供必填理由的取消表单。客户端先做 UUID、版本和 1—2000 字理由校验；服务端仍通过 If-Match、当前 Grant 和业务准入最终裁决。取消理由纳入 SHA-256 派生的稳定幂等键，同一 Action 版本与理由重放不会创建新意图。页面只显示“取消请求已受理”，最终状态仍以重取结果或对账确认为准。补偿不自动生成，必须作为新的明确业务意图。

Workbench 4 项单测、类型检查和 Next.js 生产构建通过；Contracts 51 项、API 13 个入口、Docs 753 个链接、全工作区类型检查和构建通过。剩余限制包括 TanStack Query/SSE UI、JSON Forms、ECharts、组织切换、补偿提案、浏览器端到端/无障碍/性能实测、生产身份适配器装配和生产托管。验证见 [Workbench Action Detail 证据](verification-2026-09-11-workbench-action-detail.json)。

## 2026-09-11：Workbench TanStack Query 与 Mission SSE

Workbench 引入 TanStack Query，并把 Mission 详情投影改为客户端查询。查询 key 显式包含 subject、organization、workspace、purpose、当前 authorization digest、actor 和 fieldSet；BFF 响应禁用共享缓存。首屏仍由服务端强读取，客户端只负责已授权裁剪数据的刷新，不做乐观写入。

新增同源 `/api/events/:type/:id` BFF：浏览器只连接 Workbench，身份头由服务端 Identity Adapter 注入，Cookie 不转发上游；`Last-Event-ID` 有界续传，上游 reset 会移除本地 query 并提示重建基线。SSE 关闭或宿主禁用时，Mission 投影按配置周期执行授权轮询。当前实时失效覆盖 Mission Summary；Decision SSE BFF 已预留但 UI 尚未消费。

Workbench 5 项单测、类型检查和 Next.js 生产构建通过；新增两条 BFF Route。Contracts、API 报告、文档链接、全工作区类型检查和构建继续通过。剩余限制包括全页面实时化、JSON Forms、ECharts、组织切换、补偿提案、SSE 浏览器端到端/并发/恢复实测、无障碍与性能实测、生产身份适配器装配和生产托管。验证见 [Workbench Live Projection 证据](verification-2026-09-11-workbench-live-projection.json)。

## 2026-09-11：Workbench Decision 实时状态

Decision 详情新增同源 BFF 强查询与 TanStack Query 状态条。查询 key 隔离 Decision ID、organization、workspace、purpose、authorization digest 和 actor；SSE 订阅按单个 Decision subject 建立基线，`projection_changed` 只触发授权重查，`projection_reset` 清除本地缓存并提示重建基线。SSE 禁用或中断时按配置轮询。

当服务端状态或版本与首屏不同，状态条提示用户刷新后再确认；已有表单不自动提交、不改写版本，也不显示乐观“已生效”。服务端仍以 If-Match、当前 Grant 和 Decision Owner 准入最终裁决。整页待办不建立批量 SSE，避免组织级并发放大。

Workbench 6 项单测、类型检查和 Next.js 生产构建通过；Contracts 51 项、API 13 个入口、Docs 755 个链接、全工作区类型检查和构建通过。剩余限制包括整页实时化、JSON Forms、ECharts、组织切换、补偿提案、浏览器端到端/无障碍/性能实测、生产身份适配器装配和生产托管。验证见 [Workbench Decision Live Status 证据](verification-2026-09-11-workbench-decision-live-status.json)。

## 2026-09-11：Workbench 组织上下文与切换

Workbench Session 区分 `actingOrganizationId` 与 `resourceOrganizationId`，不再把两个组织语义压缩成单一字段。页首始终显示当前 acting/resource 组织；宿主适配器可提供可切换组织选项，Workbench 显示当前归属并用 Server Action 写入 HttpOnly、SameSite=Lax 的组织选择 Cookie。Cookie 只承载用户选择意图，不是身份或授权凭证；每次请求都会连同请求头交给宿主 Identity Adapter 重新解析并验证 acting/resource、Workspace、成员资格和用途。

选择项 key、两个组织 ID 和可选 Workspace 都先经过格式校验；非法 Workspace Cookie 会使整个选择失效，而不是被静默删除。Query key 同时包含 acting 与 resource organization，切换组织后不会命中旧租户缓存。默认 deny-all adapter 仍然不发送 API 请求；没有宿主显式实现时切换 UI 不可用。

Workbench 7 项单测、类型检查和 Next.js 生产构建通过；Contracts 51 项、API 13 个入口、Docs 756 个链接、全工作区类型检查和构建通过。剩余限制包括组织成员/用途/连接/自动化治理 UI、JSON Forms、ECharts、补偿提案、组织切换浏览器端到端/无障碍/性能实测、生产身份适配器装配和生产托管。验证见 [Workbench Organization Context 证据](verification-2026-09-11-workbench-organization-context.json)。

## 2026-09-11：Workbench 补偿提案与 JSON Forms

Action Detail 对 `Closed/PartiallySucceeded` 或 `Failed` Action 增加显式补偿路径。Workbench 不发明补偿语义：默认 `denyAllCompensationAdapter` 不开放任何模板；宿主适配器必须在每次服务端调用中核对当前 Action 可见性、状态、Action 定义归属和补偿授权，然后返回注册模板。模板固定 `actionType`、target/source 引用、Artifact 治理元数据、JSON Schema 和可选 UI Schema；服务端要求 source refs 精确包含当前 Action 引用。

用户输入用 JSON Forms 渲染，客户端显式使用 Ajv 2020；提交后 Workbench 服务端再编译同一 Schema 校验，按当前 Action 版本、模板 key、目标、来源、Artifact 元数据和输入派生稳定幂等键。命中模板和来源后，服务端调用公开高层 `actions.propose`，先保存 JSON Artifact 再创建 Action。Core 侧 Action 定义、completion policy、治理、Grant 和业务准入仍最终裁决。JSON Forms chunk 懒加载，Action 首包保持约 107 kB。

Workbench 8 项单测、类型检查和 Next.js 生产构建通过；Contracts 51 项、API 13 个入口、Docs 757 个链接、全工作区类型检查和构建通过。剩余限制是宿主需提供生产补偿模板与治理装配；完整责任表单、ECharts、Settings 治理查询/命令、浏览器端到端/无障碍/性能实测和生产托管仍未完成。验证见 [Workbench Compensation JSON Forms 证据](verification-2026-09-11-workbench-compensation-json-forms.json)。

## 2026-09-11：Workbench Settings 治理快照与命令

新增 `/settings` 服务端页面。Workbench 不推断成员、用途、连接或自动化语义：默认 `denyAllSettingsAdapter` 不返回快照，也不执行命令。宿主适配器在每次服务端调用中按当前 Session 授权，返回有界的非保密快照和已注册治理命令；`execute` 必须重新授权、按请求 ID 幂等，并自行接入 Core、Domain 治理和审计。

命令输入使用宿主声明的 JSON Schema，客户端提交 JSON，服务端用 Ajv 2020 重新校验后再交给适配器；需要确认的命令由浏览器明确确认，但界面只显示受理结果，不显示乐观生效。Settings 命令表单懒加载，适配器错误不透出内部细节。

Workbench 9 项单测、类型检查和 Next.js 生产构建通过。剩余限制是生产 Settings 查询/命令服务、Domain Pack 治理装配、浏览器端到端/无障碍/性能实测、完整责任表单、ECharts、生产身份适配器装配和生产托管。验证见 [Workbench Settings Governance 证据](verification-2026-09-11-workbench-settings-governance.json)。

## 2026-09-11：Workbench Mission ECharts 投影

Mission 详情不再把授权投影当作原始 JSON 展示。新增形状守卫只接受当前 Mission ID、正整数版本、有限计数和有效时间组成的摘要；通过后同时渲染语义表格与懒加载 ECharts SVG 条形图，展示待处理触发和阻塞计数。图表对读屏隐藏，数值、状态和订阅状态保留在语义文本中；数据形状不符时显示服务端降级提示，不绘制猜测值。

ECharts 只导入 Bar、Grid、Tooltip 和 SVG renderer，由客户端 chunk 懒加载，并在卸载时取消 ResizeObserver 和释放实例。Mission 页首包约 117 kB，ECharts 不进入首包。

Workbench 10 项单测、类型检查和 Next.js 生产构建通过。剩余限制是投影数据以外的业务图表、真实浏览器端到端/读屏/性能实测和生产治理装配。验证见 [Workbench Mission ECharts 证据](verification-2026-09-11-workbench-mission-echarts.json)。

## 2026-09-11：Decision 责任 JSON Forms 旅程

Decision 审批不再使用固定 HTML 表单。新增宿主可替换的 Decision Forms 适配器，默认合同适配器按 `allowedResponses` 注册批准/拒绝 JSON Forms，并覆盖公开 `SubmitDecisionPayload` 的全部用户可提供字段：理由、最多 100 个 Condition Ref 和可选 Reauth Proof。Schema 禁止额外字段，UUID 用显式 pattern 校验，需要确认的表单由浏览器明确确认，Core 仍做最终授权。

提交时服务端强读 Decision，复核 Pending 状态、If-Match 版本、Package Digest、允许响应、表单唯一性和宿主 Schema；客户端 JSON 由 Ajv 2020 再次校验，拒绝未知字段和越界数据。稳定幂等键现在绑定理由、Condition Refs 和 Reauth Proof，不只绑定原始理由。表单 chunk 懒加载，Decision 首包保持约 116 kB。

Workbench 12 项单测、类型检查和 Next.js 生产构建通过。剩余限制是生产 reviewer 资格/Domain 治理装配、真实 IdP/生产 API、读屏用户确认、INP/SSE 恢复和生产身份装配。验证见 [Decision JSON Forms 证据](verification-2026-09-11-workbench-decision-json-forms.json)。

## 2026-09-11：Workbench 浏览器旅程与 Core Query 修复

新增生产构建 Playwright 验收：受控 Fake ABH API 返回合同形状数据，E2E 构建只临时替换显式 Identity 安装文件并在退出时恢复生产 deny-all。真实 Chromium 覆盖 Overview → Mission 投影/ECharts → Decision 审批 →公开 Submit Decision 命令 →服务端强读 Approved 的完整旅程，并验证确认弹窗、语义表格、授权轮询和受理后的服务端状态。

同页运行 axe `wcag2a/wcag2aa/wcag22aa` 扫描，三页 0 violation；浏览器 PerformanceObserver 实测 LCP ≤ 2.5 秒且 CLS ≤ 0.1。Decision JSON Forms 和 Mission ECharts 继续懒加载，Decision/Mission 首包分别约 116/117 kB。该验收发现并修复公开客户端 `missions.get` 未携带必需 Query `id` 的真实缺陷，同型 `runs.get` 和 `tools.get` 一并修复。

剩余限制是真实 IdP/生产 API、读屏用户确认、移动/1280px 视觉矩阵、INP、SSE 恢复、双组织迟到响应和生产治理装配。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：Overview 授权轮询与实时待办

Overview 改为服务端授权基线加客户端授权轮询。服务端仍先通过 Workbench BFF 强读当前 Mission list 和 Pending Decision inbox；`LiveOverview` 只拿到初始授权结果和非凭据 Session 摘要，后续通过 `/api/overview/missions` 与 `/api/overview/inbox` 重新获取权威状态。两个 BFF 响应固定 `no-store`，错误只返回有界 ABH 错误码；浏览器不接收 API 凭据，也不产生乐观生效状态。

Overview 的两组 TanStack Query key 都包含 actor、acting/resource organization、可选 Workspace、用途和当前授权摘要，避免身份切换、撤权或授权变更后命中旧缓存。Fake ABH API 在显式测试控制点后清空 inbox，生产构建 Chromium E2E 验证 DOM 从 Pending 变为空，并继续覆盖 Mission 投影、Decision 审批、无障碍和 LCP/CLS 门槛。

Workbench 13 项单测、类型检查和 Next.js 生产构建通过；E2E 1 项通过、axe 3 次扫描 0 violation、LCP/CLS 断言通过。剩余限制是真实 IdP/生产 API、读屏用户确认、移动/1280px 视觉矩阵、INP、SSE 恢复、双组织迟到响应和生产治理装配。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：SSE 恢复游标与 INP 验收

Workbench 修复投影 SSE 的恢复缺陷：订阅 effect 不再因每次渲染生成的 `queryKey` 新引用而反复重建。客户端现在记录最近 `projection_changed` 事件的 opaque cursor，断线后用有界、编码的 `lastEventId` 重新连接 BFF；BFF 将其转换为上游 `Last-Event-ID`。重连打开并复核授权后强制刷新 TanStack Query，断线期间错过的变更不会依赖本地猜测。reset 仍关闭流并要求重建基线。

生产构建 Chromium E2E 通过受控 Fake SSE 验证断连/重连：Fake API 在 Mission 投影变为 4 个待处理触发和 2 个阻塞后断开连接，浏览器重连把 `mission-*` 游标传回上游，授权强读把语义表格和图表更新到新值。E2E 同时开启 Event Timing 16ms 阈值，在 Decision 审批真实键盘/点击交互上实测 INP ≤ 200ms；LCP、CLS、axe 和懒加载门槛保持不变。

Workbench 14 项单测、类型检查和 Next.js 生产构建通过；E2E 1 项通过、axe 3 次扫描 0 violation、LCP/CLS/INP 断言通过。剩余限制是真实 IdP/生产 API、读屏用户确认、移动/1280px 视觉矩阵、双组织迟到响应和生产治理装配。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：双组织切换与迟到响应拒收

生产构建浏览器验收新增第二条完整旅程。受控 ABH API 现在把 Bearer token 映射到 Organization A/B，并隔离 Mission、Inbox、Decision 和测试控制点；合同错误返回带类别和 correlationId 的 `ErrorResponse`，版本冲突使用 `VERSION_CONFLICT`。Decision 提交前仍由服务端强读；测试控制点把真实状态推进到 Approved v2 后只回放一次 stale Pending v1，公开命令的 If-Match 随后得到权威 409，浏览器显示 `VERSION_CONFLICT`，重载只显示服务端 Approved v2，不重建过期表单。

旅程随后通过页首 Server Action 切换到 Organization B。Workbench 修复了切换选择器的可见性条件：适配器返回的 `switchableOrganizations` 本就排除当前组织，因此渲染条件必须是 `length > 0` 而不是 `length > 1`。切换 Cookie 仍只是待复核选择；身份适配器重新验证成员资格后才创建 Organization B Session。总览确认 Mission 和 Inbox 均为空，直接访问 Organization A Decision 返回 `FORBIDDEN`，浏览器全程只持有 Workbench 会话，不接触上游 API 凭据。

Workbench 14 项单测、类型检查和 Next.js 生产构建通过；E2E 2 项通过，既有 axe 3 次扫描 0 violation、LCP/CLS/INP 断言保持通过。剩余限制是真实 IdP/生产 API、读屏用户确认、移动/1280px 视觉矩阵和生产治理装配。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：Inbox、Action 与 Settings 生产装配

待办页从静态服务端渲染改为服务端授权基线加 TanStack Query 授权轮询。首屏仍通过 Workbench BFF 强读 Pending Inbox；`LiveInbox` 后续只调用同源 `/api/overview/inbox`，查询 key 沿用 actor、acting/resource organization、Workspace、purpose 和 authorization digest 隔离。生产 Chromium E2E 先验证 Pending 卡片，再在受控上游消费待办后等待授权轮询把页面变为空态，浏览器不接收上游 API 凭据。

Action 详情新增同源 `/api/actions/:id` 强查询 BFF 和 `LiveActionStatus`。服务端初始读取保持 Strong；客户端按同一身份上下文生成 `actionQueryKey`，周期获取权威 Action 状态。当 lifecycle、outcome 或版本变化时提示刷新页面后再提交，取消和补偿表单不会基于旧版本乐观复用。

Action 列表页也改为授权轮询。新增 `/api/actions` BFF，只接受 UUID Mission、合同生命周期/结果枚举、256 字节有界游标和固定 `limit=25`；列表查询 key 隔离 actor、双重组织、Workspace、purpose、authorization digest 以及 mission、lifecycle、outcome 和 cursor。筛选表单提交会建立新授权缓存分页，不会复用另一组查询。E2E 覆盖 Reconciling/Unknown 到 Closed/Succeeded 的推进，并对 Inbox、Action 列表和 Action 详情增加 axe 扫描。受控 Fake API 同步补齐公开协议路径 `/v1/actions/:id` 与 `/v1/actions`，避免测试替身偏离真实 HTTP 客户端。

Settings 新增显式生产装配边界。未设置 `WORKBENCH_SETTINGS_URL` 时保持 deny-all；设置后 `settings-install` 启用 HTTP 适配器，每次 resolve/execute 都携带当前 Session 换取的服务端凭据，响应固定 JSON、限额 256 KiB 默认、禁止重定向，并有界超时。命令前会重新 resolve 授权快照，确认 command 仍已注册，再以用户请求 ID 作为幂等键提交；快照重新经过 Ajv 形状校验。凭据只存在服务端 Adapter 调用中，不下发浏览器。

生产 Chromium E2E 使用受控治理服务验证 Settings 快照、Schema 输入、确认弹窗、命令受理和服务端刷新到 Enabled；切到 Organization B 后 Settings 返回 `FORBIDDEN`。Workbench 20 项单测、类型检查和 Next.js 生产构建通过；E2E 2 项通过，axe 扫描增加到 7 次且 0 violation。真实生产治理服务、补偿模板和生产托管仍待外部接入。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：补偿模板生产装配

补偿模板补上与 Settings 一致的显式生产装配。未设置 `WORKBENCH_COMPENSATION_URL` 时保持 `denyAllCompensationAdapter`；设置后 `compensation-install` 启用 HTTP 适配器，请求只携带 Session 上下文和 Source Action id/version，完整 Action 与 `apiHeaders()` 都不发给模板服务。响应必须固定 JSON、默认 256 KiB、禁止重定向、有界超时，并重新通过补偿模板形状校验；非法模板安全降级为不可用，不会被宿主信任。

提交前维持服务端 Strong 读和 `Closed/Failed|PartiallySucceeded` 复核；模板必须唯一匹配 key、通过 Schema 校验，并在 `sourceVersionRefs` 与 Artifact `sourceRefs` 中绑定当前 Action。用户输入由 Ajv 2020 重验后生成受保护意图幂等键，补偿仍作为新的 Action 提案两阶段提交，不产生乐观“已生效”。`uiSchema` 也纳入 32 KiB 上界，避免宿主响应绕过表单边界。

生产 Chromium E2E 覆盖 Action 变为 `Closed/Failed` 后动态加载补偿 JSON Forms、Schema 输入、Artifact 存储、Action 提案受理、无障碍扫描和 Organization B 隔离。Workbench 23 项单测、类型检查、Next.js 生产构建通过；E2E 2 项通过，axe 扫描增加到 8 次且 0 violation。真实生产补偿服务、生产 Domain Pack 装配和生产托管仍待外部接入。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：Mission 生命周期与引用型命令

Workbench Mission 详情补齐取消入口。取消前服务端重新强读 Mission，复核版本和 `Draft/Active/Paused/Blocked` 状态；浏览器先收到显式确认弹窗，提交理由限制在 1—2000 字符，并纳入 `missionId + version + cancel` 的规范化意图摘要派生稳定幂等键。命令使用 `abh.workbench.user.cancel` 和当前 `missionRef`，响应必须是合同 `MissionRecord`；页面只显示受理回执，不声明终态，详情以刷新或后续订阅后的服务端状态为准。

同一轮修复 Core 客户端的引用型命令缺陷：`missions.activate/pause/cancel/resume/submit-trigger` 和 `runs.start/complete` 不再落入按 `id/expectedVersion` 组装分支，而由专用入口从 payload 引用提取目标与版本，并转换成强 `If-Match`。同时修复服务端 Mission Create/Activate/Pause/Cancel/Resume/Block/Close/ReviseGoal/ResolveBlocker 的 HTTP 响应形状：公开合同要求裸 `MissionRecord`，不再把内部 `{missionRef,commandId,replayed}` 交给响应防火墙。生产 Chromium E2E 覆盖取消旅程、Organization B 隔离和 8 次 axe 扫描；Core 客户端测试锁定 `If-Match`、目标、payload 和裸 `MissionRecord` 响应。Core 全量 548 项中 542 通过、6 跳过、0 失败；投影修复回调的等待竞态也已消除。剩余限制是真实 IdP/生产 API、生产治理与补偿服务、生产托管、读屏用户确认和移动/1280px 视觉矩阵。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：Mission 真实视图聚合

`abh.missions.get` 不再把 `pendingTriggers`、`blockers` 和 `availableActions` 固定为空。强一致查询现在从 PostgreSQL owner 表聚合合同视图：只返回 `Accepted` 的 pending trigger 和 `resolved=false` 的 blocker。动作先按 Mission 状态生成候选——Draft 激活，Active 暂停/取消/阻塞/修订目标/关闭，Paused 恢复/取消，终态为空——再在同一强读事务中用当前 Mission 命令 Grant 与 fence 逐项核验。缺权动作只从体验提示移除，不拖垮查询；提交路径继续独立重验权限、If-Match、状态和幂等。

真实 PostgreSQL 回归覆盖 Draft、Active、Paused 和终态动作、Accepted trigger、未消解 blocker、required blocker 恢复后从 `blockers` 消失并可在 resolved 集合中查到。回归暴露并修复两个生产写入缺陷：首次 trigger 插入漏写必填 `trigger_key`；Mission cancel 在数据库 `stop_epoch` 加一后没有同步记录字段，导致终态强读一致性失败。Workbench Fake API 的 Mission 视图与投影动作也同步为状态驱动，生产 E2E 继续通过公开 HTTP 客户端消费。

Core 全量 549 项中 543 通过、6 跳过、0 失败；全工作区 913 项中 907 通过、6 跳过、0 失败。Workbench 23 项单测、生产构建 E2E 2 项、docs 768 个链接、contracts 51 个 artifact、API 13 个入口、全仓类型检查和构建通过。剩余限制是真实 IdP/生产 API、生产治理与补偿服务、生产托管、读屏用户确认和移动/1280px 视觉矩阵仍待外部接入。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：Mission 列表过滤分页

`abh.missions.list` 不再忽略合同输入，也不再固定截断 25 条。强一致列表现在支持 `missionStatus`、`domainType`、`workspaceId`、`limit` 和 opaque cursor；服务端保持租户、当前 Workspace、用途和删除过滤，按 `updated_at/id` 倒序返回完整 `MissionRecord` 页。新 `MissionCursorCodec` 使用显式宿主密钥加密续读位置，并绑定 actor、双重组织、Workspace、用途、Session/Scope epoch 和规范化筛选；换筛选、换身份、篡改或过期都会返回 `INVALID_ARGUMENT`。

列表安装必须显式提供 cursor 和当前 `abh.missions.read` Grant resolver；Owner 在读取事务中锁定并重验当前 Grant/fence，不给默认授权。类型化客户端 `missions.list` 现在接受合同查询参数，HTTP BFF 透传解析后的 query。真实 PostgreSQL 回归覆盖两页收敛、Draft/Active 过滤、空页、缺读权拒绝和游标筛选漂移拒绝；专项测试覆盖游标身份绑定、防篡改、过期和密钥配置。Workbench 生产构建 E2E 的总览旅程继续通过公开客户端消费列表。

Core 全量 550 项中 544 通过、6 跳过、0 失败；全工作区 914 项中 908 通过、6 跳过、0 失败。Workbench 23 项单测、生产构建 E2E 2 项、contracts 51 个 artifact、API 13 个入口通过。剩余限制是真实 IdP/生产 API、生产治理与补偿服务、生产托管、读屏用户确认和移动/1280px 视觉矩阵仍待外部接入。验证见 [Workbench Browser E2E 证据](verification-2026-09-11-workbench-browser-e2e.json)。

## 2026-09-11：Run 列表过滤分页

`abh.runs.list` 不再返回无授权解析的固定 25 条。强一致列表现在消费合同 `missionStatus`、`missionId`、`limit` 和 cursor，在租户、当前 Workspace、用途和删除过滤下按 `(updated_at,id)` 倒序返回 `RunRecord` 页。新 `RunCursorCodec` 用显式宿主密钥执行 AES-256-GCM，并将续读位置绑定 actor、双重组织、Workspace、用途、Session/Scope epoch 和规范化筛选。

HTTP 安装要求显式 cursor 和 `abh.runs.read` Grant resolver；读取事务先锁定并重验 Grant/fence，再执行 keyset 分页。类型化客户端 `runs.list` 和 HTTP route 透传合同 query。真实 PostgreSQL 回归覆盖两个 Completed Run 的两页收敛、Mission 过滤、空页、缺读权拒绝和游标筛选漂移拒绝；专项测试覆盖身份绑定、防篡改、过期和密钥配置。生产队列托管、连续订阅水位和跨页快照仍不在本查询边界内。

## 2026-09-11：Context Manifest 授权读取

`abh.contexts.get` 不再只按租户 ID 读取持久 Manifest。公开查询现在要求显式 `contextGet.grants` 安装，并在同一强读事务中锁定和重验当前 `abh.missions.read` Grant、组织/身份 fence、用途和当前 Workspace。`ContextOwner` 新增 `getById`，同时过滤租户、注册用途、Workspace 和删除标记，并核对数据库行版本、Manifest 引用、资源组织与按合同 digest 字段计算的 `manifestDigest`。

修复 `manifestDigest` 原先把自身纳入哈希输入的循环缺陷；保存时现在使用 `ContextManifest` 的声明 digest 字段，读取时重算同一摘要。真实 PostgreSQL 回归覆盖授权读取、缺安装/缺 Grant/撤权拒绝、错误用途、数据库版本漂移和摘要篡改失败。生产 Context 生成、跨组织用途和完整 Agent Runtime 装配仍是后续边界。

## 2026-09-11：Projection 查询边界收敛与 Mission Run 历史

Projection 列表的 cursor 解码、Grant resolver 调用、内部 keyset 位置转换和加密回写已从 HTTP 包装层移入 Mission 查询边界。`ProjectionOwner.listMissionSummaries` 继续逐行重验当前 `abh.projections.read`，只输出已授权行和内部续读位置；处理器输出 AES-GCM opaque cursor，筛选或身份漂移仍然失败。已补撤权后空页与令牌篡改回归。

Mission 详情现在通过已授权 `abh.runs.list` 显示最近 25 条 Run 摘要，包含状态、执行模式、trigger、版本和更新时间；生产构建 E2E 覆盖 Completed 与 Queued 两种可见状态。`/runs/[id]` 已接入 `abh.runs.get` 强读，展示 Run 状态、来源、Workflow、Assignment 和 Task 视图；Mission 历史可导航到详情，Organization B 直接访问被拒绝，未知 Run 明确显示 `RESOURCE_NOT_FOUND`。公开客户端包装层不再把服务端注册错误改写为 `INVALID_ARGUMENT`。Run 取消/重试操作和实时任务水位仍保留。

`/runs/[id]` 已接入 `abh.runs.get` 强读，展示 Run 状态、来源、Workflow、Assignment 和 Task 视图；Mission 历史可导航到详情，Organization B 直接访问被拒绝。Run 取消/重试操作和实时任务水位仍保留。

## 2026-09-11：队列交付策略与清理水位

pg-boss 队列的重试、租约、保留和完成后清理策略已从硬编码升级为按队列类显式配置，并经真实 PostgreSQL 验证持久化。零清理值保留幂等回放证据，正值交由原生 supervised maintenance 删除；两者不能混同。全局发布扫描和完整业务 Worker 服务仍是缺口。

## 2026-09-12：Run 取消闭环与完成度 92%

Run 生命周期补齐公开取消闭环。`abh.runs.cancel` 契约绑定当前 Run、原因码和证据引用，OpenAPI 增至 37 个路径。Core Owner 在 PostgreSQL 中原子执行状态复核、Run CAS、stop epoch 递增、未终 Task 取消、Mission activeRunRef 清理、Audit 和 Outbox 写入；幂等重放收敛到同一 RunRecord，Queued Run 被状态护栏拒绝。

Workbench Run 页在强读复核后提交取消，使用理由、版本和证据引用派生稳定幂等键，并在受理后显示服务端已接受的回执。生产 E2E 覆盖 Running→Cancelled、Task 同步取消、Run 历史更新、后续 Mission 与决策旅程、Organization B 隔离、8 次 axe 扫描和 LCP/CLS/INP 预算。真实 PostgreSQL 回归覆盖任务取消、stop epoch、审计/事件和幂等。

完整 `pnpm check` 通过：Core 553 项中 547 通过、6 跳过、0 失败；全工作区 917 项中 911 通过、6 跳过、0 失败。Contracts 51 个 artifact、API 13 个入口、Docs 769 个链接、全仓类型检查、构建和公开 API 报告通过。Workbench 23 项单测和生产构建 E2E 2 项通过，`/runs/[id]` 首载 106 kB。剩余缺口集中在生产托管、真实 IdP/Provider、生产治理/补偿服务、全局发布扫描和完整业务 Worker。

## 2026-09-12：Run 详情收口

Run 详情现在覆盖 Completed/Queued 展示、Mission 返回、未知 Run 的 `RESOURCE_NOT_FOUND` 和 Organization B 的 `FORBIDDEN`。这轮验收暴露并修复公开客户端 query/command 包装层把服务端注册错误统一改写为 `INVALID_ARGUMENT` 的缺陷；客户端保留注册错误响应，仅本地输入失败使用 `INVALID_ARGUMENT`。Fake API 的 404 错误类别也修正为合同注册的 `NotFound`。

完整 `pnpm check` 通过：Core 553 项中 547 通过、6 跳过、0 失败；全工作区 917 项中 911 通过、6 跳过、0 失败。Contracts 51 个 artifact、API 13 个入口、Docs 769 个链接、全仓类型检查、构建和公开 API 报告通过。Workbench 23 项单测和生产构建 E2E 2 项通过，`/runs/[id]` 首载 105 kB。生产托管、真实 IdP/Provider、全局发布扫描和完整业务 Worker 仍是 90% 之后的主要缺口。

## 2026-09-12：Learning Gate 结果与剩余边界

独立 `abh.learning.gate` principal、机器可读 Profile 阈值、不可变 Gate Artifact、Pass/Fail/Inconclusive 确定性裁决、逐项 finding、事件/审计/回执和幂等重放已由真实 PostgreSQL 回归覆盖。Gate 仍不创建 Release 或生产批准；基线回归比较、多重比较控制、不确定性模型、评测编排/超时、结果查询、签名/发布编排和用途撤回传播继续开放。

## 2026-09-12：Evaluator 结果持久化与剩余边界

不可变 `EvaluationResultRecord`、Queued Run 的 v1→v2 CAS、确定性 Completed/Inconclusive 判定、独立 evaluator/producer 身份复核、产物锁定、事件、审计、回执和命令重放已由真实 PostgreSQL 回归覆盖。评测执行仍不是内部功能：真实外部评测宿主、指标不确定性、迟到/矛盾执行证据、结果查询、Gate Artifact、Release 编排、用途撤回传播和生产治理装配继续关闭在边界外。

## 2026-09-12：Correction 三类目标应用与剩余边界

不可变候选、强读查询、`Domain + Mission Goal`、`Run + Graph Patch` 和 `Memory + Learning Signal successor` 应用，以及受治理 Signal、Learning Case、Draft Capability Candidate 与 Evaluation Request 第一段已闭环：授权、版本/摘要、Authority 准入、Goal CAS、当前图快照、Patch 基线、不可变 Signal 后继、证据归因、候选创建、Profile 冻结、Queued Run、不可变 Application、Audit/Outbox 和重放均有真实 PostgreSQL 回归。这仍然不是通用 Correction Engine 或 Learning Plane：评测执行/结果、Gate、Release、知识资格授予、用途撤回传播、Exception 编排、补偿、资源/治理解冻、已执行 Task 改写、品牌事实资格、批量列表、连续投影、差异展示和跨目标编排没有实现。宿主 authority/Grant 回调也只定义工程装配接口，不等于生产治理或安全审查。

## 2026-09-12：Evaluation/Gate 查询与用途撤回传播闭合

Learning 证据链的三个读取面已补齐：`abh.evaluation-runs.get` 返回 Run 当前版本，`abh.evaluation-results.get` 在 evaluate/gate 用途下返回不可变 Result，`abh.learning-gates.get` 在 gate 用途下返回 Gate Artifact。公开客户端和 OpenAPI/client.api 同步更新，Run 当前版本读取已区分 Queued v1 与终态 v2。

用途撤回传播也不再只是边界声明。`core.learning_withdrawals` 记录 capture/evaluate/gate 的幂等撤回；Purpose revoke 与 Withdrawal 原子提交，Learning Owner 在继续构造或读取 Signal、Case、Candidate、Profile、Run、Result、Gate 前失败关闭。原始事实不被改写，满足“标记不可再用、保留审计证据”的边界。真实 PostgreSQL 回归覆盖三类用途撤回、跨生命周期读取阻断、Run 当前版本和 Result/Gate 查询。

本批新增 `abh.releases.configure-learning-candidate`，已关闭 Release Controller 消费不可变 Learning Gate 的 Core 编排缺口：复核证据 digest、Pass 判定、精确绑定、Gate 唯一消费、三方身份独立性、Release/Assignment 链接、幂等回放和用途撤回传播；发布仍只委托既有 Static Release Owner，不自动晋级。

## 2026-09-12：Evaluation Retry 已闭合

Evaluation Retry 不再是开放缺口。`abh.learning.retry-evaluation` 现在绑定一个精确 `Inconclusive` 前驱 Run，拒绝 Completed/Queued/未知 Run；后继 Run 不可被调用方改写 Baseline 或 Profile，并在契约与审计相关引用中携带 `retryOfRef`。Candidate 行级串行化防止并发请求绕过“无活跃 Queued Run”约束，Profile 和全部 evaluation evidence 在每次重试前重新通过用途、身份和可用性检查。

真实 PostgreSQL 回归覆盖成功重试、幂等回放、血缘和冻结输入、Completed/未知前驱拒绝、producer 身份拒绝和活跃队列冲突；Core HTTP 与类型化客户端回放同一后继 Run。Workbench 只对强读后的当前 `Inconclusive` 版本显示重试，并使用不含自由文本意图的稳定幂等键；E2E 覆盖受理与列表可见性。

本地工程完成度约 99.9%。Gate 已实现冻结 Profile 驱动的 Wilson Score 置信区间、最低有效样本、候选/基线聚合与最低相对提升；`uncertainty` 和 `limitations` 进入不可变 Gate Artifact，避免只凭单次点值晋级。Evaluation Recovery Worker 已闭合队列超时、attempt 上限、租约恢复和显式 Inconclusive 审计。真实外部评测宿主、复杂实验方差模型和生产 Canary 分析仍在后续批次。

当前剩余的是生产化与治理外部系统：真实评测执行引擎与生产凭据接入、批量发布运维、生产托管、真实 IdP/Provider、生产安全审查和独立验收。Workbench `/learning` 已补上候选、评测运行、不可变 Gate 的授权浏览以及 Evaluation Request/Retry/Learning Release 写入口；Core 现已提供租约绑定的 Evaluation Host HTTP Port 和 Release 命令。连续观测、差异对比、回滚编排和完整 CLI 操作面仍然开放。

## 2026-09-12：Learning Release Workbench 写路径闭合

Learning Release 不再停留在 Core-only。`abh.releases.configure-learning-candidate` 已成为 Public Create 命令，直接返回 `StaticAssignmentRecord`；Core HTTP、typed client、Workbench server action、授权浏览页和生产浏览器 E2E 全部接线。Workbench 先强读 Pass Gate，再由服务端冻结 Candidate/Gate、精确 Capability、Compatibility Artifact、Organization Scope 和证据引用；稳定幂等键绑定完整受保护意图，浏览器无法注入身份、结果状态或权威证据。

真实 PostgreSQL 集成覆盖 Release Authority 的 HTTP 提交和幂等回放。批次还发现并修复 Fastify 适配器对非信封 Create DTO 的 ETag 缺陷，避免新增契约响应被迫使用非标准包装。Core 568 项中 562 通过、6 跳过、0 失败；Contracts 312 项、Workbench 26 项单测、2 项生产 E2E、CLI 5 项和 Fastify 15 项通过。

Learning Gate → Release → Organization Assignment 的本地工程链路已闭合。剩余边界不变：这不代表生产发布批准，也不执行 Canary、真实部署、知识资格授予、批量发布扫描或生产安全验收；发布后的连续观测、差异对比、回滚编排和完整运维操作面仍在后续批次。

## 2026-09-12：Assignment 读取与暂停闭合

Assignment 不再只有创建事实而没有受控后续操作。`abh.assignments.get` / `list` 在当前 `abh.release.manage` 授权、租户/Workspace/用途边界内读取精确 DTO；List 使用有界 keyset 分页、授权绑定 cursor 和稳定状态计数。`abh.assignments.pause` 用同一权限执行强版本 CAS，把 Active Assignment 推进到 Paused 并持久化 reason/evidence；新的 selection 和 execution eligibility 立即关闭，历史 Assignment 和已派发工作不被伪装成可取消。

真实 PostgreSQL、HTTP/typed client、契约与 API 报告覆盖该生命周期。Workbench `/learning` 已接入授权列表与受控暂停：浏览器不能注入 evidence 或选择任意授权，服务端强读当前 Assignment 后从 DTO 证据派生暂停证据。这不提供生产回滚编排、Canary 终止、真实部署补偿或批量发布扫描；暂停只治理新的 Assignment 资格，不承诺在途执行已停止。

## 2026-09-12：Static Assignment Rollback 已闭合

`abh.assignments.rollback` 已实现受治理的 Static Assignment replacement：强版本锁定失败 Assignment，复核精确前继 Release 与当前 Gate/Compatibility 证据，CAS 暂停失败 Assignment，并创建指向前继 Release 的新 Assignment。新 Assignment 保留 scope/tier/用途可见性，携带回滚血缘；既有 Pin Set 保持不可变，新 selection 才会回到前继版本。

契约、真实 PostgreSQL Owner、Core HTTP、typed client、授权、幂等重放和 Audit/Outbox 均有回归。边界仍然明确：这是新选择资格的显式治理回滚，不是取消或补偿在途工作，也不是生产发布批准、Canary 终止、部署自动化或完整运维回滚编排。Workbench 暴露、生产证据派生和服务端稳定幂等键仍属后续 UI/运维批次。

## 2026-09-12：Assignment Rollback Workbench 已闭合

Workbench `/learning` 已补上受控 Assignment 回滚：浏览器只提交 Assignment 版本、前继 Release ID 和理由；服务端强读当前 Assignment 与前继 Assignment，分类派生 Learning Gate 与 Compatibility Artifact，构造稳定幂等键后调用 Public Rollback。页面展示 replacement 的前继 Assignment/Release 血缘，生产 E2E 覆盖 Release→暂停→再次 Release→回滚→Active replacement。

剩余边界不变：该入口只恢复新的选择资格，不取消在途工作，也不提供生产发布批准、Canary 终止、真实部署补偿或批量运维编排。

## 2026-09-12：Capability Release 诊断已闭合

设计中的 `abh doctor release --id` 已接入实际 Core/CLI：只读诊断覆盖 Gate 证据、Compatibility、exact 安装状态、Assignment 执行准入、pin 与回退候选。Contract、真实 PostgreSQL、CLI 解析、有界失败和凭据抑制均有回归；验证见 [Release Doctor 证据](verification-2026-09-12-release-doctor.json)。

这不改变发布边界：生产 Release 批准、自动晋级、部署执行、在途工作补偿、连续观测和批量修复仍未实现。

## 2026-09-12：Operation 恢复诊断已闭合

`abh doctor operation` 现在能在一个有界只读事务中展示恢复所需事实：原意图和 Permit、最后外部 Receipt 水位、是否能安全重试、剩余 Resource Fence 责任、Permit/Receipt/Reconciliation 缺口、Unknown-outcome 保护状态和 Closed 收口一致性。CLI、Contract、API 报告、真实 PostgreSQL 和 CLI 边界失败均有回归。

仍然开放的只是修复动作和生产化：诊断不会派发、调用 Provider、写 Reconciliation 或释放 Fence；自动恢复编排、生产托管、真实外部系统、独立安全审查和生产治理验收继续在边界外。

## 2026-09-12：CLI Development 初始化已闭合

CLI 合同中的 `init` 现在有显式 Action-only Development 模板：配置契约校验、目录/文件权限、非空 fail-closed、force 差异预览、模板文件隔离和 symlink 防护均有测试。该命令只生成安全脚手架，不启动服务，也不伪装业务实现。

剩余 CLI 边界继续保留：`dev` 运行装配、Pack validate/build/sign、conformance、系统 upgrade、数据 export/import、完整配置热更新、生产 Secret Ref 解析和发行供应链验收仍未实现。

## 2026-09-12：Pack 内容验证 CLI 第一段

`abh pack validate` 现在覆盖 Manifest/策略准入、声明 payload 字节、大小/数量边界、链接与重复文件防护及三组内容摘要；结果由新 Contract 约束。本地 policy 是显式开发输入，不是当前治理来源。

Pack CLI 仍开放签名、来源、CTK、test/build/sign、安装、升级和迁移执行；成功只表示内容与显式策略一致，不授予任何运行时 authority。

## 2026-09-12：Pack Manifest 构建 CLI 第一段

`abh pack build` 现在可从声明的本地 payload 生成规范未签名 Manifest：扫描边界与链接/未声明文件防护与 validate 一致，实际字节派生条目摘要/尺寸，三组完整性和 Cosign 签名载荷由 Contract 摘要算法生成。CLI 输出契约化诊断，不覆盖既有产物。

build 结果仍是本地开发输入。签名、来源、CTK、test/sign、安装、升级和迁移执行继续开放；生成 Manifest 不代表策略准入、可信供应链或运行时授权。

## 2026-09-12：Pack Cosign 签名 CLI 第一段

`abh pack sign` 已接入 pinned Cosign `sign-blob`：密钥和口令仅通过命名环境引用进入受限临时目录，bundle 先经独立公钥 `verify-blob` 回验再 fail-closed 写出。签名绑定精确 Manifest 三组摘要和 Cosign 原始载荷，CLI 不泄露密钥或外部进程输出。

该命令只生成签名证据。Signer allowlist、revocation、provenance、CTK、安装准入、迁移执行和运行时 authority 仍必须由部署治理和 Loader 独立判定。

## 2026-09-12：Pack 供应链验证 CLI 已闭合

`abh pack verify` 已接入既有 Core `validateLocalPack`：同一本地快照内验证内容字节/摘要、发布签名、SLSA provenance 和签名 CTK，并生成绑定策略与证据摘要的正式 `PackValidationReport` 摘要。CLI 失败只暴露稳定错误码和 remediation，成功只输出有界报告字段。

这仍是本地信任输入验证，不替代数据库信任策略、当前授权、撤回状态、安装、迁移执行、Capability Release 或运行时 authority。

## 2026-09-13：Safety Receipt 例外退役已闭合

已确认成功的 safetyStop Operation 现在经过同一 Receipt → pinned Comparison Rule → Reconciliation → OperationController CAS 生命周期。Controller 按 Operation 身份和当前 fence token 识别当前安全例外，调用专用 `clearSafetyStop`；该操作只移除 `safetyStopOperationRef`，不触碰原 Unknown Operation、预算 Hold、旧 Permit、旧 Attempt/Observation 或旧 fencing token。一次退出授权也接受当前匹配的安全 Permit，消除“可签发但不能执行”的断层。

真实 PostgreSQL 回归证明：ResponseLost 先建立 Unknown 责任，独立安全 Action 共享同一槽；成功安全 Receipt 关闭安全 Operation 并移除安全指针，原 Unknown 继续持有槽且旧 token 仍失败；晚到的第二个独立安全 Action 可再次轮换并随后用成功 Receipt 退役。安全例外存在时普通 retry 被拒绝；例外退役后受控 safe retry 的原语语义恢复，但没有生产 Worker 自动执行该决策。Pack 能力登记元数据和专用治理用途已闭合；公开 safetyStop 编排、正式 Domain 装配、exact Connector 运行时证明和生产治理验收仍开放。验证见 [Action Safety Stop 证据](verification-2026-09-13-action-safety-stop.json)。

## 2026-09-13：Safety Capability 元数据登记已闭合

`PackCapabilityBinding` 与 `PackCapabilityRegistration` 新增封闭可选 `safetyStop`。受信构建期准备器把缺失规范化为 `false`，登记摘要策略包含该字段，因此 true/false 会在 Registration digest 与 Capability Set digest 中绑定。`safetyStop=true` 的能力还必须在权限包络中显式授予专用 `abh.action.safety-stop` 用途；缺失该用途的登记在访问源文件前被拒绝。`abh.capabilities.query` 候选显式返回 `safetyStop`，并支持封闭的 `safetyStop` 布尔筛选，但不暴露实现句柄。Catalog 新增 `abh.action.safety-stop` 治理用途；Action Intent 只允许受信 handler 在该用途存在时声明 `safetyStop=true`，普通 proposal 请求体仍没有该字段。

Exact resolver 在 immutable Registration 双读后返回 `safetyStop`，并在调用方要求时对 false 直接拒绝；`dispatchPackOnce` 对 safety Intent 传入该要求，在一次性出口提交前执行检查。契约、Pack capability、capability discovery、exact resolution 和真实 PostgreSQL Action 回归覆盖默认 false、true 摘要变化、查询可见、缺专用 Intent/登记用途拒绝、false 元数据拒绝、true 放行和完整安全 fence/回执链路。仍开放的是公开 safetyStop 业务编排、正式 Domain 装配和生产治理验收。验证见 [Action Safety Stop 证据](verification-2026-09-13-action-safety-stop.json)。

## 2026-09-13：Safety Stop 候选发现已闭合

`abh.safety-stops.list` 提供当前未释放资源槽的有界强读视图，只允许专用 safety-stop 用途和当前 read Grant，最多 100 条；超限通过 `complete=false` 显式表达。响应保留原 Operation、当前 token、资源身份、可选 safety Operation 与 blocker 引用，不释放责任、不选择 Connector、不派发 transport、不暴露敏感执行数据。

真实 PostgreSQL 回归覆盖独立权限、缺 Grant 拒绝、两个候选完整返回和超限截断。typed client、OpenAPI 和 Core HTTP 装配已同步。候选发现已闭合，但正式公开 safetyStop 业务编排、Domain 装配和生产治理验收仍开放。验证见 [Action Safety Stop 证据](verification-2026-09-13-action-safety-stop.json)。

## 2026-09-13：Exception 决议公共入口

`abh.exceptions.resolve` 已升级为公共 Update Command，响应只暴露 Exception ref、Command id 和不可变决议记录。Core HTTP 把可信宿主 Grant 回调接回既有 Owner；Human 用途、当前 Grant、批准 Decision、精确版本、技术 Unknown、资源冻结、幂等回放和重放冲突都在 PostgreSQL 事务内复核。真实 HTTP/客户端回归证明 Unknown 和原 ResourceFence 不变；处置后编排、责任重路由、Correction 后治理解冻和生产治理仍开放。验证见 [Exception Resolution 公共入口证据](verification-2026-09-13-exception-resolution-public.json)。

## 2026-09-13：Run Suspension 通知 Owner

Pack Suspension 的 Run 目标不再被投递页拒绝。新增稳定 `runPackSuspensionConsumer`：事件类型仍限定 `abh.installed-pack.suspend`，先复核当前 `abh.runtime.consume-event` Grant、当前 PackCapabilityRegistry suspension 登记和可注入 source admission，再锁定 Run。消费者核对 Run `assignmentSnapshotRef` 与实际 PinSet 完全一致、PinSet 摘要、subject 身份和精确能力成员；缺少 Run admission 或未知 subject 仍显式失败，不静默确认。

效果是同事务的不可变 `RunPackSuspensionObservation` Artifact，记录原事件、Pack、能力、PinSet、当前 Run 状态和全部 Task ref/node/status/attempt 快照；sourceRefs 绑定事件、Pack、PinSet 和 Task。真实 Inbox 仍按原事件加稳定 Run consumer id 去重，恢复扫描、分页和重放共享同一回执。既有 Action consumer、权限隔离和 Outbox 语义不变。

真实 Cosign/PostgreSQL 联测覆盖能力引用发现 Run PinSet、Run/Task 持久夹具、Run 观察内容、稳定 consumer id、缺 Run admission 拒绝和完整签名安装链。这不取消/暂停 Run，也不改变 workflow 执行派发；生产跨范围调度宿主、退役治理与真实 Provider 验收仍开放。验证见 [Run Suspension Owner 证据](verification-2026-09-13-run-suspension-owner.json)。

## 2026-09-13：Suspension 持久回填水位

`runtime.suspension_sweeps` 现在为每个已提交暂停事件、精确能力和显式业务 scope 保存不可变化的 generation、数据库时钟高水位、页 cursor 和完成状态。每次 cycle 以打开事务时的 `clock_timestamp()` 为边界，只扫描此前已提交的 PinSet；并发插入进入后续 cycle，不会被旧水位错误确认。成功页面才推进 cursor，且 cursor 只能前进；失败、撤权或存储拒绝不推进。已完成 generation 保留为审计事实，下一次显式 scope sweep 打开新一代。

dispatch worker 在每个 scope/capability 效果前打开状态，每个成功 page 后推进状态。真实 Cosign/PostgreSQL 联测覆盖 RLS/manifest readiness、worker 两代完整状态、statement timestamp 之前/之后的 PinSet 边界、cursor 回退拒绝、完成重放后新一代打开和既有 Inbox 去重。仍不自动枚举业务 scope，也不把完整 generation 当作退役删除或全局通知证明。验证见 [Suspension Watermark 证据](verification-2026-09-13-suspension-watermark.json)。

## 2026-09-13：Safety Stop 公共提案

新增公开命令 `abh.actions.start-safety-stop`、HTTP 路径和 typed client `safetyStops.start`。请求必须携带候选 fence 引用、fencing token 和未决 Operation；Owner 在同一提案事务内重新锁定候选，核验真实 Identity、token、未决 Operation、无已登记 safety Action、无阻塞报告，并要求 proposal 目标同时绑定 fence 与未决 Operation。受信 definition 必须显式声明 `safetyStop=true` 和 `abh.action.safety-stop`。命令只创建 Proposed safety intent，不创建授权、Permit、传输调用或状态改变。

契约新增 `ProposeSafetyStopPayload`，OpenAPI 达到 61 条路径，51 个 artifact 和 API 报告保持一致。真实 Identity/Core HTTP/typed client Action 回归覆盖成功 intent、stale token、重复 safety 候选拒绝和非安全 definition 拒绝；既有公开 proposal 回归保持不变。自动编排、正式 Domain 装配和生产治理验收仍开放。验证见 [Safety Stop Public Proposal 证据](verification-2026-09-13-safety-stop-public-proposal.json)。

## 2026-09-13：Artifact 反向血缘

第 72 批迁移新增租户隔离的 `data.artifact_dependencies`。内联 Artifact 和 ObjectStore Artifact 都在同一 Available T2 中发布不可变血缘边；每条边保留目标 Artifact 版本、精确 source Ref、purpose/workspace 绑定和观察时间。重复发布幂等去重，墓碑不改写历史。反向查询按 source 类型和 UUID 稳定键序分页，并要求当前 purpose 与租户绑定；runtime 角色只有 INSERT/SELECT，admin 也受表 CHECK 限制不能改写 source 版本。

真实 PostgreSQL 回归覆盖两条 Artifact 派生边、去重重放、稳定分页、跨租户空结果、权限拒绝和结构不可变；既有内联、二进制、Tracked staging、清扫和数据库 readiness 回归保持通过。生产 ObjectStore Adapter、无上限大正文流式上传和保留/导出生命周期仍开放。验证见 [Artifact Lineage 证据](verification-2026-09-13-artifact-lineage.json)。

## 2026-09-13：Artifact 保留生命周期

新增 `data.artifact_retention_jobs` 和授权 `runArtifactRetentionWorker`。到期发现先复核 tombstone Grant，再为 inline 或 ObjectStore Artifact 建立租约化保留 Job；ObjectStore 删除必须获得外部 Completed 收据后才递增 Artifact 版本并写入 Tombstoned。JSON 引用使用显式 `text::jsonb` cast，终态/进行中 Job 不重复入队，删除收据与 policy evidence 均持久保留。

真实 PostgreSQL 回归覆盖未到期保留、到期对象先删后墓碑、Artifact 2→3、Job Completed/attempt=1、外部删除幂等键、墓碑后读取拒绝和保留 Artifact 不受影响；Artifact/database 聚焦测试 25/25 通过。验证见 [Artifact Retention 证据](verification-2026-09-13-artifact-retention.json)。

## 2026-09-13：Artifact 持久对象流式上传与开放导出

`FilesystemObjectStore` 现在提供 single-host durable production-profile ObjectStore Adapter：流式写入先落在随机 staging 文件，边写边计算 SHA-256 与 size，显式 `sync` 后再原子发布到 `objects/{prefix}/{id}-v{version}`；metadata sidecar、range read、put/delete receipt 幂等由同一根目录协议承载。该适配器满足 Core `ObjectStorePort`，但不声称跨主机共享文件系统或托管云对象存储的生产验收。

Object Artifact 增加无上限 `stageStream()` 和 `storeObjectArtifactStream()`。调用方可声明 expected digest、size 和 media type；Core 先创建 T1 staging Artifact，经 ObjectStore put、digest/size 校验后进入 T2 Available 发布。`readStream()` 用授权代理逐段读取已发布对象，避免把大正文载入内存。迁移清单版本升至 75。

`ArtifactExportOwner` 增加 Pending/Running/Completed/Failed/Expired 导出生命周期和 `data.artifact_exports` 持久作业。create 与 run 都要求显式当前授权回调；run 通过租约 claim 后用 PostgreSQL `READ ONLY REPEATABLE READ` snapshot 取得 watermark，导出 `manifest.json`、records JSONL、Available Artifact 内容和 artifact 引用。每个文件记录 SHA-256 与 size，完成时把带哈希 manifest 写成不可变 Inline Artifact，并持久化 manifest digest、watermark、文件数、输出大小和完成状态；失败清除输出并把 Job 标记 Failed。

真实 PostgreSQL 聚焦回归覆盖 300,000 字节分块流式上传、T2 metadata binding、range read、put/delete 幂等、300KB Artifact 导出、manifest hash、JSONL records 和数据库 Completed 状态。公开大正文 HTTP/client 上传和导出目录过期清扫已由后续条目关闭；真实分布式云 ObjectStore Adapter、托管生产部署和外部云验收仍开放。验证见 [ObjectStore 流式与导出证据](verification-2026-09-13-objectstore-stream-export.json)。

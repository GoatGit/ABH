# SDK、扩展合同与 CTK 详细设计

> 版本：1.2 · Owner：SDK / Conformance Maintainers · 许可：MIT
>
> 公开入口 Preview；0.x 仅承诺 compatibility.yaml 中实际通过的组合。

## 1. 公开模块

| Package | export 与可扩展内容 | 禁止跨越 |
|---|---|---|
| @abh/core | 常用 `defineBusiness` 业务声明入口；`@abh/core/client` 提供不带 Node/Worker 依赖的类型化客户端 | 不暴露 Controller/Repository，不将所有 Adapter/Workbench 打包到客户端 |
| @abh/domain-sdk | defineDomainPack、Schema/Agent/Workflow/Validator/DomainPort 描述 | Core 内部表、Grant、Provider SDK |
| @abh/connector-sdk | defineConnector、Capability、Compile/Dispatch/Query/Normalize/Reconcile Port | 领域目标、授权裁决、父 Action 状态 |
| @abh/adapter-sdk | Agent/Model/Durable/Identity/Secret/Object/Isolation Port 工厂类型 | 业务对象与任意 Core 状态写入 |
| @abh/workbench-sdk | defineView、Projection Schema、Command Binding、受限 UI extension | 原始数据库/Prompt/Token/动态脚本 |
| @abh/conformance | Core/Domain/Connector/Adapter/Workbench suites 与签名报告合同 | 私有测试集作为符合性必需项 |
| @abh/testing | Fake Provider、Clock、Identity、故障注入、Fixture Builders | 生产 Profile 注册 |

SDK 不封装第二 Workflow 引擎；把声明转换为 Pack Manifest/公开 Port 实现。exports 外 internal 路径通过 package exports 与 lint 阻断，Core 也不能反向导入特定领域包。

首次集成只直接依赖 `@abh/core`，CLI 作为开发工具；专业 SDK 保持可用，只有扩展作者需要分别安装。常用入口复用专业 SDK 的声明和 Contract Package 生成客户端，不复制类型、协议或控制逻辑。默认 Adapter 由 server/CLI 装配入口加载，Core 领域实现仍只依赖 Port；浏览器子入口的依赖图必须不包含数据库、Pi、Secret 或 Worker。

## 2. 最小作者流程

`init` 生成一个 business.ts、一个环境配置和固定构建/示例脚本。business.ts 声明业务输入/输出 Schema、已有 Connector 引用或受信实现、动作影响/验收要求、可选 Agent；开发者无需手写 Manifest、多个 Registry、Graph、Release 或 Assignment。声明编译为现有契约，派生版本与摘要由构建工具生成；生产使用构建时冻结制品，不读取可变源码热装配。

`defineBusiness` 只组合普通 TypeScript 声明与已有 Schema/工厂，不引入新 DSL、代码编辑器或通用代码生成平台。模板、版本引用和 Manifest 由固定构建步骤派生；自定义业务实现继续使用公开 SDK。

已有 Agent/应用可先提交独立 Action：只需 Action、Connector 和必要 Decision；missionRef 为空，不生成虚假 Run/Invocation。ABH 原生 Agent 路径再增加 Mission，未写 Workflow 时使用已验证的单 Agent → 验证 → 提案固定模板。有多步骤业务依赖时显式提供 Workflow，不从自然语言猜测执行契约。

作者示例的具体命令合同：

~~~sh
abh init --template hello-business --directory ./hello-business
cd hello-business
abh dev --config ./abh.config.json
~~~

另一个终端运行生成的 `pnpm example` 脚本，通过公开客户端提交模拟 Action、读取完整 Decision Package、由开发者明确批准并查询对账结果。脚本只封装 API 和普通终端输入，不另建 TUI/审批引擎；自动 CI 的测试响应必须标记为测试主体。服务固定绑定 loopback，Fake 身份与本地未签名制品仅在显式 Development 配置可用。

`abh dev` 自动校验/编译业务声明并启动默认 server；PostgreSQL 使用显式配置的现有实例或生成的 Compose，Workbench 默认关闭。`pack validate/test/build/sign` 留在贡献和发布教程，正式发布仍必须通过完整性、许可、CTK 与签名门禁。上述命令是待实现合同，不表示已有可安装发行版。

| 常用客户端入口 | 输入与已有 Owner 协议 | 返回 / 约束 |
|---|---|---|
| actions.propose | 注册 actionType、业务输入、target selectors/expectedVersion、idempotencyKey；先 StoreArtifact，再 ProposeAction | actionRef/trackingRef；Scope、影响、验收/资源要求由受信定义与 Domain 验证，客户端不可覆盖 |
| actions.get / actions.cancel | actionRef；取消增加 expectedVersion/reason/idempotencyKey | 原 Action Query/CancelAction Envelope；Unknown 不提供盲重试 |
| decisions.get / decisions.submit | 原 Decision Package 查询；提交携 packageDigest、expectedVersion、response/conditions 和幂等键 | 原 SubmitDecision/effect 状态；展示完整影响后明确操作，不默认批准 |
| missions.create / missions.activate | 目标输入与已注册业务定义；授权引用沿用 Mission Command | missionRef；Run/Task 由 Owner 创建，客户端不编排内部事务 |

客户端步骤使用从调用者幂等键稳定派生的子键；先将输入 Artifact 挂到经服务器确认的现有 Organization 或业务对象，再作为 sourceProposalRef/payloadRef 提案，避免先有 Action 才能保存输入的循环。Artifact 已提交而提案响应丢失时查回原 Command，不换键重发。同键异参按公共规则拒绝，未被正式引用的 Artifact 按既有生命周期清理。客户端只是已有 API 的类型化调用，鉴权、原子预留和状态迁移仍全部在服务器。

部署配置把 actionType 绑定到明确的执行 Service、允许提案人和所需执行能力；作者声明所需权限，不能在 business.ts 或请求中自行签发 Authority。首次待批 Action 无需先持执行委托，Control 在完整 Decision Effect 后按授权设计创建 Service Grant/ExecutionAuthority。已有 Scope 预授权可被服务端解析复用；客户端 authorityRef 仅作断言。版本 pinSet 与 Plan 由各 Owner 自动准备/查回，客户端既不传 runRef 占位，也不指定任意 Connector 新版本。

## 3. Domain 持久化 Port

注册 Domain Handler 包含 commandType、input/outputSchemaRef、ownedObjectTypes、requiredCapability、handlerRef；宿主提供 AuthorizedContext、TenantContext、限定 Schema 的 Repository/UoW、Artifact 和 Outbox Port。Handler 只能返回正式 Receipt 或结构化错误。

TenantContext 不从 SDK Payload 反序列化，来自宿主当前身份/目标。宿主注入的 UoW 已设置事务局部租户与 RLS；Handler 不接收全局连接、Schema Owner 凭据或 SET ROLE 权限。Core 的跨 Owner 原子事务复用该句柄，跨数据库的领域 Port 仍按下述幂等/回执协议处理。

Declarative Pack 使用内置有界 Schema/Command 存储；复杂聚合用受审查 TrustedCode Handler；第三方 Isolated 只返回候选 Command。Core 控制权不可通过“插件 handler”转授。

普通动作可用框架提供的候选/Artifact 存储，不必创建自有 Repository 和数据库迁移。已有领域数据库通过正式 Port 提供带版本的输入和结果提交；跨数据库 Command 使用幂等与回执，只有 ABH 权威库内记录适用同事务保证。不能为了接入 ABH 要求迁移全部原业务数据。

Versioned Domain Reference 在 SDK 通用 Ref 上扩展领域 type，不扩 Core enum。第二领域引入无法表达的共性时先改公共 RFC/契约并迁移，不在 Core 写 domain-specific if。

## 4. CTK 组成与输入输出

CTK 输入：suiteVersion、implementationManifest、profile、capabilityClaims、fixtureSet、environmentDigest、seed。输出：subjectDigest、suiteVersion、caseResults、claimedCapabilities、knownDeviations、environment、started/finishedAt、artifactRefs、reportDigest、signatureRef。

Core 测公共状态/权限/恢复；Domain 测 Schema/所有权/扩展边界；Connector 测副作用/Unknown/限流/查回；Adapter 测取消/版本/故障；Workbench 测裁剪/Command/状态展示。测试通过不代表业务价值、统计正确或绝对安全，需独立领域/安全评测。

可选能力在 CTK 明确 claimed=false，不假测通过；生产请求未声明能力时拒绝。结果由运行方签名，Official 需公开维护者验证责任；签名不提升 Pack Trust Mode。

## 5. 主流程和恢复

CLI 建临时隔离测试环境 → 校验 Artifact/Digest → 注入 Fake/故障点 → 跑同一 Contract Fixture → 保存每 case 证据 → 汇总报告 → 校验摘要/签名 → Distribution 收录。

环境中断报告 Incomplete，不能把未跑 case 当 pass；继续跑须验证同 subject/suite/环境，完整报告引用全部子结果。第三方测试代码不能在生产宿主执行。联网集成用公开可得账号仅作附加能力门禁，不阻塞离线 Core CTK 的独立复现。

## 6. 兼容与质量

API Extractor 对比 exports，Changesets 声明破坏性变更；TypeDoc 生成引用，示例作为 clean-room 编译/运行测试。Stable 1.x 验证已存在的 N/N-1/N-2 组合，0.x 只列实测矩阵；废弃先给替代接口和迁移工具，不用“SemVer”文字代替兼容测试。

公共包行覆盖 ≥ 85%、分支 ≥ 80%，安全关键可达分支 100%；Property/Fuzz/Mutation 针对序列、权限与解析边界，避免只写实现镜像测试。报告不得包含真实客户数据或秘密。

## 7. 配置、诊断与通用性门禁

ctk.seed 默认固定公开值、ctk.caseDeadlineSeconds=60、ctk.networkMode=offline；真实 Provider CTK 需显式 profile/allowlist/费用上限。`abh doctor sdk` 检查版本、exports 与模板兼容，错误 CONTRACT_VERSION_UNSUPPORTED、CTK_INCOMPLETE、PRIVATE_DEPENDENCY_REQUIRED 必须可定位。

1.0 前 Marketing 和第二异质 Domain Pack 均须只用 SDK 完成真实闭环；hello-business 只证明上手。若需要访问 internal 或 fork Core，通用性门禁失败，先修扩展合同。

上手验收由未参与实现的开发者在公开文档下完成：一个直接运行依赖、一个业务源码文件、一份环境配置、零手写基础 Adapter，主动操作 ≤ 15 分钟。分别验证不装 web/Pi 的独立 Action、默认 Pi 的 Mission、使用自有前端审批，以及无需运行 ABH 即可读取标准导出。用户自写行数与生成文件数分开报告，现有业务 Connector 的专业实现不冒充零成本。

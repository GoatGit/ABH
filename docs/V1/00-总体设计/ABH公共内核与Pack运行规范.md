# ABH 公共内核与 Pack 运行规范

> 规范级别：Normative public-core and extension baseline
>
> 版本：1.8
>
> 日期：2026-09-07
>
> 适用范围：`@abh/*`、Domain Pack、Connector Pack、Adapter 和 Workbench Extension
>
> 上位架构：[Agentic Business Harness 总体设计](Agentic-Business-Harness总体设计.md)

## 1. 目的

本文定义 ABH 领域中立公共内核、开放 Pack 的安装/执行边界、信任模式与符合性测试。Marketing 只是第一个 Domain Pack，不能为 ABH 公共类型、默认 Policy、错误码或数据库结构提供隐式特权。

## 2. 公共内核的最小语义

`@abh/core` 只实现下列领域中立能力：

| 公共语义 | 责任 | 不包含的领域语义 |
|---|---|---|
| Organization / Workspace | 租户、成员和显式跨组织协作边界 | 品牌—代理商、采购方—供应商等行业关系 |
| Mission / Run / Task | 长期目标、有界执行、Checkpoint、停止与恢复 | 广告活动、创意、采购单等业务对象 |
| Agent Invocation | 版本化 Definition、Context、Tool Binding、Budget、Verification | 具体 Agent 角色、Prompt 或专业输出 Schema |
| Responsibility / Decision | Goal、Authorization、Correction、Exception 责任和决定 | Brand Marketing Lead、Client Partner 等领域模板 |
| Grant / Policy / Authority | Scope、Purpose、额度、期限、职责分离、Mandatory Control Policy 与长期执行授权引用 | 由 Domain Pack 提供的 Behavior Policy，如营销频控、品牌或采购规则 |
| Action / Operation / Receipt | 可信副作用、幂等、Unknown、对账和补偿 | Campaign、Order 或 Ticket 动作类型 |
| Projection / Workbench Contract | 权限裁剪读模型和可用 Command | 行业导航、页面和展示文案 |
| Learning Signal / Candidate / Release | 证据、根因、独立评测、Scope 发布与回滚 | 营销/采购指标和领域知识 Schema |

公共 Core 不能导入 Domain Pack，不能以营销用例作为默认 Workflow，也不能用 `if domain == marketing` 类分支绕过扩展契约。

## 3. Package 与契约分层

```text
@abh/contracts          领域中立 Primitive、Envelope、State、Port、Error
@abh/core               Mission/Run/Responsibility/Control/Action/Learning 实现
@abh/domain-sdk         Domain Pack Manifest、Schema、Definition、Domain Behavior Policy 扩展
@abh/connector-sdk      Capability、Operation、Attempt、Receipt/Reconciliation 扩展
@abh/adapter-sdk        Agent/Durable/Identity/Secret/Object/Model 等技术 Port
@abh/workbench-sdk      Projection、Command、声明式 UI Extension
@abh/conformance        Core/Domain/Connector/Adapter/Workbench CTK

@lime-ads/marketing-contracts
@lime-ads/marketing-pack
@lime-ads/meta-connector
@lime-ads/product
```

`@abh/contracts` 不定义 Brand、Campaign、Creative、Experiment、Marketing Lead 或媒体平台状态。这些类型由 `@lime-ads/marketing-contracts` 依赖 `@abh/contracts` 定义。`@abh/core` 只通过 Manifest 和公开 SDK 装配领域实现，不反向依赖。

常用作者只直接依赖 `@abh/core` 的业务声明和 `@abh/core/client` 客户端；四个专业 SDK 面向需要自定义扩展的作者。server/CLI 按构建期能力清单装配 Adapter，Core 内部继续只依赖 Port；客户端子入口不包含服务端依赖。业务可从独立 Action 开始，不创建占位 Mission、Workspace 或学习对象，详见 [SDK 最小流程](../10-ABH详细设计/60-SDK与CTK详细设计.md#2-最小作者流程)。

## 4. Pack Manifest

每个进入生产 Profile 的 Pack 必须提供签名、内容寻址的 Manifest。常用路径由 `defineBusiness` 和构建工具生成，作者维护业务 Schema、动作、必要权限与可选 Agent，无需手写下列发行元数据；权限、用途与生产资源上限仍须明确声明。

```yaml
apiVersion: abh.open/v1
kind: DomainPack # DomainPack | ConnectorPack | RuntimeAdapter | WorkbenchExtension
metadata:
  id: org.example.procurement
  version: 1.2.0
  license: Apache-2.0
compatibility:
  abh: ">=1.0 <2.0"
trust:
  mode: Declarative # Declarative | TrustedCode | Isolated
capabilities:
  provides: []
  requires: []
permissions:
  dataClasses: []
  purposes: []
  commands: []
  toolCapabilities: []
  networkEgress: []
  secretClasses: []
resources:
  enforcement: None # None | HostProfile | IsolatedLimits
artifacts: []
migrations: []
conformance:
  suiteVersion: 1.0.0
integrity:
  manifestDigest: sha256:...
  artifactSetDigest: sha256:...
  packageDigest: sha256:...
  signatureFormat: application/vnd.dev.sigstore.bundle.v0.3+json
  signatureRef: signatures/pack.sigstore.json
  provenanceRef: provenance/pack.intoto.jsonl
  conformanceRef: conformance/pack.ctk.json
```

`requires` 是安装时硬依赖；只有特定 Workflow 使用的能力必须写在 Workflow Definition，不得被提升为整个 Pack 的安装必需。可选能力通过 Capability Query 显式降级，不允许在运行时静默猜测。

`permissions` 声明 Pack 及其 Artifact 可请求的最大权限包络，安装、签名或 CTK 通过都不会授予这些权限。每次运行的有效权限必须取 Manifest 包络、部署 Trust Policy、Organization/Workspace/Mission Scope、Workflow Requirement、Grant、Purpose、Mandatory Control Policy 和已分配 Domain Behavior Policy 的最小交集。Behavior Policy 可以加严限制和增加 Obligation，不得覆盖 Mandatory Deny 或扩大 Grant。未声明项不可请求；声明项也只有得到当前授权后才能使用。Declarative Pack 的 `networkEgress` 与 `secretClasses` 必须为空。

`metadata.id` 使用小写反向 DNS 命名并在首次安装后保持不变。生产部署必须配置 Signer Allowlist，并由部署 Trust Policy 将 Pack ID/命名空间绑定到允许的签名者身份；“签名有效”不等于“签名者有权发布该 Pack”。同一 `id + version` 只能对应一个 `packageDigest`，生产环境遇到不同 Digest 必须拒绝，降级或更换签名者必须是显式的受审计管理动作。

Capability 使用 `(kind, id, version)` 作为不可变身份，`id` 必须位于提供方 Pack 的命名空间或 Trust Policy 明确授予的共享命名空间。两个已启用 Pack 不得提供相同身份但不同 Schema/Digest；同一 Scope 内存在多个满足版本范围的实现时，必须由部署配置或 Capability Release 显式选择，Loader 不按发现顺序猜测。`requires` 解析必须形成确定性的有向无环依赖图；缺失、版本不兼容、自依赖或循环依赖均拒绝启用，并输出完整冲突链。

Artifact 和 Migration 条目必须分别携带 `ref`、`digest`、`mediaType` 和 `sizeBytes`，`ref` 在整个 Package 内唯一；加载器不从网络返回或文件名推断内容。完整性计算只采用一套无循环规则：

```text
manifestDigestBytes    = SHA-256(UTF8(JCS(manifest excluding the entire integrity object)))
artifactSetDigestBytes = SHA-256(UTF8(JCS(sortByUtf8Ref(
  map(artifacts,  x => {kind:"artifact",  ref:x.ref, digest:x.digest, mediaType:x.mediaType, sizeBytes:x.sizeBytes})
  ++ map(migrations, x => {kind:"migration", ref:x.ref, digest:x.digest, mediaType:x.mediaType, sizeBytes:x.sizeBytes})
))))
signaturePayloadBytes  = UTF8(JCS(["abh-pack-v1", lowercaseHex(manifestDigestBytes), lowercaseHex(artifactSetDigestBytes)]))
packageDigestBytes     = SHA-256(signaturePayloadBytes)
manifestDigest         = "sha256:" + lowercaseHex(manifestDigestBytes)
artifactSetDigest      = "sha256:" + lowercaseHex(artifactSetDigestBytes)
packageDigest          = "sha256:" + lowercaseHex(packageDigestBytes)
sigstoreBundle = CosignSignBlob(signaturePayloadBytes)
```

Loader 先逐项核验 Artifact/Migration 原始字节的尺寸和 SHA-256，再重算三个 Digest，不能只散列 Manifest 中自报的摘要。`artifactSetDigest` 覆盖两类条目的并集，`kind` 防止语义碰撞。整个 `integrity` 对象不参与 `manifestDigest` 计算，以避免自引用；其中签名格式与路径仅用于发现证明，不作为信任根。Digest 统一以 `sha256:` 加 64 位小写十六进制展示。

签名输入固定为上述规范 JSON 的 UTF-8 原文 `signaturePayloadBytes`；Cosign 对原文签名，Loader 重建同一原文交给 Cosign 验证，不再把摘要字节当作第二层消息。V1 接受 [Sigstore Bundle v0.3](https://github.com/sigstore/protobuf-specs/blob/main/protos/sigstore_bundle.proto)，媒体类型为 `application/vnd.dev.sigstore.bundle.v0.3+json`。部署方独立配置离线公钥，或 Fulcio 身份/Issuer 与 Rekor 验证策略，不信任包自带的根证书或仅凭 Key ID 授权。

`signatureRef` 必须绑定重建的原文；`provenanceRef` 必须指向经受信构建者签名验证的 SLSA/in-toto Attestation，其 subject 引用同一 `packageDigest`、构建来源和 Builder 身份。仅匹配摘要的未签名 Provenance 不构成来源证据。两项验证及签名者—Pack 命名空间绑定均通过后才接受制品，底层签名、DSSE 与证书验证复用 Cosign/Sigstore，不自研密码学。

JCS 采用 RFC 8785；YAML 先经有界解析转换为 JSON，拒绝重复键、别名扩张、非有限数及不受 Schema 允许的值。路径按规范 UTF-8 比较，禁止别名路径与大小写/Unicode 歧义。所有跨语言实现使用 Contract Package 黄金向量验证摘要与签名输入，生产版本不得自行变更算法。

CTK 先对确定的 Package Digest 执行，签名报告再由 `integrity.conformanceRef` 引用；该 Ref 与报告不参与被测 Digest，避免“报告含 Pack Digest、Pack Digest 又含报告摘要”的循环。报告签名者、Suite 版本和环境必须满足独立部署策略；移动或替换证明路径不能改变授权，缺失或无效证明拒绝启用。

Package 容器必须只包含 Manifest 声明的 Artifact/Migration 与引用的签名、来源和 CTK 证明；Loader 拒绝未声明 Payload、重复路径、绝对路径、`..` 穿越、符号/硬链接和解压后超出数量或尺寸上限的内容。验证在任何执行、解析 Policy 或 Migration 之前完成。

`resources` 是按 Trust Mode 分支的必填策略：Declarative 使用 `enforcement: None` 且不得声明可执行配额；TrustedCode 使用 `HostProfile + profileRef`，由宿主进程/容器控制；Isolated 使用 `IsolatedLimits` 并明确 CPU、内存、进程、临时磁盘、输出和墙钟上限。策略缺失、负数或超过部署上限都拒绝加载；数值 `0` 只表示不允许使用该资源，不表示无限。

## 5. 三种信任模式

| 模式 | 允许内容 | 执行边界 | 适用 |
|---|---|---|---|
| **Declarative** | JSON Schema、Agent/Workflow Definition、无 I/O Domain Behavior Policy、Evaluation Dataset、Projection/UI Schema | 由 ABH 解释器执行；无任意代码、文件、网络、Secret 或数据库访问 | 第三方 Domain Pack 默认模式 |
| **TrustedCode** | 通过公开 SDK 的同进程 TypeScript 扩展和数据库 Migration | 被视为与 ABH 服务相同信任级的完全受信代码；只能构建期静态注册，升级需重启 | 官方 Pack 或部署方完成代码/安全审查的 Pack |
| **Isolated** | Tool、转换、评测、Connector/Adapter 等可执行扩展 | 独立进程/容器/微虚拟机，只经受限 Port；最小网络/数据/Secret/资源授权 | 第三方可执行能力 |

签名和 Digest 只证明来源与内容没有被替换；SBOM/扫描用于发现已知供应链风险；CTK 只证明契约符合。三者都不能将未审查代码变成安全代码。

`abh-dev` 可在用户显式开启 `allowUnsignedLocalPacks` 时加载本地未签名 Pack，但必须标记 `DevelopmentOnly`，只能使用 Fake/模拟 Connector，不得获得真实 Secret、网络出站或外部写入能力。该配置或未签名 Pack 出现在生产 Profile 时必须启动失败，不做静默降级。

Trust Mode 是执行边界，不是可由 Pack 自己声明后立即获得的信任。部署方按策略将请求模式收紧为实际模式：不可将未审查代码提升为 TrustedCode。TrustedCode 与宿主同进程，因而 SDK 封装和依赖 Lint 只是工程护栏，不是恶意代码隔离；不能承担此信任的执行代码必须使用 Isolated。Pack Migration 由部署方 Migration Runner 以 Pack 专用数据库角色执行，数据库权限是最终执行边界，只允许改变 Pack 拥有的 Schema；任何 ABH Core Schema 变更必须作为 Core Migration 独立审查。

Declarative 和 Isolated Pack 的 `migrations` 必须为空；它们通过已登记 Schema/Command/Port 保存自有数据。只有已被部署方审查为 TrustedCode 的 Pack 可携带 Migration，且 Loader 必须在执行前验证目标 Schema、声明的操作类别、专用角色、事务性、Dry-run、备份点和回滚/前滚计划。不额外自研一个 SQL 安全解析器代替数据库权限和代码审查。模式与 Migration 不匹配时直接拒绝安装。

V1 不支持未知第三方 JavaScript 在 ABH 主进程或 Workbench 同源上下文中动态执行。Workbench Extension 默认只提供声明式 View Schema 和已注册 Command；解释器必须拒绝脚本、任意 HTML、动态组件导入、未登记 URL/资源和 Manifest 外 Command，文本默认转义并由宿主 CSP、字段裁剪和导航允许列表继续约束。受信前端代码必须与产品构建一起审查、锁版和发行。

## 6. Pack Loader 与生命周期

```text
Discover configured package
→ bounded archive scan and bounded Manifest parse
→ validate Manifest Schema and declared paths
→ recompute artifact/package digests
→ verify signature/signer/provenance/license policy
→ resolve ABH/Pack/Capability compatibility and reject dependency cycles/conflicts
→ evaluate deployment Pack Trust Policy
→ run static dependency, schema and migration checks
→ verify signed CTK evidence or execute CTK in an isolated test environment
→ stage definitions in a versioned registry namespace
→ evaluate migration / data / projection impact
→ if data changes: isolated dry-run, verified safety point, dedicated-role migration
→ verify applicable schema, backfill, invariants and projection changes
→ enable immutable Pack Version in a deployment allowlist
→ monitor / suspend / rollback
```

Pack Loader 属于 Trusted Runtime Control，是 Installed Pack 及其安装、可用、禁用、升级和回退状态的唯一 Owner。V1 使用静态配置与构建期注册；不建设远程插件市场、运行时 npm 安装或自动启用新 Pack。

无 Migration 且不改变既有数据/投影的声明包只保存经校验的“不适用”影响报告，不创建数据库副本、空迁移或回填作业。实际数据变更必须完成相应演练、安全点和验证。构建期完成编译与适用 CTK，安装验证其证据；同一制品正常重启只校验内容完整性、当前信任/兼容/撤回与登记状态，不重复全量 CTK 或迁移。证据所绑定的环境、策略或兼容要求变化时重新验证对应项。

“Pack 可用”只表示该版本已通过供应链、兼容与部署允许列表，不表示它已被分配给某个 Organization、Mission 或 Run。Capability Release Controller 是 Agent/Prompt/Workflow/Tool/Domain Behavior Policy/Model Route 等行为版本组合、Shadow/Canary 和 Scope Assignment 的唯一 Owner，只能引用已安装且可用的 Pack 内容。Capability Registry 只解析运行能力版本、兼容性与健康；三者不共享安装、发布或分配写权。Capability Assignment 按固定 Scope 优先级为每个行为槽位解析唯一有效版本，在授权评估前提供精确 Behavior Policy/行为输入，但它不授予 Grant 或扩大 Scope。Mandatory Control Policy 由 Trusted Runtime Control 独立发布，Pack 和 Capability Release 均不能替换或放宽。

Pack 启用只能注册 Manifest 允许的 Definition/Schema/Projection/Capability Requirement，不能直接生成 Grant、改写 ABH 表、注册新 Core Owner 或绕过 Tool Gateway/Action Engine。Pack 内容更改必须使用新版本与 Digest；运行中 Mission/Run 固定解析后版本，不热换业务语义。迁移执行失败时保持新 Pack Version 未启用，优先在事务内回滚；已完成的非事务步骤按预先审核的前进修复或安全点恢复处理，不得绕过验证强行启用。

Pack 对自有数据通过公开 SDK 的持久化 Port 访问：宿主注入当前 Tenant/Purpose、事务与 Pack Schema 句柄；Domain Owner 提交自有对象和同事务 Outbox，持久化 Adapter 只执行存储。Declarative/Isolated Pack 使用有界 Schema/Command 存储，TrustedCode 可注册经审查的自有 Repository；均不得获取 ABH Core 表句柄。静态注册足以实现这一边界，无需通用低代码数据库或运行时 Schema 编辑器。

CTK 执行与生产数据库迁移是两个独立信任边界。Loader 可验证已签名、与 Pack Digest/环境匹配的 CTK 证据，或在一次性隔离测试环境执行 CTK；不在生产宿主进程中直接运行 Pack 自带的未受信测试代码。Migration Runner 则只执行已经完整性、来源、代码和 Dry-run 审查的 TrustedCode Migration，并使用与 ABH Core 分离的 Pack 专用角色。

上述边界对 Declarative 由解释器强制，对 Isolated 由 Port 和隔离运行时强制，对 TrustedCode 由受信发行、代码审查、包导出约束、限权运行身份和数据库角色共同保证。系统不对 TrustedCode 做虚假的进程内安全承诺。

## 7. Isolated Extension 协议

Isolated Extension 不能作为 Mission、Decision、Grant、Action、Operation、Receipt 或 Capability Release 的状态 Owner。它只能通过已注册 Port 接收版本化 Ref 和针对当前 Extension Target 签发的短时 `AuthorizedRequestContext`，返回 Schema 校验后的候选结果或平台观察。它不能使用该上下文为新 Action 签发授权；新副作用仍须由宿主以 Action Target 重新 Preflight。

运行时必须强制：非 root、只读根文件系统、无宿主 Socket/设备、CPU/内存/进程/磁盘/输出/墙钟限制、默认无网络、显式出站允许列表、阻断元数据端点/DNS Rebinding、一次性 Input/Output Grant、租户独立工作目录、结束后强制清理。Secret 只能由 Secret Broker 按 Extension/Operation 短时下发，不进入 Manifest、环境快照、日志或模型上下文。

## 8. CTK 与符合性声明

| CTK | 核心证明 | 不证明 |
|---|---|---|
| Core CTK | 公共状态、Owner、Context、幂等、撤权和恢复不变量 | 某个领域具有业务价值 |
| Domain Pack CTK | Manifest、Schema、Workflow、Projection、Migration 不绕过 Core | 领域输出的专业正确性 |
| Connector CTK | Capability、限流、原生或稳定标记幂等、Unknown、重复检测、Receipt 和对账契约 | Provider 永不变化或不超投 |
| Adapter CTK | Port 替换后的取消、错误、恢复和版本语义 | 实现没有未知漏洞 |
| Workbench CTK | Projection 裁剪、Command 权限、Unknown/Stale 呈现 | UI 具有足够可用性 |

符合性结果包含 Pack Digest、CTK/案例版本、运行环境、通过/失败、已知偏差和签名证据。声明等级为 `Community`、`Verified`、`Official`，只表示支持与验证责任，不改变 Pack 的 Trust Mode。

兼容承诺与稳定级别绑定：Stable 公开 API 在 1.x 内至少验证当前与最多两个已实际发布的前序次版本组合；Preview 只承诺当前与一个已发布前序次版本的有界迁移；Experimental 不承诺跨版兼容。初次发布不为不存在的历史版本制造虚假证据；0.x 发行不得用 N/N-1/N-2 文案暗示 1.0 稳定性，只按 `compatibility.yaml` 公布已验证组合。

## 9. 升级、迁移和回滚

升级采用 `Install Side-by-side → Impact Check → 适用的数据迁移与验证 → Pack Enabled → Capability Release → Scope Assignment`。静态版本按部署方确认的配置，经 Release Owner 校验对应 CTK/兼容/责任证据后生成基线分配，无需 Learning Candidate 或 Canary 作业；声明在线学习或灰度发布的能力必须通过独立评测和相应 Shadow/Canary 门禁。高风险变更仍按其 Policy 触发责任与验收，静态配置不能豁免。

实际数据库变更遵循 Expand → Compatible Code → Backfill → Verify → Contract；Pack Migration 通过 Migration Port 受控执行。Contract 步骤只在旧 Pack/Code 已退出、回滚窗口和数据兼容证据满足后执行。

回滚前验证旧 Pack 仍理解当前 Contract/数据；破坏性数据变更使用前滚修复，不强制旧代码读新数据。运行中 Action/Operation 保留原 Connector 版本直到对账结束；紧急安全撤回先冻结新执行，不改写历史。

## 10. 测试与验收

必测：签名/Digest 错误、Manifest 超限和 Schema Bomb、不兼容版本、未声明 Capability/出站/Secret、Pack 尝试访问 Core Internal/数据库、迁移失败、启用并发、运行中版本固定、暂停/回滚、隔离扩展越权/资源耗尽/网络外传和符合性证据伪造。

ABH 1.0 必须由 Marketing 与至少一个异质 Domain Pack 只通过公开 SDK/CTK 运行；第二领域如需 fork Core、新增领域特例或直访内部表，则通用性验收失败。

## 11. 防止过度设计

V1 的 Pack Loader 只实现静态发现、校验和构建期注册。Declarative 由内置解释器执行，TrustedCode 随发行版审查和锁版；需要 Isolated 的 Pack 仅在当前 Profile 已提供通过 CTK 的 `IsolatedExtensionPort` 时启用，并复用 Sandbox/Worker/容器隔离，不建通用 FaaS 平台。缺少该能力时 Loader 显式拒绝 Isolated Pack，不降级到 TrustedCode。V1 不建远程市场、在线代码编辑器、自定义包管理器或第二套权限/发布系统。

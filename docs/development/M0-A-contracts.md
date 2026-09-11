# M0-A 第二批：Action/Decision 与传输契约

日期：2026-09-07。状态：本批代码与本地验证完成，M0-A/G01 尚未整体验收。所有 HTTP 操作仍为 ContractOnly；没有数据库、HTTP Server 或真实派发能力。

## 范围与设计来源

| 工作 | 分类及复用 | 输出与验证 |
|---|---|---|
| Action、Plan、Decision | 必要业务补缺；沿用 JSON Schema 2020-12/Ajv | [workflow.schema.json](../../packages/contracts/schemas/workflow.schema.json)，生成类型/校验器、合法与拒绝 Fixture |
| Command/Query/Event/Job | 薄适配；沿用 Schema、状态和错误注册表 | [协议注册表](../../packages/contracts/protocol/registry.yaml)，封套、OpenAPI、权限 Action/错误登记 |
| HTTP 表示 | 薄适配；不新增 HTTP 框架 | [HTTP 辅助函数](../../packages/contracts/src/http.ts)，头部一致性、有限查询转换、响应字节校验 |
| 业务摘要 | 薄适配：canonicalize 4.0.0（Apache-2.0）+ Web Crypto | [摘要函数](../../packages/contracts/src/digest.ts)，RFC 8785 向量、SHA-256 已知向量、集合与恢复负例 |
| 跨字段约束 | 必要业务补缺 | 有界 DAG、节点 Scope/Connector、嵌套 Effect、64 KiB 决定包、版本与时间关系 |

来源为详细设计 [01 公共契约](../V1/10-ABH详细设计/01-公共契约与错误模型.md)、[05 Contract Package](../V1/10-ABH详细设计/05-Contract-Package与一致性检查.md)、[25 Action](../V1/10-ABH详细设计/25-Action-Engine详细设计.md)、[26 Operation](../V1/10-ABH详细设计/26-Operation与Reconciliation详细设计.md)、[41 Decision](../V1/10-ABH详细设计/41-Decision详细设计.md) 和 [60 SDK](../V1/10-ABH详细设计/60-SDK与CTK详细设计.md)。未引入第二套 Schema、工作流、授权或重试引擎。

## Preview 线格式选择

- 客户端 `ProposeActionPayload` 只携 actionType、targetRefs、payloadRef、sourceVersionRefs、sourceProposalRef；`ActionProposal` 增加的 completionPolicyRef/resourceRequirements 由受信定义与 Owner 解析。首批创建目标限定为现有 `abh.organization`，上传 Artifact 和业务输入适配将在公开客户端实现。
- Action/Operation 查询与记录采用 `position: { lifecycle, outcome }`，引用同一状态组合 Schema。数据库约束仍使用 lifecycle/outcome 两列。独立 Proposed Action 不要求 Authority、Plan 或占位 Mission/Run；进入 Authorized 及执行阶段才要求完整引用。
- Plan 内嵌有界 `nodes`，每节点 `dependsOn` 表达边；最多 1,000 个节点、每节点最多 32 个依赖。节点引用精确 Connector，Scope 必须在 Plan 声明集合内。父输出绑定携 JSON Pointer、parentNodeKey、outputName、注册 valueType，必须声明依赖。实际父 Receipt、注册输出类型、资源求和及批准上界由 Owner 核验。
- Decision Package 包含完整问题、推荐、备选、风险、证据、影响和所见版本，`packageDigest` 排除自身。批准响应为 `Approved`，条件单独保存为注册 `abh.condition` 引用；拒绝为 `Rejected` 且必须有理由。决定状态与 Effect 状态分别返回，Applied 必须有 Owner Receipt，Blocked/Abandoned 必须有失败证据。
- Event 类型从状态注册表生成；`actorRef` 使用公共 Actor 快照表示，`eventOrdinal` 从 0 开始，aggregateRef.version 与 aggregateVersion 必须相同。payload 仅含 changedFields/factRefs，事件不继承 Context 或 Authority。
- Job 只登记 Action 推进、Operation 对账、Decision Effect 三类唤醒。准备/批准等待可以没有 authorityRef，对账必须明确查询 Authority 引用；所有唤醒仍需重新创建可信 Context 并重验权限。Job 表示通过不能充当长期授权票据。

## HTTP 与摘要边界

公开命令为 propose/cancel/request-authorization、decision submit/withdraw；查询为 Action get/list、Decision get/inbox。ValidateAction/RegisterOperationPlan 仅有内部 Command 合同。生成的 OpenAPI 明示 `x-abh-runtime-available=false` 和逐路由 `Unavailable`，没有可用服务地址。

修改命令必须有强 `If-Match: "<version>"`；创建命令拒绝 If-Match/expectedVersion。所有公开命令必须有 Idempotency-Key。正文若重复携带幂等键或版本，必须与 Header 相同；弱 ETag、重复头、版本溢出和未知命令均拒绝。解析函数不生成 commandId，不签发 Context。Query 只转换登记的 limit，不隐式转换 JSON Body 或应用默认值。

Schema 的 `x-abh-digest-fields` 列出摘要字段，`x-abh-set` 标记集合。集合按元素的 JCS 字符串，以 UTF-16 码元顺序排序；普通数组保留顺序；同一实体或能力的冲突版本拒绝，不能静默去重。Command 摘要包含 type/target/payload/expectedVersion，排除 commandId/schemaVersion/idempotencyKey；租户、Principal、commandType 和幂等键仍由 Owner 的唯一键隔离。

PinSet、OperationPlan 摘要排除记录 Ref 和摘要自身；Authority 签发摘要排除 authorityRef/issuanceDigest/status，使历史撤销不改变原签发内容。摘要函数接收完整且表示合法的记录，返回预期摘要；创建时可先使用合法的占位摘要，Owner 再写入计算结果。Fixture 中外部 Artifact 等摘要仍是形状样本，不表示已有真实 Artifact。文件摘要使用原始字节；JSON 摘要拒绝非法 Unicode、NaN/Infinity、循环、稀疏数组、getter/toJSON 和非 JSON 值，限制深度 64、访问节点 100,000、编码结果 1 MiB。

`checkPinInput` 比较主体 type/id、subjectInputDigest、requiredSlotsDigest 和实际槽位完整性，允许单纯生命周期 version 增长。相同主体但异语义输入返回 PIN_INPUT_CONFLICT。它不执行数据库查回、提交、重新分配或权限检查。

## 验证和后续

本批 `pnpm check` 本地通过：151 项测试、0 失败/跳过；33 个生成制品字节无漂移，TypeScript 与构建通过。验证覆盖 RFC/JCS 向量、浏览器无 Node 依赖执行、协议生成负例、嵌套关系与 Unknown 组合、Header/Body 冲突、响应越界、Pin 输入/缺槽位冲突。环境和依赖锁摘要见 [验证记录](verification-2026-09-07-contracts.json)。

后续仍需配置元数据、对象/动作/用途目录、Port、状态/文档映射与发行兼容清单，再由登记负责人完成 G01 验收。M0-B/C 的 PostgreSQL 隔离、CAS、唯一键、事务崩溃、真实授权和 Fake 外部状态验证尚未执行；当前纯函数测试不替代这些证据。没有新增自动放行的 Owner Guard，也没有签署任何工程门禁。

# Definition 与 Workflow Registry 详细设计

> 版本：1.1 · Owner：Agentic Core Maintainer · 内部模块 `definitions`
>
> 装配与权限来源：[Pack Loader](29-Pack-Loader与Capability-Registry详细设计.md)。

## 1. 定位

保存已安装 Pack 的不可变 Agent、Workflow、验收与工具需求定义，为 Run 返回精确版本。安装资格属于 Pack Loader，行为选择属于 Capability Release，Definition Registry 只拥有定义内容和编译结果。

主用例：安装包后登记；查询某个版本；编译有界 Workflow；拒绝循环/未知能力；新旧版本并存支持旧 Run；撤回后限制新使用但保留审计引用。

## 2. 数据与字段

| 定义 | 必填字段 |
|---|---|
| AgentDefinition | id/version/packDigest、responsibility、instructionsRef、input/outputSchemaRef、allowedToolRequirements、delegationAllowlist、verificationProfileRef、limits、localeSupport |
| WorkflowDefinition | id/version/packDigest、inputSchemaRef、nodeTemplates、edges、branchRules、completionPolicy、stopConditions、capabilityRequirements、resourceEnvelope |
| NodeTemplate | nodeKey、kind、inputBindings、outputSchemaRef、required、timeout、retryPolicyRef；Agent 节点增加 agentDefinitionRef |
| CompiledWorkflow | definitionDigest、compilerVersion、node/edge 表、capabilityManifest、validationReportRef、digest |

core.definition_versions 唯一键 kind/id/version，附 ownerPackDigest；同一身份不同 Digest 拒绝。core.workflow_compilations 唯一键 definitionDigest/compilerVersion。索引 packDigest/kind 供禁用影响分析；内容不原地更新。

## 3. 接口

| 接口 | 输入 / 前置条件 | 输出 / 错误 |
|---|---|---|
| RegisterDefinitions（Internal） | enabled/staged Pack Ref、artifactRefs；Loader 签发安装上下文 | definitionsRefs；DEFINITION_ID_COLLISION |
| CompileWorkflow（Internal） | workflowRef、compilerVersion | compiledRef / WORKFLOW_INVALID_GRAPH |
| GetDefinition（Port，Preview） | exactRef、Context | 可见定义摘要/Artifact Ref；DEFINITION_NOT_AVAILABLE |
| ResolveWorkflowRequirements | exactRef、allowedCapabilitySnapshotRef | 缺口列表与可运行性；不自行选择新版本 |
| RetireUse（Internal） | pack/release restrictionRef | 禁止新选择的投影；历史定义仍可查询 |

公开类型在 domain-sdk，持久记录与编译器 Internal。普通用户 Query 只返回名称、作用和适用任务；系统 Prompt 需开发者/安全角色且用途允许。

## 4. 编译规则与主时序

SDK 构建业务声明 → 使用共享验证器生成不可变定义/编译结果 → 适用 CTK → Loader 验签/兼容并登记 → Pack 可用 → Release 选择 → Run 按 exactRef 固定。独立 Action 不生成 Workflow；启用单 Agent 且未自定义流程时，SDK 使用固定的单 Agent → 验证 → 提案模板。作者无需先学习图结构。

Compiler 是 SDK 构建和 Registry 共用的纯验证/编译库，无独立服务。正常启动加载已验证的精确产物；仅新定义、编译器变化或确有需要的动态 Graph Patch 执行相应验证，不重复构建全部 Workflow。

编译至少检查唯一节点、无环、最大深度、必需输入可供给、依赖类型可兼容、Branch 汇合规则、超时/停止、工具权限与预算总包络。条件表达式只使用封闭 JSON AST（比较、布尔、注册字段），由确定性解释器求值；不允许 eval、脚本或 arbitrary SQL。

动态 Graph Patch 复用同一验证器，但不能改变已开始节点。复杂循环以新 Run 表示，V1 不实现任意循环工作流语言。

## 5. 失败与恢复

登记事务写定义、编译 Ref 和 Outbox。中途失败保持 Pack Staged；重跑按 Digest 幂等。新编译器不能覆盖旧编译结果；旧 Run 继续读原组合。缺引用时返回精确 dependency path，不动态下载 npm 或猜测默认 Agent。

撤回 Definition 的新使用权后，Run 重验 Assignment；已经完成的产物仍可审计，危险执行停在安全点。数据库丢内容时按已验证 Pack Artifact 恢复相同 Digest，校验不一致则隔离。

## 6. 约束、配置与验收

配置 definition.maxArtifactBytes=1 MiB、workflow.maxNodes/depth 继承 NFR、compiler.allowedOperators 由发行锁定（非租户可改）。注册/编译在 Worker 执行，API 只持久受理；查 exactRef p95 20 ms 预算，版本缓存按 Digest 有界，撤回有效性不从静态缓存决定。

日志和审计记录 packDigest、definitionRef、compilerVersion、errorPath。`abh doctor definitions --pack` 输出缺能力、Schema/编译版本与拒绝原因。默认无网络；全部源码/定义由静态 Pack 提供。

测试：同 ID/version 改内容拒绝；图有环、悬空边、缺输入、越界 Tool、无停止条件；新旧编译器共存；Run 重启仍原 Definition；Prompt 注入不能修改模板工具列表；禁用后历史可读而新执行受阻。

将 Agent Registry 与 Workflow Library 合并，是因为两者同属 Pack 不可变定义和精确版本解析；运行图状态、模型 Loop 和发布权分别留给 Run、Pi 和 Release。编译性能与 Domain 作者易用性由 Core Maintainer 在 M0 CTK、第二领域接入前验证。

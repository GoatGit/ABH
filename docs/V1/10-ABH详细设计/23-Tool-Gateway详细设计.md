# Tool Gateway 与 Binding 详细设计

> 版本：1.1 · Owner：Tool Runtime Maintainer · 公共 ToolProtocolPort / ToolCapability（Preview）

## 1. 能力模型

Agent 只看到 Read、Compute、Propose 三类能力。Side-effect Dispatch 仅供 Trusted Worker；模型不能获得 Connector SDK、Shell、任意 SQL 或通用浏览器管理员权限。

Tool Capability 定义 id/version、input/outputSchemaRef、effectClass、purpose/dataClasses、resourceRequirement、deadline、concurrencyKeyRule、allowedCallerTypes、implementationRef。Definition 声明需求，Control 决定本次可用范围。

Compute 表示无正式业务变更的计算；概率生成必须标明 Model Job 和独立验证，不宣称结果可复现。需付费的生成/查询同时经过 Resource Ledger。

## 2. Binding 与调用记录

control.tool_bindings 保存 bindingId、invocationRef、capabilityExactRef、authorizedSnapshotRef、scope/purpose、callLimit、deadline、epochVector、statusRef；唯一调用计数在数据库原子更新。

execution.tool_calls 保存 bindingId/callKey 唯一、argumentDigest、resultArtifactRef、commandReceiptRef?、usageRef、startedAt/completedAt、statusRef=ToolCall、operationRef?。正文走 Artifact，日志只含摘要；外部结果从引用的 Operation 读取，不另建 Tool Outcome 枚举。

## 3. 契约

| 接口 | 输入 | 输出 / 特有错误 |
|---|---|---|
| BindTools（Internal Factory） | createdInvocationRef、taskSpecRef、authorizedContextRef、resolvedCapabilities | bindingRefs + Agent 可见 Schema；TOOL_REQUIREMENT_UNSATISFIED |
| InvokeTool | bindingRef、callKey、arguments、targetRefs、Invocation Context | Read/Compute Artifact 或 Propose Command/Action Ref |
| RevokeBindings（Internal） | scope/epoch/causeRef | 停止新调用；在途结果交 Owner |
| InspectToolCall | callRef | trackingRef、outcome、cost、错误摘要 |
| ToolProtocolPort.invoke | 以上同源字段 + transport metadata | 同一 ToolResultEnvelope；不附新的权限语义 |

相同 callKey 不同 arguments 返回 TOOL_IDEMPOTENCY_CONFLICT。Propose 工具的业务幂等键固定为 invocation/task/semanticProposalKey，重试回读 Owner Receipt。新的 Invocation 需要根据原 Proposal Ref 识别已提交意图，不能仅换 key 重建同一外部 Action。

## 4. 主时序

Gateway 接收 → 验 Binding/Caller/Schema → 当前 Resolver 重验 Target 与用途/epoch → 原子调用次数与资源预留 → 调用受信 capability → 校验输出来源/Schema → 保存 Artifact/Receipt Ref → 返回裁剪观察。

Binding 在 Invocation Created 阶段只能登记，在完整合同固定且 Invocation Running 后才可调用。Binding 指向权限包络和 Epoch，短时 Snapshot 过期时由 Resolver 基于当前 Task/MissionAuthority 重签本次 Target 的上下文；不延长原 Snapshot 或恢复已撤销 Binding。固定 Task/能力上限保持原值。

Propose 路径只调用 Domain/Human/Action 提案 Application Port；新 Action 仍按自身 Target Preflight，不继承 Tool Snapshot。Read 也需限制响应字段和最大字节，查询 HTTP POST 不等于业务写入。

工具外部调用前以 Gateway Call 记录、当前 fence 与 capacity/cost 预留一起提交出站资格；出口再验有效期，可能已受理的请求不因网络超时释放资源。费用只由实际 Provider 出站 Owner 预留/结算：Tool 内调用 Model Gateway 时引用 modelCallRef，不再次扣同一费用；Tool 额外服务费使用独立来源。重复 callKey 回读原记录不重复消耗调用配额。

## 5. 失败与取消

绑定过期在调用前拒绝；授权变化中止未开始调用。外部读/计算超时按显式重试预算执行；付费未知保留费用责任。Propose 已提交但响应丢失，恢复先用 callKey 查询 Command Receipt，不再执行提案。

输出 Schema 错误保存隔离 Artifact 并返回 TOOL_OUTPUT_INVALID，不能让模型使用未验证结果继续正式提交。Task 取消后迟到 Tool 输出只保存观察，不自动进入新 Task。

MCP 只在跨进程/第三方互操作门禁后启用。Remote Tool 仍使用同一 Binding、限额、用途与审核；MCP Server 自报工具描述不构成信任，工具注册及变更须通过 Pack CTK。

## 6. 配置与运行

tool.maxInputBytes=64 KiB、tool.maxOutputBytes=256 KiB、tool.maxParallelReads=4、tool.defaultDeadlineMs=15000；Binding 的更小值优先，缺少 effectClass 拒绝注册。超大结果先保存 Artifact 并返回有界引用，不截断决定性字段。

内部 Gateway 校验预算 p95 20 ms，不含 Provider；Metric tool_denied、call_limit、output_invalid、receipt_reuse、call_latency。`abh doctor tool --call` 输出 Binding/版本、Scope、最后已提交 Receipt 与安全重试选项。

默认同进程调用；Sandbox、Secret 和网络策略由 [Secret/Isolation](31-Secret与Isolation详细设计.md)提供。未知外部 Tool 不动态执行主进程代码。

## 7. 验收与合并理由

测试逐个验证：Agent 看不到 Dispatch；Binding 属于别的 Invocation；同 key 异参；原子 callLimit；付费超时；Propose 响应丢失；超大/恶意输出；MCP 试图扩大 Scope；取消期间回执。断言无 SDK/秘密泄漏和重复 Command。

Binding Factory 与 Gateway 合在一个模块以保持发放/重验协议一致；授权决策、模型传输、Action 执行和隔离运行时仍有独立 Owner。

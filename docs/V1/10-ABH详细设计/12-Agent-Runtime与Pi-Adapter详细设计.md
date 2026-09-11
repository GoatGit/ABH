# Agent Runtime 与 Pi Adapter 详细设计

> 版本：1.2 · Owner：Agent Runtime Maintainer · Adapter 包：`@abh/adapter-pi`
>
> 固定参考：`@earendil-works/pi-agent-core@0.85.1`、同版 pi-ai；MIT 上游经 Apache-2.0 Adapter 接入。

## 1. 责任与公开 Port

Pi Agent 是复用的开源 Agent Harness 组件，提供模型—工具循环；Pi Adapter 是 ABH 对该组件的适配层，负责合同/事件归一化、Gateway 注入、预算停止和取消，不拥有 Run、Task、领域状态或授权。内部使用 Pi Agent 类型；公开 exports 为 `createPiAgentRuntimeAdapter`，其输入输出全部使用 `@abh/contracts/ports`。

模型—工具循环直接复用 Pi Agent；ABH Adapter 只做合同映射、Gateway 注入、事件转换和有界停止。通用推理规划、反思、工具循环和 Transcript 管理优先沿用上游公开能力，ABH 不再实现一套同类引擎。业务目标、来源/用途回验、正式 Checkpoint 与结果提交保留在对应 Owner，防止上游内部状态成为第二份业务事实。

| AgentRuntimePort 方法 | 输入 | 返回 |
|---|---|---|
| invoke | invocationRef、AgentTaskContract、contextManifestRef、bindingRefs、AuthorizedContextRef、AbortSignal | InvocationHandle：inspect/cancel + 异步 RuntimeEvent 流 + completion |
| continue | invocationRef、checkpointRef、resumePermitRef、AbortSignal | 同一 Handle 协议；仅通过恢复验证后允许 |
| cancel | invocationRef、reason、stopEpoch | cancellation receipt；不表示远端副作用撤销 |
| inspect | invocationRef | runtimeStatus、lastEventSequence、usageRef、stopReason?；正式状态回读 Run Owner |

AgentTaskContract 固定 goal、inputRefs、definitionRef、outputSchemaRef、acceptanceRef、modelRouteRef、toolBindingRefs、token/cost/turn/toolLimit、deadline、noProgressRuleRef、contextDigest。未知字段拒绝；输入变更创建新 Invocation。

## 2. Pi 接口映射

| Pi 能力 | 适配逻辑 |
|---|---|
| Agent.prompt / continue | 创建或恢复一个 Invocation；不加载 Pi 自有 Session 数据库 |
| streamFn | 必须注入 ModelInvocationPort；禁用默认 Provider 传输 |
| transformContext / convertToLlm | 只转换已验证的 Context 和本轮来源 Ref；不动态加入其他租户材料 |
| AgentTool.execute / beforeToolCall | Binding 查找、早期拒绝；真正执行重新进入 Tool Gateway |
| toolExecution | V1 显式 sequential；只读并行由 Run Task 编排实现 |
| shouldStopAfterTurn | 检查 Turn、无进展、剩余预算；不能用于在途急停 |
| abort / waitForIdle | Deadline/撤权立即 Abort，等待有界清理 |
| subscribe | 转稳定事件并写有界缓冲；Exporter 不阻塞 Pi 主循环 |

实际 SDK 签名由版本锁与 Adapter CTK 验证；Pi 升级不能迫使调用方修改业务 Schema。依赖失败时 Adapter 启动明确失败，不偷偷切到另一个 Harness。

## 3. RuntimeEvent 与产物

稳定事件字段：invocationRef、sequence、occurredAt、kind、payloadRef?、usageDelta?。kind 只表达 Started、TurnCompleted、ToolRequested、ToolObserved、OutputReady、Stopped、Failed。原始 Token Delta 为可丢弃诊断流，不能作为 Task 成功依据。

OutputReady 保存结构化产物和引用，stopReason 为 Completed、BudgetExceeded、Deadline、NoProgress、Cancelled、DependencyFailure 或InvalidOutput。Harness Completed 与 Verification Pass 分开，Run Owner 决定 Task。

Adapter 不另建业务数据库；恢复需要的裁剪 Transcript、Tool Receipt Ref 和事件水位进入受治理 Artifact，由 Run Owner 引用。隐藏推理不强制保存。

## 4. 主流程与费用

Run Owner 创建 Invocation → Control 确认 Task Context → Adapter 校验 Contract/版本 → Pi prompt → streamFn 请求 Model Gateway → 模型返回 Tool Request → Tool Gateway 返回观察/提案 Ref → 继续至停止 → 保存 Output Artifact → 提交 Completion Observation 给 Run Owner。

每次模型调用与工具成本在对应 Gateway 预留/结算；Adapter 维护运行预算的只读投影。预算更新失败则停止，不依据本地 Token 估算绕过 Ledger。任务拆分不重置父 Run 上限。

## 5. 恢复和取消时序

~~~text
Run cancellation committed
-> stopEpoch advanced
-> Adapter AbortSignal
-> cancel pending model reads / tool requests
-> waitForIdle within cleanup deadline
-> completion observation marked Cancelled
-> Run Owner ignores late output for automatic commit
-> Action/Operation reconciliation proceeds independently
~~~

continue 的许可必须证明固定 Pi/Definition/Workflow 版本兼容、最小 Transcript 可用、所有历史 Tool Receipt 已查回、当前授权有效。缺少任一项则返回 INVOCATION_RESUME_UNSAFE，Run 创建新 Invocation 并引用正式产物；不得从头重放工具。

模型流中断而供应商可能已计费时保留未结调用成本，由 Model Gateway 处理；Adapter 重试只由 Run Owner 决定。观测订阅积压时丢弃 Delta 并报告 droppedCount，关键 Completion 必须通过可靠 Owner Command 提交。

## 6. 错误、配置和自托管

特有错误：PI_VERSION_UNSUPPORTED（Precondition）、INVOCATION_CONTRACT_INVALID（Validation）、INVOCATION_RESUME_UNSAFE（Precondition）、RUNTIME_STOPPED（Conflict）；附 stopReason 和 trackingRef，不泄漏 Prompt。

配置：pi.maxBufferedEvents=256（32–4096，重启）；pi.cleanupDeadlineMs=5000（1000–10000，运行固定）；projectTelemetry=false（默认，显式配置才出站）；其余预算继承 NFR。无网络时使用本地/模拟 Model Adapter，仍运行真实 Pi Loop；M0 不用人工或脚本替代 Agent 产物冒充推理质量。

`abh doctor runtime` 检查 Pi/Node/Contract 版本、注入的 streamFn、工具出口和遥测配置。指标为 turn_count、stop_reason、cancel_latency、buffer_drop；Trace 只记录安全摘要和 Ref。正式运行不得将供应商 Secret 注入 Pi。

## 7. CTK 与演进

Fixture 覆盖：一轮结构化生成；多轮 Tool Loop；非法参数；工具越权；连续无进展；每个 Turn/Tool/费用边界；流中断；撤权；取消后迟到返回；恢复时已提交 Propose Tool；Exporter 卡死。断言供应商调用只能经过 Model Gateway，工具只能经过 Tool Gateway，领域状态仅由 Owner 改变。

V1 只实现 Pi Adapter；替换 Harness 是 Port 级迁移，需同一 Fixture/恢复/安全矩阵通过，不能由 Domain Pack 选择第二套 Loop。重审同时考虑必要能力缺口和总体维护成本，按 [ABH 自研边界](../00-总体设计/Agentic-Business-Harness总体设计.md#45-abh-自研边界)执行，不要求 Pi 先失效才允许采用更合适的上游。

升级评审核对每项兼容补丁、事件转换和停止补缺是否仍有必要；上游原生支持且通过同一 CTK 后删除重复代码。优先提交可复现 Fixture 与上游 Issue/PR，临时补丁绑定版本、责任人与退出条件，不复制完整 Pi Loop 或长期依赖内部私有 API。更换 Adapter 先处置旧 Invocation 与未决 Tool Receipt，不直接热换正在执行的循环。

# @abh/adapter-pi

Pi Agent Runtime Adapter 固定使用 `@earendil-works/pi-agent-core@0.85.1` 与同版 `@earendil-works/pi-ai`。Adapter 复用上游模型—工具循环，只负责 ABH 合同映射、Gateway 强制注入、事件归一化、有界缓冲和基础停止。

## 安全边界

- 模型请求只能经过调用方注入的 `ModelGatewayPort`。
- 工具调用只能经过 `ToolGatewayPort`，未知或未绑定工具在执行前拒绝。
- 工具循环固定为 `sequential`；禁用出站 Pi telemetry。
- `maxBufferedEvents` 限制为 32—4096，`cleanupDeadlineMs` 限制为 1000—10000。
- Adapter 不拥有 Run、Task、授权或业务状态；正式产物和完成证据必须回到 Owner。

## 当前边界

基础 `invoke` 覆盖合同校验、启动、Turn/Tool/Output/Stopped 事件、Token/费用/Deadline 停止、外部取消和依赖失败。

`continue` 复用同一 Pi/Gateway/事件路径：安装 `checkpointSink` 后，只在 Tool Result 已落地的等待点保存裁剪 Transcript、Tool Receipt Refs、事件水位、预算和工具计数。恢复必须提供 checkpoint 与 permit Ref，并通过显式 `checkpointGateway` 和 `resumeAdmission`；版本、Definition、Context digest、当前授权、剩余预算、Transcript 终点和未查回 Receipt 不一致时返回 `INVOCATION_RESUME_UNSAFE`。通过后使用 Pi 原生 `continue()`，不重放已观察工具。

生产 Model/Tool Gateway 装配、完整 CTK/故障矩阵、真实 Artifact Checkpoint Owner 和独立升级兼容矩阵仍按 V1 设计推进。

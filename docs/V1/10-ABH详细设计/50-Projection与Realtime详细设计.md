# Projection、Query 与 Realtime 详细设计

> 版本：1.1 · Owner：Workbench / Data Maintainers
>
> Projection 是可重建读模型，业务写入与权限由各自 Owner 决定。

## 1. 页面数据合同

Projection Envelope 固定 subjectRef、schemaVersion、asOf、watermark、stale、data、availableActions。availableActions 是当前体验提示，提交仍重验权限；字段裁剪发生在服务端，不能仅通过前端隐藏。

| 投影 | 必需内容 |
|---|---|
| MissionSummary | Goal 摘要、业务阶段、进展、Result Ref、风险、责任待办、更新时间 |
| ResponsibilityInbox | Request/Decision、责任身份、影响、期限、证据、可用回应 |
| ActionTimeline | 意图、批准与生效分别展示、Operation 汇总、Unknown/部分成功、补偿引用 |
| OrganizationSettings | 成员、Workspace、责任、连接、用途与生效策略摘要 |
| CapabilityOverview | 已分配版本、适用 Scope、评测摘要、纠错来源与暂停/回滚结果 |

Domain Pack 定义业务字段与文案，Core Projection 不内置品牌/广告实体。跨组织页面只能组合分别获权的 Projection，不通过聚合查询扩大读权。

## 2. 数据与接口

read.projections：projectionType/subjectId/schemaVersion 唯一、sourceVersionVector、dataArtifactRef、watermark、builtAt；read.consumer_watermarks 保存 consumer/aggregate 的版本及 gap；read.subscription_cursors 保存恢复范围和过期时间，默认不持久化每个 Token Delta。

`GetProjection` 输入 type/subjectRef/fieldSet?，返回裁剪后的 Envelope；`ListProjection` 输入 registeredFilter/sort/cursor/limit；任意 SQL/动态字段表达式拒绝。`RefreshProjection` 只提交重建 Job，不从 UI 同步重算全库。

`SubscribeChanges` 绑定当前用户、Organization、Scope、已授权 projectionTypes、lastEventId；返回 SSE 变更提示与恢复水位。无权限结果返回 404 或安全空列表，不能泄漏未授权对象数量。

## 3. 构建与读取时序

Owner commit + Outbox → 消费者按 Inbox 去重 → 回读必要 Owner 事实 → T1 提交 Projection + watermark + Inbox → 向订阅者发送失效提示 → 客户端查询最新投影。

Query：验证当前 Session/Scope → 读取 Projection → 用当前权限/Purpose 裁剪字段/关系 → 标注水位和 stale → 返回。对象用途撤回后即时读权阻断，即使投影数据尚未清理也不可返回。

Projection 处理旧 Event 时不得回退高版本；出现 gap 先回源/补缺，重建完成后原子切换。源已物理删除且无合法留存时返回墓碑，不拼旧缓存恢复正文。

## 4. SSE 与断线恢复

业务变更用 projection_changed 通知，payload 只含 subjectRef/version/watermark；需要工程诊断时使用 skill_call、skill_result、tool_call、mcp_call 等既定事件名，默认不对普通用户开放。Token Delta 为可丢弃流，不进入业务事件次序。

每条可恢复业务事件有不透明 eventId，绑定用户/Scope/Schema。断线携带 Last-Event-ID；游标过期或权限变化返回 reset 提示后重新 Query，不盲重放旧敏感事件。心跳默认 15 s，慢消费者缓冲达到 256 条即断开，不能占满服务器内存。

恢复日志只保存有界失效提示，发送每条事件前按当前 epoch/对象可见性过滤；subjectRef 本身也受权限保护。旧日志无法安全裁剪时发送无对象信息的 reset；Source 撤用途后，即使投影和订阅缓存尚未更新，也不能继续推送该对象标识。收到 reset 后客户端清理相关缓存并重新授权查询。

## 5. 性能、配置与验收

内部投影 p95 ≤ 5 s；Query 继承普通 API SLO。分页默认 25、最大 100；SSE 单用户 5、单组织 50；查询缓存键包含 acting/resource Organization、workspace、principal权限摘要、purpose、projection/schemaVersion。权限 epoch 变化立即失效并断开受影响订阅。

`abh doctor projection --subject` 显示源版本、消费水位、gap、stale 和安全重建入口。指标 projection_lag、gap_count、rebuild_failure、sse_drop、query_redaction_count；禁止 Metric label 中放无限用户/对象 ID。

测试：乱序重复 Event；重建崩溃；Source 删除；Permission 变化但缓存命中；游标跨用户复用；慢客户端；部分成功/Unknown 正确呈现；跨组织聚合漏裁剪。断言前端实际收到的 JSON 无越权字段。

Projection 和 SSE 合并在读侧模块以共享水位和裁剪规则；不另建实时状态服务，早期用 PostgreSQL/应用通知，规模门禁成立才采用独立消息能力。

# Business Workbench 详细设计

> 版本：1.2 · Owner：Workbench Maintainer · 技术：Next.js、React、TanStack Query、JSON Forms、ECharts
>
> 通用人类业务体验；领域导航与业务表达由 Workbench Extension / Domain Pack 配置。

## 1. 信息架构与用户任务

~~~text
业务总览
目标与项目
待办与审批
结果与活动记录
组织设置
  成员与责任 / 协作范围 / 连接 / 数据用途 / 自动化
~~~

核心旅程：提出目标 → 看系统如何推进 → 处理必要责任 → 查看已确认结果与异常 → 纠错/接管 → 看到后续改进。Agent/Workflow/Trace 只在具备权限的解释侧栏渐进披露，不作为普通用户主导航。

Workbench 是可选参考应用，默认 `web.enabled=false`；已有产品通过公开客户端/API 接入。首条 ABH 动作闭环无需先开发 Web；选用 Workbench 时优先实现责任待办、执行结果，以及启用 Mission 后的项目进展，其余能力按需加入。Lime Ads 仍须交付自己的完整业务工作台。

## 2. 页面与组件合同

| 页面 | 主区与辅助区 | 数据 / Mutation |
|---|---|---|
| Overview | 目标进展、结果变化、风险、待办；明确数据时效 | MissionSummary/Inbox/Result Projection |
| Mission Detail | Goal/约束、进度、产物、结果、时间线；允许暂停/纠错 | CreateMission / ReviseMissionGoal / PauseMission |
| Decision Detail | 问题、推荐/备选、影响/风险、证据、批准/拒绝/理由 | 冻结 Decision Package + SubmitDecision |
| Action Detail | 意图、审批、生效、子项、Unknown、剩余责任 | ActionTimeline；Cancel/Compensation 提案 |
| Settings | 当前组织/协作边界、成员、用途、连接、自动化等级 | Governance Command / 必要 Responsibility Request |

跨组织切换始终显示当前 actingOrganization 与资源归属。品牌/代理商特定页面由 Marketing Pack 定义，不用同一个 role 字段抹平其责任。

## 3. 前后端与缓存

Server Component/BFF 处理登录态与首屏授权查询，Client Component 使用 TanStack Query 管理 Projection Server State。查询 key 包含组织/Workspace/授权摘要/用途/对象；切租户时取消旧请求、清空对应缓存，迟到响应不得挂到新租户页面。

Mutation 发送 Idempotency-Key、If-Match 和公开 Payload；服务端重新授权。对审批/花费/外部状态不使用乐观成功更新；按钮显示“提交中”，持久受理后显示“已批准/执行中”，只有对账证据才显示“已生效”。

JSON Forms 仅渲染注册的责任表单 Schema；自定义安全字段、证据查看和影响提示由宿主组件承担，禁止 Schema 注入任意 HTML/脚本。ECharts 只读已裁剪 Projection，图例明确来源、口径、窗口、币种。

表单验证器按 Contract Package 的 Ajv2020 适配合同注入，服务端最终拒绝不能被浏览器验证成功覆盖。Next.js 个人/组织响应显式禁用共享静态缓存；认证数据不进入公共 CDN 缓存，跨会话首屏缓存按身份隔离。

## 4. 空、失败与恢复

| 情况 | 必需交互 |
|---|---|
| Empty | 说明缺目标、缺连接或无待办，提供当前合法下一步 |
| Loading | 稳定骨架与可取消反馈，长任务展示 trackingRef/进度 |
| Stale | 显示 asOf 与影响；高风险动作禁用提示仅辅助，后端仍拒绝 |
| Unknown | 明示“结果待确认”，查看对账进度；不展示通用重试写入按钮 |
| PartiallySucceeded | 逐项结果与残余影响；提出补偿需新的明确动作 |
| 409 Conflict | 保留用户草稿，展示新版 Diff，重新确认后提交新请求 |
| Session / Permission revoked | 终止订阅、清理敏感缓存并重新登录/返回允许范围 |

离线可显示仍符合本地保留策略的最小非敏感界面状态；审批、修改、恢复不进入离线自动补发队列。网络恢复先查询已提交 Command 状态，防重复点击造成新意图。

## 5. 无障碍与性能

目标 WCAG 2.2 AA：键盘完成主要旅程、可见焦点、语义标签、错误与输入关联、颜色外的状态提示、屏幕阅读器可感知异步结果、减少动画。响应式至少覆盖 360 px 手机和 1280 px 桌面；关键影响/批准不得被折叠到不可见。

初始页面实测目标 LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1（固定浏览器/网络及数据规模）。大图表按需加载，列表分页/必要虚拟化；无限 Trace 不下发页面。浏览器支持矩阵在发行 compatibility 中记录实际测试版本。

配置 web.defaultPageSize=25、web.queryStaleSeconds=5、web.sseEnabled=true；失败可回退授权轮询，每次同样裁剪。Project Telemetry 默认关闭，启用埋点只记录任务类型/耗时/结果和必要 Scope Ref，不采集输入正文或 Secret。

## 6. E2E 与验收

公开 Fake Fixture 覆盖：创建 Goal 到 Decision/Action Result；版本冲突；双击批准；撤权；双组织切换与迟到响应；Unknown/部分成功；数据 stale；断网恢复；键盘/读屏；手机批准页。测试观察 API、Audit 与实际页面，不仅断言按钮存在。

可用性验证要求目标用户能说明当前责任组织、批准影响以及“批准与生效”的差别。Workbench Maintainer 在 M1 外部写入体验开放前完成此验证；尚未实测的性能/可用性只记为目标，不标已达成。

接入方使用既有页面时，在该页面验证相同的身份、完整影响展示、明确批准和结果查询合同；无需为通过 Core CTK 部署第二套 Workbench。Workbench 未启用时不加载其前端、专属投影订阅和 SSE；Action/Decision 正式查询仍可通过 API 使用。

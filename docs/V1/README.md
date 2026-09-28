# ABH V1 设计文档索引

> 状态：总体架构与 ABH 分模块设计已形成；机器契约、实现和生产验证仍按工程门禁推进。
>
> 技术基线：Node.js 24 LTS + TypeScript ESM；最小部署为 server（内置有界 Worker）和 PostgreSQL，web 按需启用。M1 真实写入使用独立 Worker 与生产身份/Secret 能力。
>
> 文档成熟度与实现放行依据：[模块详细设计规范](00-总体设计/模块详细设计规范.md)。

## 1. 总体设计

| 文档 | 内容 |
|---|---|
| [ABH 总体设计](00-总体设计/Agentic-Business-Harness总体设计.md) | 四责任域、开源组件、可信执行、学习与工程门禁 |
| [ABH 论文](00-总体设计/Building-Agentic-Business-Harness-on-Agent-Harness.md) | 理论、学习缺口、设计命题与验证边界；不作为机器契约 |
| [Marketing Domain Pack 与 Lime Ads](https://github.com/GoatGit/lime-ads/blob/main/docs/V1/00-%E6%80%BB%E4%BD%93%E8%AE%BE%E8%AE%A1/%E4%B8%AD%E5%9B%BD%E5%87%BA%E6%B5%B7AI%E5%B9%BF%E5%91%8A%E8%90%A5%E9%94%80%E7%B3%BB%E7%BB%9F%E6%80%BB%E4%BD%93%E8%AE%BE%E8%AE%A1.md) | 营销产品、六类 Agent、客户/代理商责任、业务闭环和 Phase |
| [系统边界与技术基线](00-总体设计/系统边界与技术基线.md) | 固定组件、运行 Profile、依赖、Owner 和容量基线 |
| [公共内核与 Pack 运行规范](00-总体设计/ABH公共内核与Pack运行规范.md) | 领域中立边界、Manifest、Trust Mode、签名和迁移 |
| [模块详细设计规范](00-总体设计/模块详细设计规范.md) | D2 颗粒度、模块成立条件、契约与验收要求 |

## 2. ABH 分模块详细设计

入口：[模块地图与阅读指南](10-ABH详细设计/00-模块地图与阅读指南.md)。

| 分组 | 阅读入口 |
|---|---|
| 公共规范 | [公共契约](10-ABH详细设计/01-公共契约与错误模型.md)、[状态](10-ABH详细设计/02-状态与执行契约规范.md)、[授权执行链](10-ABH详细设计/03-责任授权与执行链规范.md)、[NFR](10-ABH详细设计/04-NFR与容量模型.md)、[Contract Package](10-ABH详细设计/05-Contract-Package与一致性检查.md) |
| Agentic Core | [Mission](10-ABH详细设计/10-Mission-Controller详细设计.md)、[Run/Task Graph](10-ABH详细设计/11-Run-Orchestrator与Task-Graph详细设计.md)、[Pi Agent 适配](10-ABH详细设计/12-Agent-Runtime与Pi-Adapter详细设计.md)、[Definitions](10-ABH详细设计/13-Definition与Workflow-Registry详细设计.md)、[Context/Memory](10-ABH详细设计/14-Context与Mission-Memory详细设计.md)、[Verification](10-ABH详细设计/15-Verification详细设计.md)、[Learning](10-ABH详细设计/16-Evaluation与Learning详细设计.md) |
| Trusted Runtime 控制 | [Interaction/Identity](10-ABH详细设计/20-Interaction与Identity详细设计.md)、[Authorization/Policy](10-ABH详细设计/21-Authorization与Policy详细设计.md)、[Resource Ledger](10-ABH详细设计/22-Resource-Ledger详细设计.md)、[Pack Loader](10-ABH详细设计/29-Pack-Loader与Capability-Registry详细设计.md)、[Capability Release](10-ABH详细设计/30-Capability-Release详细设计.md)、[Secret/Isolation](10-ABH详细设计/31-Secret与Isolation详细设计.md) |
| Trusted Runtime 执行与数据 | [Tool Gateway](10-ABH详细设计/23-Tool-Gateway详细设计.md)、[Model Gateway](10-ABH详细设计/24-Model-Gateway详细设计.md)、[Action](10-ABH详细设计/25-Action-Engine详细设计.md)、[Operation/Reconciliation](10-ABH详细设计/26-Operation与Reconciliation详细设计.md)、[Durable/Outbox](10-ABH详细设计/27-Durable-Execution详细设计.md)、[Data/Artifact/Audit](10-ABH详细设计/28-Data-Artifact与Audit详细设计.md) |
| Human Gateway | [Responsibility/Routing](10-ABH详细设计/40-Responsibility与Routing详细设计.md)、[Decision](10-ABH详细设计/41-Decision详细设计.md)、[Correction/Exception/Takeover](10-ABH详细设计/42-Correction与Exception详细设计.md) |
| Business Workbench | [Projection/Realtime](10-ABH详细设计/50-Projection与Realtime详细设计.md)、[Workbench](10-ABH详细设计/51-Business-Workbench详细设计.md) |
| 开源工程 | [SDK/CTK](10-ABH详细设计/60-SDK与CTK详细设计.md)、[CLI/Distribution/运维](10-ABH详细设计/61-CLI-Distribution与运维详细设计.md)、[工程实施与验收](10-ABH详细设计/62-工程实施与验收门禁.md) |

33 份文档覆盖 5 份公共规范、24 份运行/产品模块、3 份开源工程设计与 1 份模块地图。模块是实现与验收职责，多个模块共享进程和数据库；不按文件数量拆微服务。

## 3. 规范来源与冲突处理

架构原则归 ABH 总体设计，阶段部署归系统基线，营销语义归 Lime Ads 总体设计；ABH 详细设计 01—05 分别拥有公共字段/错误、状态、授权执行事务、NFR 与机器生成。局部模块补充自身字段、Owner、时序和失败，不重复定义公共规范。

发生冲突时同时修正规范与全部引用；不能按文件更新时间任选一份，也不能让第三方 SDK 类型反向改写公共语义。机器 Contract Package 形成后由 CI 验证 OpenAPI、事件、数据库约束和前端类型一致。

独立 Action 的执行委托见 [ExecutionAuthority 合同](10-ABH详细设计/21-Authorization与Policy详细设计.md#21-独立-action-的-executionauthority)，版本固定与恢复见 [Run/Action PinSet 合同](10-ABH详细设计/30-Capability-Release详细设计.md#41-run-与独立-action-的固定协议)，数据库隔离见 [RLS/UoW 合同](10-ABH详细设计/28-Data-Artifact与Audit详细设计.md#11-数据库角色与-rls)。这些设计输入已补齐，机器制品、真实 PostgreSQL 隔离测试和 Pi Agent 适配/恢复验证仍按工程门禁实施。

## 4. 阅读与实施

接入者从 [SDK 最小作者流程](10-ABH详细设计/60-SDK与CTK详细设计.md#2-最小作者流程)和 [CLI 配置](10-ABH详细设计/61-CLI-Distribution与运维详细设计.md#3-配置-schema)开始：可先接入一个受控 Action，再按业务需要启用 Mission、Agent、学习或 Workbench。首次接入无需通读内部模块设计。

框架维护者先读 ABH 总体设计与模块地图，再读 01—05 公共规范，然后进入目标模块及其直接依赖；实际实现按 [M0—M3 依赖与证据](10-ABH详细设计/62-工程实施与验收门禁.md)推进。

ABH 通用设计与实现由本仓库维护；营销 Agent、业务对象、Spend Commitment 专业策略、品牌/代理商模板和领域页面由独立的 lime-ads 仓库维护，复用公共框架。产品 L0—L4、Lime Ads Phase 0—6、工程 M0—M3 与文档 D0—D3 分别表达授权、能力依赖、实现门禁和证据成熟度，不互相推导。

开源代码、规范、SDK、CTK 采用 MIT；论文采用 CC BY 4.0；第三方制品保留原许可。1.0 需要真实契约/实现、安全与恢复证据及两个异质 Domain Pack，设计完成不替代这些门禁。

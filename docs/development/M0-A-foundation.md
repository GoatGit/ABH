# M0-A 第三批：配置、静态目录与基础 Port

日期：2026-09-07。状态：本批实现和本地检查完成；M0-A/G01 尚未整体验收。现有未提交的设计迁移与前两批代码均保留，未发布包或启用服务。

## 实现与复用

| 工作 | 分类 / 上游 | 可检查输出 |
|---|---|---|
| 配置元数据与默认解析 | 薄适配：现有 JSON Schema/Ajv | [DevelopmentConfig 源 Schema](../../packages/contracts/schemas/public.schema.json)、[解析入口](../../packages/contracts/src/config.ts) |
| 对象/动作/用途目录 | 必要业务补缺：静态数据与同源 Schema | [Core 目录](../../packages/contracts/catalog/core.json)、[扩展 Schema](../../packages/contracts/schemas/catalog.schema.json)、[注册校验](../../packages/contracts/src/catalog.ts) |
| 首闭环 Adapter Port | 薄适配：同一 JSON Schema/TypeScript 生成链 | [Port 注册表](../../packages/contracts/ports/registry.yaml)、[请求字段](../../packages/contracts/schemas/adapters.schema.json)、[公开入口](../../packages/contracts/src/ports.ts) |
| 状态规范映射 | 必要业务补缺：现有 Registry | [规范定位](../../packages/contracts/states/documentation.json)、[生成迁移参考](../../packages/contracts/generated/state-reference.md) |
| 公开 API 变更检查 | 复用配置：API Extractor 7.59.0 | [检查脚本](../../packages/contracts/scripts/check-api.mjs)、[Port 报告](../../packages/contracts/api/ports.api.md)与其余入口报告 |

依据详细设计 01/05 公共契约、20 Identity、27 Durable、28 Data/Artifact、29 Pack/Registry、61 CLI 和系统基线的配置要求。没有新增授权引擎、队列、对象存储或 Identity 实现。新增 API Extractor 仅为开发依赖，不进入浏览器或运行时依赖图。

## 配置与静态目录

17 个配置叶子字段均声明版本、示例、类型/范围、默认策略、敏感级别、Restart 生效和设计来源。仍需显式提供 Development/Fake/ActionOnly、数据库引用、业务入口和关闭的 Workbench；验证不会隐式接受缺失配置。`resolveDevelopmentConfig` 验证后创建新对象并应用已登记默认值，再校验全部字段必填的 `ResolvedDevelopmentConfig`。

本批增加 runtime.action、runtime.queue、runtime.reconciliation 和关闭的 observability.projectTelemetry。范围按设计和首批 Preview 上限固定：Action 操作默认 100、最多 1,000；每节点依赖最多 32；意图最长 86,400 秒；Outbox batch 默认 100、Preview 范围 1–1,000；poll 默认 500 ms、Preview 范围 100–5,000 ms；对账延迟默认 5/300 秒、范围 1–300 秒且 initial 不大于 max。配置 Schema 的较大结构上限不代替 Owner 应用当前部署配置的更小限制。

runtime/queue 必须使用不同环境引用，解析器只返回显式引用名称，不读取环境或秘密。不同名称仍可能配置为同一凭据，M0-B 必须通过真实数据库角色检查阻断；这里不声称已验证角色权限。缺省组的默认值有单一来源，生产、Agent、模型、开放遥测和未知字段仍拒绝。

Core 目录含 42 个已引用对象类型和 7 个用途；权限动作由 HTTP/Port 注册表生成，避免在目录中手写第二份。Domain 扩展按命名空间声明对象类型、Scope 类型、动作目标和用途，拒绝 `abh` 覆盖、重复注册、未知引用和携带代码的描述。所有扩展先验证再构造不可变目录，不存在“最后加载者覆盖”。`validateRegisteredTarget` 只验证登记组合；当前租户、对象关系、存在性、版本、Purpose 和 Grant 仍由 Owner 回源确认。

## Port 线格式与取消

生成 3 个 Port、11 个方法：Identity verify；Durable enqueue/scheduleWakeup/cancelWakeup/signal/inspect/drain；Object Store put/read/stat/delete。接口要求 `AbortSignal`，可序列化请求要求 callId、deadline、Target 与短时 Context Ref。Identity verify 位于 Context 创建之前，因此使用入口的 callId、deadline、opaque credentialRef 与 issuer/audience；返回身份验证证据，不创建本地 Principal 或授予业务权限。

Object Store 只接收受控 Ref、摘要和大小，不接受任意 URL 或文件路径。put 传入 `AsyncIterable<Uint8Array>`；read 成功结果增加 content 流，校验 JSON 描述时先拆开 content。真实实现仍需验证实际字节数/Hash、读取授权、取消和上传清扫；Schema 不验证流内容。删除必须有 deletionProofRef，不能将普通读取权限用于清除对象。

结果使用闭合联合：Completed/data、Rejected/ErrorResponse、Cancelled/effect=None；写入方法额外允许 Tracked/trackingRef。Cancelled 仅用于已证明没有新效果的任务；无法判断是否提交时保留 Tracked，由 Owner 查回，不能返回“可安全重试”的写入失败。取消已有 Wait 的正常返回用 Prevented/AlreadyClaimed/AlreadyTerminal，已认领不伪报撤销成功。方法级检查同时核对错误登记、写入重试标记及请求的权限 Action/目标类型。

这些是可实现的 Adapter 合同，不是 Adapter CTK 通过报告。Agent/Model、生产 Secret、Isolation 等 Port 随对应能力另行实现；`portsAvailable=true` 只表示已开放本批类型入口，`implementedAdapters=[]` 如实表示无实现。

## 一致性、API 与发行检查清单

状态映射检查 13 个机器均有规范章节、全部状态名出现在所属章节，并从同一 Registry 生成迁移/Guard/事件/原子效果参考。规范原文摘要进入生成 manifest，改文档会产生制品漂移。此检查发现遗漏和漂移，不声称自动理解全部自然语言守卫；Owner 语义审查与运行恢复测试仍必需。

`pnpm check` 在构建后运行 API Extractor，核对根类型及 schema/states/errors/http/digest/config/catalog/ports 九个入口的报告。只有有意修改 API 时使用 `pnpm api:update`；普通 check 不覆盖报告。源码类型变化、出口新增/删除或报告缺失均需显式更新并审阅。报告是当前开发基线，版本仍为 private 0.1.0 Preview，previousRelease=null；不能把当前 API 一致误称为历史升级兼容。

| 项目 | 本批状态 |
|---|---|
| Schema/状态/错误/协议再生成与漂移 | 通过 |
| 配置/目录/Port 负例和浏览器执行 | 通过 |
| 九入口 API Extractor 报告与类型负例 | 通过 |
| 已发布版本兼容比较 | 无历史发行版，不声明已验证 |
| Changesets、SBOM、签名与完整供应链 | 尚未启用，首次发行前完成 |
| M0-B API/持久表覆盖、Owner 审查及 G01 | 尚未签署；按实际表/API 清单补充辅助状态与 Identity/Artifact 入口 |
| PostgreSQL 角色/RLS、事务与故障恢复 | 未执行，属于 M0-B/C |

## 验证证据

本地 Node.js 24.13.0 / pnpm 10.28.2，`pnpm install --frozen-lockfile` 和 `pnpm check` 通过；200 项测试，0 失败/跳过；42 个生成制品无漂移；TypeScript、构建与 9 个 API 报告检查通过。类型负例验证必需 AbortSignal/deadline、取消效果和流返回类型；浏览器沙箱不含 Node、数据库、队列、身份 SDK 或内部 TenantContext。

构建后另验证 config/catalog/ports 包入口可调用、内部 TenantContext 子路径拒绝。临时副本中故意修改 API 报告后，检查拒绝漂移且未覆盖基线；原工作区保持不变。证据与依赖锁摘要见[本批验证记录](verification-2026-09-07-foundation.json)。本地通过不表示 GitHub CI 已执行，未代签维护/安全角色或任何发布门禁。

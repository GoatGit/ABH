# M0-A 实施记录

日期：2026-09-07。状态：基础、Action/Decision/传输和配置/目录/基础 Port 三批契约已实现，M0-A / G01 尚未整体验收。下文保留首批记录；后续变更见[第二批](M0-A-contracts.md)与[第三批](M0-A-foundation.md)。

## 本批范围与复用

| 工作 | 分类与上游 | 本批输出 / 退出条件 |
|---|---|---|
| 工程环境 | 复用配置：Node.js 24.13.0、pnpm 10.28.2、TypeScript 5.9.3 | 固定版本、依赖锁、ESM strict、CI；统一检查通过 |
| 入口 Schema | 复用配置：Ajv 8.20.0 + ajv-formats 3.0.1 | 严格校验，无输入转换/静默删除；浏览器可执行 |
| 类型与校验器 | 薄适配：json-schema-to-typescript 16.0.0、Ajv standalone、esbuild 0.28.2 | 同源制品、离线生成、两次生成字节一致、漂移拒绝 |
| 状态/错误与本地关系 | 必要业务补缺：YAML 2.9.0 解析 ABH 自有契约 | 状态与 Outcome 组合、具名 Owner 守卫描述、错误映射、字段关系校验 |
| 文档迁移 | 复用现有设计 | 38 份框架文档迁入，营销文档留在原仓库；逐文件复制校验后移动，源 SHA-256 留档 |

首批没有自研 Schema 引擎、HTTP 框架、数据库驱动、迁移引擎或队列。未启用能力不安装其运行依赖。API Extractor 已在第三批接入；Turborepo、Changesets 和正式供应链工具仍在多包构建/契约发行阶段接入，当前不宣称已具备发行能力。上游若支持同等状态注册表制品与检查，可在公开 Fixture 不变的条件下替换生成适配逻辑。

## 首次机器表示决策

以下为对设计中未固定线格式的 Preview 细化，后续改动需同时更新 Schema、Fixture 和本记录：

- `authnStrength` 使用 `level=SingleFactor/MultiFactor/Workload`；MultiFactor 必须包含已验证的 `mfaVerifiedAt`。这只是数据表示，Ingress 必须验证事实。
- Principal 引用使用 `abh.principal`，实际 Human/Service 类型由 Identity Owner 检查。Actor 仍保留设计规定的四类身份。
- Capability kind 首批登记 Agent、Prompt、Workflow、Tool、ModelRoute、BehaviorPolicy、Connector、Compiler、RuntimeAdapter；命名 ID 与精确 SemVer 分开保存。
- Set 字段不允许重复；Grant/提案人/Scope/用途引用还拒绝同一身份的多个版本。摘要计算、集合规范排序与 JCS 工具在后续批次实现，当前不验证摘要内容。
- 配置仅开放 Development + Fake + ActionOnly。运行与队列连接只接受明确的 `env:ABH_*` 引用，不接受连接秘密正文或迁移凭据。未实现 Profile 拒绝。
- UTC 时间保存至微秒；本地有效期比较不经过会截断微秒的 JavaScript Date。数据库当前时间、有效授权上界仍是 Owner 的责任。

## 验证与实际边界

统一入口为仓库根目录的 `pnpm check`：文档本地链接、生成漂移、TypeScript、契约 Fixture/状态组合/生成器负例/浏览器沙箱执行、包构建。CI 使用同一命令；本地通过不等于 GitHub CI 已执行。

本批本地验证：79 项测试通过，0 失败/跳过；28 个生成制品无漂移，类型检查与构建通过，162 个本地文档链接有效。构建后另验证公开包入口可导入，内部 TenantContext 子路径被 exports 拒绝。环境与锁摘要见本目录 `verification-2026-09-07.json`。

目前没有 PostgreSQL 表、UoW、签发器、Action 派发、HTTP 服务或 Pi Agent。`OwnerRequired` 守卫描述明确表示尚需真实 Owner 实现，不提供一个返回 true 的占位授权函数。恢复要求登记在 [Fixture 清单](../../packages/contracts/fixtures/recovery-requirements.json)，数据库隔离与崩溃恢复证据仍未产生。

仓库维护者和独立审查负责人尚未正式登记；本记录不代签 G01/G13 或任何发布门禁，也不声称已有安全值守团队。

## 下一批

1. 第二批已补充 Action/Plan、Decision、Command/Event/Job、HTTP 契约与错误，及 RFC 8785 语义摘要、集合排序和恢复输入比较。
2. 第三批已完成 Development 配置元数据、静态对象/动作/用途目录、Identity/Durable/Object Store Port、状态文档映射与 API 表面检查；其验证与发行检查清单见第三批记录。当前没有历史发行版，不能虚构升级通过证据。
3. 按 M0-B 实际 API/表清单完成 G01 覆盖审查，补齐对应 Identity/Artifact 入口及辅助状态的机器合同后进入真实 PostgreSQL 16、角色与 RLS、Tenant UoW、CAS、Audit/Outbox、Ledger、静态 Release/Authority 与公开客户端。维护/审查角色尚未登记，不代签门禁。
4. M0-C 实现无需 Mission/Run 的 hello-business 受控 Action；M0-D 再接入 Pi Agent，验证 Gateway、取消和恢复。

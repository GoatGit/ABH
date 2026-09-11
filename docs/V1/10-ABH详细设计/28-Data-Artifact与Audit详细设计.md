# Data Plane、Artifact、Lineage 与 Audit 详细设计

> 版本：1.2 · Owner：Data Maintainer · 包内模块 `data`
>
> PostgreSQL 保存正式事实；领域语义由各自 Owner 决定；ObjectStorePort 承载按需的大正文。

## 1. 数据责任和访问

Repository 方法必须接收 TenantContext、事务句柄和 Owner；默认查询同时校验 resourceOrganizationId、Workspace/Purpose 与软删除。禁止由 Route 直接写表，禁止无租户条件的通用资源查询；系统维护使用登记的 System Context 和专用角色。

正式对象用公共审计列、版本 CAS 和逻辑引用。无物理外键，由同事务 Owner 检查存在性/组织关系，后台完整性扫描发现问题冻结相关写路径。数据库唯一约束与 CHECK 仍用于幂等、精度、状态合法值。

### 1.1 数据库角色与 RLS

M0 起所有租户事实表启用 `ENABLE ROW LEVEL SECURITY` 与 `FORCE ROW LEVEL SECURITY`，并在每次迁移/启动时验证。RLS 强制资源组织边界；当前 Grant、Workspace、Purpose、对象/字段读权和软删除由 Repository/Owner 继续验证。RLS 不将普通成员升级为业务授权，也不声称能隔离与宿主同信任级的恶意 TrustedCode。

| 角色 | 数据库权限与使用边界 |
|---|---|
| Core/Pack Schema Owner | 分别为 NOLOGIN 所有者角色；仅受审计 Migration Runner 可取得对应 DDL 权限。普通 server/worker 不拥有表，不可 SET ROLE 到所有者 |
| `abh_runtime` | server/业务 Worker 的受限登录角色，NOSUPERUSER、NOBYPASSRLS、无 DDL/CREATEROLE/TRUNCATE；仅允许已登记 Core 表所需 DML。Audit 只可 INSERT 和受控 SELECT，无 UPDATE/DELETE |
| 控制核验函数所有者 | 专用 NOLOGIN、NOSUPERUSER、NOBYPASSRLS 角色；仅对必要身份/责任/控制表配置专属策略和列权限。通过下述固定函数跨组织回验与锁 fence，无业务正文或通用查询权；runtime 不继承/切换到该角色 |
| 队列认领角色 | 仅可执行已登记的 Outbox/Wait 认领函数，以及通过独立连接使用 pg-boss 自有 Schema；不能访问领域正文或充当 Owner 事务角色 |
| 维护角色 | 凭独立运维身份取得，普通应用进程不持其凭据；数据维护默认逐租户受 RLS 限制。法定 Audit 删除使用专用受审计入口，不能给 runtime 增加删除权 |

迁移清单必须为每张表登记 `tableScope=Tenant/Deployment/AdapterInternal`、Owner、角色权限和 RLS 策略：Tenant 包括租户所属的 Control、Human、Action、Ledger、Artifact、Audit、Outbox/Inbox/Wait 和 pin 记录；Deployment 仅限明确登记的 Pack/Schema 目录及最小身份定位索引等部署事实，不得收纳业务正文、租户 Grant 或责任记录；AdapterInternal 仅限 pg-boss 等自管表，Job 正文只能保存公共 Job 合同允许的 Ref。未知归属的表迁移/启动检查失败，不以缺少 resource_organization_id 为豁免理由。

普通 Tenant 表的行策略以同一模板生成 USING 与 WITH CHECK：`resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid`。缺上下文或空值不匹配任何行，非法值使事务失败；INSERT/UPDATE 跨组织归属拒绝。租户列 NOT NULL，组织转移通过受审计导入/迁移完成，不在普通 UPDATE 中改归属。不存在的 Ref 与 RLS 隐藏的 Ref 使用相同公开错误，数据库内部约束错误先脱敏再返回。

### 1.2 TenantContext 与 UoW

TenantContext 字段唯一来源为[公共契约第 2 节](01-公共契约与错误模型.md#2-可信-context)，由 Ingress/Worker 创建并验证有效期，业务 Handler 不接受客户端提交的同名 Context。同步 Query 也必须进入只读租户事务，不能借共享连接绕开 UoW。

~~~text
认证身份/核实目标资源组织与 Workspace -> 创建 TenantContext
postgres.js begin（固定连接，默认 READ COMMITTED）
  参数化 set_config('abh.resource_organization_id', verifiedOrganizationId, true)
  设置事务局部的 request/actor/actingOrganization/workspace/purpose 与 epoch 元数据
  通过同一 tx 句柄调用 Control/Ledger/Action 等 Owner
  按公共锁序锁 fence/资源/账本/聚合，重验版本和当前授权
  Owner 状态 + Receipt + Audit + Outbox
COMMIT / ROLLBACK -> 事务局部设置自动失效 -> 连接归池
~~~

`set_config` 的第三参数固定 true，等价于 SET LOCAL；值来自服务端 Context 并以参数绑定传入。禁止会话级 SET、从 Payload 拼接 GUC、在事务中切换 resourceOrganizationId、或把全局连接对象交给 Repository。不同 Owner 共享同一个受信事务句柄完成 T1/T2，不各开连接/提交；RLS 不能成为拆开原子授权事务的理由。需要多组织业务写入时分别执行各 Owner Command 并保留回执，不在普通租户 UoW 内扩大组织集合。

连接建立/健康检查确保没有会话级租户默认值；成功、异常、取消和超时均先结束事务再归池，连接状态不明则销毁。显式长快照仅用于已授权导出等 Query；Control admission 与撤权使用 READ COMMITTED、公共行锁及锁后重验，不能复用长事务旧快照放行。事务超时使用配置的 statement/lock timeout 并按公共安全重试规则处理。

### 1.3 跨组织核验与后台访问

跨组织操作的普通 UoW 仍以 resourceOrganizationId 为唯一数据组织，actingOrganizationId 只表达责任来源。一个合法 Workspace 不允许把双方组织同时加入普通业务表的 RLS 范围。组织定位在创建 TenantContext 前由 Identity Owner 使用仅返回 Owner ID/成员候选 Ref 的最小定位索引完成，再以当前身份/Workspace 校验；该索引不对公共 Query 开放。

需要核对另一组织的 Membership、Responsibility、Delegation 或撤权 fence 时，由 Control Owner 的固定核验/加锁函数完成：输入为受信 Context 和明确来源 Ref，校验 Workspace 关系、资源组织及来源链，输出仅包含资格结论、当前检查所需的规范化约束、来源版本/epoch 和必要 Ref，供 Control 裁决。对应 SECURITY DEFINER 函数使用固定 search_path、限定 Schema 的静态 SQL、非公开可写 Schema、撤销 PUBLIC EXECUTE，并只向必要 runtime 角色授予 EXECUTE；专属 RLS 策略/列权限仅开放这些核验所需的表。先收集本次全部组织的依赖 fence，再按公共 canonicalLockKey 在调用方同一事务内统一锁定并回验，不能在另一连接先查后放行，也不能返回另一组织的成员清单、Grant 原始正文或通用表句柄。

全局 Outbox/Wait 扫描使用同样受限的认领函数，只返回组织 ID、job/event/owner Ref、时限和租约等最小调度字段；具体业务处理随后创建该租户的 Service Context 与 UoW。声明系统组织不能放行所有租户记录，pg-boss 的交付身份也不能用于业务写入。系统清理、导出和对账按目标组织逐个处理并验证独立 Authority；bootstrap/迁移使用显式维护入口与 Audit，不保留常驻超级用户连接。

这些函数仅承担现有 Identity/Control/Durable Port 所需的数据库访问，不新增业务 Owner。其定义、专属角色策略、EXECUTE 清单和锁顺序进入迁移审查；禁止动态表名、任意 SQL 或 `tenant=*` 参数。Data Maintainer 负责 RLS/UoW 基础合同，具体 Owner 负责函数的业务授权与输出裁剪。

## 2. Artifact 与血缘

| 表 | 字段 |
|---|---|
| data.artifacts | id、ownerRef、organizationId、mediaType、sizeBytes、contentDigest、storageRef、status、dataClass、purposeRefs、region、retentionPolicyRef、version |
| data.artifact_dependencies | artifactId/sourceRef/version、transformationRef、observedAt；支持反向追踪 |
| data.exports | exportId、scopeRef、manifestRef、redactionPolicyRef、requestedBy、expiresAt、statusRef |
| audit.records | eventId、actor/organizationRef、action、targetRef/version、decision/snapshotRef、before/afterDigest、outcome、recordedAt、correlationId |
| data.lifecycle_jobs | sourceRef、revocation/deletionCause、affectedRefCursor、progressRef、requiredCompletionBy |

小型文本可存 PostgreSQL；二进制和大文件走对象存储，数据库仅存元数据/Hash。相同字节的物理去重不得跨租户共享可猜测 URL、加密密钥或访问统计。

## 3. Ports 与 Commands

| 接口 | 请求 | 结果 |
|---|---|---|
| StoreArtifact | ownerRef、contentStream、declaredMediaType/size、purpose/dataClass、sourceRefs、idempotencyKey | Available artifactRef 或 Quarantined Ref |
| ReadArtifact | artifactRef/version、AuthorizedContext、range? | 授权代理流；允许有界延迟撤销的非敏感 Artifact 才可返回短时签名读取句柄 |
| CommitOwnerTransaction（Internal） | Owner 标识、TenantContext、expectedVersions、writes、outbox/auditRecords；第 1.2 节的同一事务句柄 | 事务 Receipt；不由通用 data 服务判断领域不变量，不接受外部原始 SQL/写集 |
| AppendAudit | signed/server context、target/action/outcome、relatedRefs、digest | auditRef；与关键变更同事务 |
| RevokeUse / RequestDeletion | sourceRef、purpose/retentionBasis、responsibilityRef | lifecycleJobRef，立即墓碑/撤用途 |
| ExportScope / ImportScope | scope、formatVersion、purpose、authorizationRefs | manifest/jobRef；不输出 Secret Material |

接口执行分类见[公共契约](01-公共契约与错误模型.md)。artifact 查询按 owner/type/status/cursor；Audit 按时间/目标/主体查询，跨 Scope 需专项审计 Grant，不能用系统管理身份默认读取内容。

## 4. 文件提交与恢复

T1 创建 Staged Artifact → 受限上传/扫描/摘要 → Object Store 写内容寻址对象 → 验证 size/hash → T2 CAS Available + 血缘 + Outbox。只有 Available 可供模型/业务使用。

T2 前崩溃，孤儿对象由清理任务按 Staged Ref/保留窗回收；T2 后读不到内容则隔离并报警，不能返回空文件当成功。上传路径拒绝压缩炸弹、类型伪装、路径穿越和 SSRF；远程 URL 导入走 Connector/Tool Gateway，不能直接由 Storage Fetch 任意地址。

跨 Store/DB 没有分布式事务，以 staging、hash 和恢复清扫保证可追踪；通用对象存储 SDK 不写业务状态。

## 5. 删除、撤权与保留

用途撤回先同步标记不可读取/不可新用并提升相关 epoch，再异步清理 Index、Context、Memory、Dataset 与 Capability 派生引用。清理进度可查询，服务端查询与下载代理均按当前权限阻断。敏感数据或要求立即撤销的数据必须通过代理读取；直连对象存储的签名 URL 在到期前可能仍可用，只允许策略明确接受最长 30 秒撤销延迟的非敏感内容，不能宣称可瞬时收回已发 URL 或已下载副本。

业务记录默认软删除，幂等墓碑和法律要求的 Audit 保留。确需法定物理清理时通过独立 Maintenance Command、专用数据库/存储角色和最小删除证明执行；备份中的数据按受控保留到期，并在恢复后重放删除墓碑，禁止复活已撤权数据。

Audit 普通应用身份仅可追加；需要篡改可见时引入签名日摘要/WORM Profile，初始不能声称密码学不可抵赖。Trace 可裁剪/丢弃，Audit 不可用时关键事务失败。

## 6. 迁移、导出与容量

迁移采用 Expand/Backfill/Verify/Contract，独立 Schema Owner 和数据库角色；在安全点/恢复演练通过后执行破坏性 Contract。导入重新生成本地 ID 并维护映射，保留来源身份与版本；Secret 仅为待重绑定 Ref；导入后默认冻结外部写入，重新授权并查回外部映射后才能放行。

导出默认开放目录格式：manifest.json 保存格式/Schema 版本、Scope、快照水位、文件 Hash 与缺失/裁剪说明；records/*.jsonl 保存业务记录、Decision、Action/Operation、Receipt、资源占用和 Audit 的合法导出子集；artifacts/ 保存获准原始文件；schemas/ 保存读取所需公开 JSON Schema。保留稳定 sourceId、外部 ID 与关系映射，金额/时间按公共契约。文件可用通用 JSON/JSONL 工具离线读取，不依赖 ABH 进程或供应商账户；字段缺失和用途限制明确表示。

只读导出绑定一致快照/水位并明确之后仍可能变化；退出导出须先冻结新业务写入，由现有 Owner 导出未决 Operation、Commitment、删除墓碑和接管清单。旧系统继续对账到明确移交，接收方核实幂等映射、凭据控制和未决责任后才获得新写入资格。Snapshot/Grant/Secret 导出是历史证据与重绑定引用，不是可在另一系统直接使用的凭据。不能以导出成功宣称迁移了运行中的 Harness 内存或已消除外部未知。

data.inlineArtifactMaxBytes=64 KiB、upload.maxBytes 默认 100 MiB（领域显式调整）、download.urlTtlSeconds=30（1–30，仅允许直链的数据类别）、lineage.maxParents=100；均为配置 Schema 字段。查询/上传/扫描分资源池，大对象不得挤占 Ledger 事务连接。

database.statementTimeoutMs=5000（100–30000）、database.lockTimeoutMs=1000（1–5000 且不大于 statementTimeoutMs），均为非敏感整数配置、重启生效，运行时取当前请求剩余 Deadline 的更小值；这是普通 UoW 的有界失败上限，不替代 API SLO。特定导出/迁移 Profile 可登记独立上限。RLS/角色检查不可通过开发开关关闭，M0 Fake 也使用普通 runtime 角色。缺少 TenantContext 属内部合同错误 `TENANT_CONTEXT_REQUIRED`，不自动切为 System Context；对外按安全错误 Registry 返回，诊断记录 requestId/Owner/拒绝类别，不泄漏行内容。

`abh doctor data` 校验对象可达性、Hash、备份水位、删除游标和 Audit 权限。指标 artifact_orphan、hash_mismatch、deletion_lag、audit_write_failure、db_tx_latency；不记录内容。

## 7. 测试与模块边界

跨租户 Repository、事务 CAS、逻辑引用一致性、上传各崩溃点、重复文件、伪媒体、过期读取 URL、删除后旧缓存、备份恢复后墓碑、Audit UPDATE/DELETE 拒绝、导出导入不自动恢复写权均为必测。

M0-B 使用真实 PostgreSQL 与 runtime 角色验证：故意漏掉 Repository 租户条件仍读不到其他组织；缺 GUC 时读空/写拒绝；跨租户 INSERT/UPDATE 失败；同池连接按 A → 成功/回滚/取消 → B 复用不串租户；runtime 无法关闭 RLS、SET ROLE 为 Owner、TRUNCATE 或改删 Audit。合法跨组织 Decision 可核验责任并与撤权竞争，非法 Workspace/来源 Ref 被核验函数拒绝；Control/Ledger/Action/Audit/Outbox 在同一 UoW 故障时全部回滚；全局队列认领只返回调度字段，不能读取租户正文。迁移检查须覆盖所有 Tenant 表的 ENABLE/FORCE、策略、角色继承和函数 EXECUTE 权限，不能用管理员连接的测试结果代替。

退出验收使用无 ABH 依赖的读取脚本核对记录数量、关系、外部 ID、金额与 Hash；迁移故障注入覆盖冻结后迟到 Receipt、未决责任无法移交和新旧系统双写拒绝。初期复用现有 ExportScope、JSON Schema 与 Artifact Store，不建设独立迁移平台。

本模块合并物理存储、Artifact 和血缘基础设施；Memory/Knowledge/Result 的内容与迁移由 Core/Domain Owner 分别负责，不建设一个万能业务数据服务。

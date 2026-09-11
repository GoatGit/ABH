# Pack Loader 与 Capability Registry 详细设计

> 版本：1.1 · Owner：Extension Maintainer
>
> Manifest、摘要算法、Trust Mode 的唯一来源：[公共内核与 Pack 运行规范](../00-总体设计/ABH公共内核与Pack运行规范.md)。

## 1. 安装与运行选择

Pack Loader 管理安装、Enabled/Suspended/Retired；Capability Registry 提供已安装能力的版本、兼容和健康查询。Release Controller 决定生产分配，安装不产生业务 Grant。

V1 只接受部署配置和构建期注册，不从网络任意下载执行包。Declarative 由有界解释器运行；TrustedCode 随发行版审查；Isolated 只有部署具备已验收的隔离 Port 才可启用。

## 2. 数据与公开契约

| 数据 | 字段与键 |
|---|---|
| extension.installed_packs | packId/version 唯一、packageDigest、trustMode、signerIdentity、state、compatibilityRef、ctkRef、version |
| extension.capabilities | kind/id/version 唯一、packRef、schemaDigest、implementationRef、permissionEnvelope、healthRef |
| extension.installations | installId、packRef、step、migrationRefs、safetyPointRef、resultRef、idempotencyKey |
| extension.trust_policies | signedVersion、namespaceSignerBindings、allowedModes/egress/dataClasses、revocations |
| extension.schema_ownership | packId/schemaName、dbRoleRef、migrationVersion；Core Schema 不可委托 |

| 接口 | 输入 | 返回 / 错误 |
|---|---|---|
| ValidatePack | localArtifactRef、deploymentTrustPolicyRef、targetProfile | validationReportRef；PACK_DIGEST_INVALID/PACK_SIGNER_DENIED |
| StagePack | validatedPackageRef、expectedDeploymentVersion | packRef、impactReport；PACK_ID_COLLISION |
| EnablePack | packRef、ctkRef、migrationVerificationRef（实际验证或已校验的不适用报告）、approvalRef | Enabled Ref；PACK_MIGRATION_UNVERIFIED |
| SuspendPack | packRef、reason、emergency、expectedVersion | 停新分配/通知既有运行；历史引用保留 |
| QueryCapabilities | kind、exactId/version 或受限 range、scope | 候选 Ref/兼容/健康；不自动选择多候选 |
| ResolveExactCapability | exactRef、assignmentRef、purpose | 不可变 Schema/受信实现句柄；CAPABILITY_REVOKED |

安装命令是部署治理 Command，不能暴露给普通 Agent。Query/错误返回依赖路径但不泄漏宿主路径或秘密。

## 3. 安装主流程

有界归档扫描 → Manifest 校验 → 逐 Artifact 字节摘要与包摘要 → Signer/来源/许可验证 → Trust/依赖 DAG → 验证已签名 CTK 证据（缺少时在隔离环境执行）→ staging → 数据影响检查 → 适用的迁移/回填/投影验证 → Enabled。

无迁移且不改变既有数据/投影时，生成绑定 packageDigest 的不适用报告，不创建空迁移或副本作业。实际变更仍要求隔离演练、已验证安全点、专用角色执行和结果验证；缺失验证不能用空 migrations 掩盖数据影响。同一制品启动只校验内容完整性、信任/兼容/撤回和安装状态，不重复构建、全量 CTK 或已提交迁移；相关验证前提变化时重验。

签名遵循上位规范，Cosign/Sigstore 处理签名和 Attestation，不自行实现加密。CTK 报告独立绑定 Package Digest，不嵌入被测内容形成摘要自循环。生产宿主不得运行未受信包自带测试。

Declarative/Isolated 包不携带 Migration；TrustedCode Migration 限于自有 Schema，由专用角色执行。注册的 Domain Repository 只能获得宿主注入的租户/事务/自有表句柄，不能访问 Core 内部表。

## 4. 故障与升级

每个步骤保存已完成证据 Ref；崩溃后从实际数据库/制品状态验证再续，不按进度字符串假定迁移成功。可事务迁移回滚；非事务迁移需已审核前滚/安全点恢复方案。任一步未验证则新版本保持 Staged。

并行安装以 deploymentVersion/packId 锁串行，同 ID/version 不同 Digest 永久拒绝。新旧版本可并存，旧 Run 固定旧定义；紧急撤回冻结其新调用，未决 Operation 的安全查回由受信兼容能力继续。

本地 `dev` 重编译改变内容时生成新的开发版本与摘要，同样遵守不可变身份；不通过原地覆盖版本实现热更新。构建流程使用同一编译器与公开契约，开发者无需手工维护版本引用。

包移除前检查 Run/Action/Artifact 的引用水位及回滚窗口；不能删掉仍需对账的 Connector 代码。依赖循环、缺版本、命名空间冲突不以“最后加载覆盖”解决。

## 5. 资源、诊断与验收

pack.maxArchiveBytes=100 MiB、maxExpandedBytes=500 MiB、maxEntries=10000、maxManifestBytes=1 MiB；拒绝绝对路径、符号/硬链接、Unicode/大小写歧义和未声明 Payload。TrustPolicy 与 signer allowlist 为敏感部署配置，生产必填；变更需审计。

安装为异步 Job，Query 继承普通 API SLO；编译/扫描限独立 Worker 配额，不占控制队列。`abh doctor pack --id` 输出缺签名、CTK、能力、迁移和引用阻塞。指标 install_step_fail、digest_mismatch、capability_conflict、suspended_reference_count。

CTK 覆盖摘要篡改、合法签名错误发布者、伪造来源、报告替换、解压炸弹、迁移跨 Schema、进程内代码越权、无隔离环境、升级中断、版本固定和删除在用包。

Loader 是独立模块因为安装/迁移有独立生命周期；Capability Registry 作为同模块只读解析组件，避免建立第二发布状态机。

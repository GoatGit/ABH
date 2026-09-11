# Pack Enable 实现要求与现状核对

核对依据：V1 Pack Loader 第 2～4 节、状态与执行契约中的 Installed Pack 状态机。下述缺项不得以巡检 Succeeded、数据影响 NotApplicable 或 Artifact 发布成功替代。

| 必须完成的要求 | 当前权威实现 | 尚缺工作／验收证据 |
|---|---|---|
| 固定包身份、摘要、当前信任和 CTK | `InstalledPackOwner`、`PackValidationReportOwner`、`PackTrustPolicyOwner`、真实 staged 内容恢复 | 已提供独立 CTK 制品写入／回读与真实提案装配；Enable 命令已在同一事务消费这些事实，启动检查不得重复执行包内测试 |
| 无 SQL 且无数据／投影变化时保存并复核不适用报告 | `recordMigrationNonApplicability`、`readMigrationNonApplicability`、专用生成契约 | 在 Enable 的同一 UoW 消费，不以候选发现结果代替当前报告读取 |
| 实际变更的完整验证 | 已有迁移执行、结构／数据检查、签名报告、巡检 Job | Domain、回填、投影验证仍缺完整实施；不能将结构／数据巡检冒充完整验证 |
| 启用审批精确绑定待启用内容 | `human/approval-proof.ts` 提供 Action 与 Pack 专用审批消费 | 已实现 PackEnableProposal 摘要／exactRef／证据／影响绑定及实际不可变能力集合 Ref／摘要／完整子记录复核及当前席位、责任、Grant、期限、条件检查；真实 Human Gateway 链路已覆盖。已完成当前 CTK／不适用报告提案装配与正式 RequestPackEnableCommand，并贯通真实 Human 审批消费；已接联合 Enable Grant／审批消费／证据重建；已接原子状态写入；正式 Enable 命令及历史回执重放已完成当前分支；实际变更完整验证分支和运行时选择仍缺 |
| 独立管理命令与当前授权 | Stage／数据影响／巡检已有管理动作 | 已新增内部 EnablePack 命令契约、独立动作与联合准入；已有只追加能力登记 Owner 与受控状态写入，已有正式 Enable 命令／幂等重放，仍需运行时激活，不向普通 Agent 暴露安装命令 |
| Staged → Enabled 的受控版本迁移 | `InstalledPackRecord` 支持 Staged/version 1 与带完整 enablement 的 Enabled/version 2；迁移 `1788886000000` 开放受控生命周期列写入，精确 CHECK／权限纳入 manifest 58 | 已新增独立部署版本 Owner、安装历史 exactRef、旧库历史迁移及 Stage 原子 CAS；已实现 applyPackEnable 的准入／CAS／历史／部署版本／Audit／Outbox 同事务及调用方 Receipt 回滚验证；已新增历史重放准入，仍需运行时能力解析 |
| 安装步骤和恢复事实 | 当前有 staged 安装及 inspection_jobs；没有完整 installations Owner | 保存每步证据、恢复时重新检查真实数据库／制品，不从步骤字符串推断成功 |
| 能力注册与运行可见性 | 已有完整显式构建期能力映射、实际字节／Schema／安装准入及 staged 恢复装配；已持久化只追加静态能力身份和完整集合；已增加独立读取权限的 Enabled 候选查询；已增加内部同事务 exact resolve、实际 Assignment／Pin、包／Schema 字节与部署注入实现装配；仍需生产 Gateway 与每次调用的运行门禁 | 不可变能力身份、兼容／健康查询、exactRef 解析、启用／挂起对新分配的影响 |
| Suspend／Retire 与历史引用 | V1 状态契约已登记，持久安装支持 Staged 与 Enabled；未实现挂起／退休 | 引用水位、回滚窗口、旧 Run 固定、未决 Operation 安全查回、禁止删除仍在用代码 |

实现顺序：部署治理审批契约与正式 Human Gateway 绑定已完成当前 NotApplicable 分支；已建立受控安装生命周期写入及数据库门禁，已补齐正式命令重放，已有有界候选查询，已提供内部精确解析，接下来完成生产运行装配及调用治理；完整实际变更验证不足的包继续拒绝 Enable。之后完成能力运行时查询／解析、挂起／恢复与引用保留。任何中间交付不得声明 V1 全部完成。

本表依据当前实现更新，历史批次的状态描述以后续记录为准。Core 全量回归结果单独记录，测试通过本身不能证明上表未实现项完成。

派发与查回入口均已在异步等待前固定本次 Connector 方法和身份；查回同时固定独立策略、计费与超时数据。这些边界加固不替代上表要求的生产运行装配及每次调用治理校验。

能力候选 HTTP 查询已通过显式 capabilityQuery 安装接入真实 IdentityIngress 和独立读取权限；未安装时不注册路由（404）。生产治理默认配置及 Gateway 执行装配仍缺，HTTP 候选发现不产生运行授权。

新增内部 dispatchPackOnce，把两阶段精确解析接到出口事务的提交前准入，并固定实际 Connector 方法。T1 必须预先纳入同组 capability fences；查询出口装配、生产默认治理和真实签名非空包成功派发联合验收仍待完成。

新增内部 queryPackOnce，支持当前 Enabled 原精确 Connector 的提交前解析及独立查询权限／预算。已补早期 fences 与 Deployment 在 Lease 之前的锁顺序。完整成功查回及暂停／撤回后的兼容恢复验收仍缺。

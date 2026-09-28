# CLI、Distribution 与运维详细设计

> 版本：1.2 · Owner：Release / Runtime Maintainers
>
> 制品：abh-core、abh-full、abh-dev、@abh/cli；MIT。

## 1. 部署与依赖

三个发行组合共用相同代码、镜像和兼容版本：abh-core 提供 server/API/Worker 与公开包；abh-full 增加可选 Workbench；abh-dev 提供显式 Development 配置、Compose/Fake/示例。M0 默认一个 server（内置有界 Worker）加 PostgreSQL，web 默认关闭。M1 真实写入增加独立 Worker 与生产身份/Secret 能力，已有页面不要求换成 ABH Workbench；发行组合不维护三条产品代码分支。

HTTP 应用采用 Fastify 5，入口使用 Contract Package 编译的 Ajv 8 校验器；PostgreSQL 访问采用 postgres.js，经 Repository/UoW 管理事务；数据库迁移使用 node-pg-migrate 的 PostgreSQL 迁移机制，Pack Runner 只封装权限、计划与证据。不再自研 HTTP 路由、驱动或迁移历史引擎。具体补丁版本、许可证和镜像 Digest 在发行锁文件冻结。

Web 用既定 Next.js 栈；不把 Fastify 与 Next.js BFF 当成两套业务 Service，BFF 仅会话/体验聚合。

## 2. CLI 合同

| 命令 | 必填/可选参数 | 输出 / 权限 |
|---|---|---|
| init | template、directory | business.ts、abh.config.json、构建/示例脚本和可选 Compose；拒绝覆盖非空目录，显式 force 仍先给差异 |
| dev | profile=development、config | 校验并编译业务声明、装配默认 server/有界 Worker；web 仅在配置启用；只操作自身 pid/端口 |
| doctor | module?、id?、format=text/json | checkId/status/evidenceRef/remediation；默认只读、无敏感出站 |
| pack validate/test/build/sign | path、profile/output/keyRef | 验证/CTK/制品/签名；sign 从安全凭据引用读取 |
| conformance | profile、manifest、report | 可复现报告，不静默跳过失败 |
| upgrade plan | targetVersion、config | 兼容差异、迁移、备份、预计停机与回退 |
| upgrade apply/verify | planDigest、safetyPointRef、authorityRef | 受审计迁移/验证 Receipt；摘要不匹配拒绝 |
| export/import | scope、manifest/output、purpose、authorityRef | 有界数据 Job；导入默认冻结写入 |

CLI 返回 0 成功、2 输入/配置、3 身份权限、4 前置/兼容、5 测试门禁、6 依赖不可用、7 部分完成需恢复；JSON 输出固定 commandRef/status/errorCode/evidenceRefs。未知 flag 拒绝，日志与机器输出分 stdout/stderr。

## 3. 配置 Schema

配置分 deployment、identity、database、runtime、control、resources、extensions、model、web、observability。每项登记类型、默认、范围、敏感级别、热更新/重启和适用 Profile；未声明环境变量不得影响执行。

Quickstart 只要求显式 Development、数据库连接/生成 Compose、业务入口路径；模板生成有限 Fake 身份与资源配置，`web.enabled=false`。选择 Agent 模板时使用锁版 Pi 和离线 Fake Model，无需作者逐项构造 Port。运行能力清单由注册业务与显式配置编译；只含独立 Action 的应用不加载 Agent/学习/Workbench 的模块代码、Worker 或必需配置。模板按能力生成静态依赖，包管理器在安装/构建时解析；缺少可选包时输出明确安装指令，运行时不联网安装。专业参数在默认值不能满足需求时才展开。

生产切换必须替换测试身份、绑定 Scope/用途/资源上限、注册 Connector 及生产 Secret；命令必须输出实际启用能力、外部服务和缺失项。能力配置减少不能停止未决 Operation/Commitment 的对账/清理；退出检查发现残余责任时拒绝卸载相关能力。

Secret 使用 Ref，文件权限最小化；production=true 与开发 Identity/Fake/unsigned Pack/开放出口并存时启动失败。所有组件 readiness 检查当前 Schema/Port/Capability，而不仅端口连通；CLI 不擅自 kill 无法证明归属的其他进程。

数据库连接配置分别绑定 runtime、队列与一次性 migration/maintenance 角色；普通 server/worker 不加载迁移凭据。M0 生成配置也遵循 [RLS/UoW 角色合同](28-Data-Artifact与Audit详细设计.md#11-数据库角色与-rls)，不因使用 Fake 而以超级用户执行业务。doctor data/启动检查核对表归属、ENABLE/FORCE RLS、角色继承/权限、受限函数及无会话级租户默认值；任一越界拒绝 readiness。Statement/lock timeout 的默认值继承 Data 配置。

## 4. 启动、升级与回滚

启动：校验配置/锁版 → 连库检查迁移版本 → 验 Pack/Policy/Secret/身份能力 → 创建服务 Principal → 启动 API/Worker → readiness。外部模型故障标对应能力 unavailable，不让 Core health 伪报整个系统可写。

升级：plan → 备份/安全点验证 → 冻结新增高风险写 → Expand 迁移 → 兼容应用 → 回填/投影 → CTK/关键冒烟 → 放行；Contract 在旧版退出和回退窗口后独立执行。apply 崩溃从迁移与 Owner 实际记录恢复，不能凭 CLI 进度文件判断完成。

回滚先验证旧代码理解当前数据与 Policy；不兼容时前滚修复并保持写冻结。区域恢复遵循 NFR，撤旧 Worker 出口资格、提升恢复 Epoch、回查外部副作用，不只恢复数据库后立即发 Job。

## 5. 供应链、许可与社区

pnpm 锁依赖；Turborepo 执行构建；Changesets 发版本；Syft 生成 SBOM；CodeQL/OSV/Gitleaks/Trivy/许可扫描形成门禁；Cosign 签制品及构建 Provenance。规范/代码 MIT，论文 CC BY 4.0，第三方保留 LICENSE/NOTICE。

支持线上源码审查与 DCO；公开 SECURITY.md、维护者/发布责任、漏洞受理流程。漏洞响应初始目标：高危报告 2 个工作日确认，已确认且有可利用路径的 Critical 72 h 内提供缓解/修复计划；正式时限由维护能力与公开政策验证，不能假称已有值守团队。

## 6. 观测与操作验收

OpenTelemetry 默认只做本地裁剪或显式 OTLP；项目遥测、许可检查和自动上报默认关闭。健康检查不调用付费模型或执行外部写入；生产 SLO 证据可以复用现有后端，无可复用时才部署参考监控 Profile。

Clean-room 测安装、15 分钟人工操作 Quickstart、断网 Fake 闭环、代理/CA、只读文件系统、amd64/arm64、配置缺失、升级中断、回滚不兼容、备份恢复、数据导入、旧服务端口冲突与签名篡改。每条路径输出明确恢复指令，不能以“运行成功”隐藏部分迁移。

最小启动测试须核对实际进程/依赖：只有 server 与 PostgreSQL；无 Web/模型/学习配置的独立 Action 可运行；启用 Workbench 才启动 web。示例使用 SDK 展示完整决定包和结果，不新增通用终端管理系统。默认构建不要求用户配置包签名服务；签名与供应链工具在正式发布步骤执行，未签名开发例不能切入生产。

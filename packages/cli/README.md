# @abh/cli

当前支持 `init`、`pack build`、`pack compile-business`、`pack validate`、`pack verify`、`pack sign`、`doctor data`、`doctor learning --candidate`、`doctor pack`、`doctor ledger`、`doctor release`、`doctor operation` 与 `doctor inspection`。

## doctor data

`abh doctor data` 检查实际 PostgreSQL 16 角色、Schema、RLS、权限、约束、索引、受限函数、队列存储和已登记隔离 Pack 存储。诊断复用 Core 启动安全清单，仅连接 runtime 账户，不加载维护凭据，不执行迁移或修复。

仓库内先安装依赖并构建 Core，再调用：

```sh
pnpm --filter @abh/core build
# 通过受保护的环境注入设置 ABH_DATABASE_RUNTIME_URL。
pnpm abh doctor data --format json --timeout-ms 10000
```

直接调用 `node packages/cli/bin/abh.mjs doctor data --format json` 可获得无 pnpm 脚本前缀的机器输出。包声明了 `abh` bin；当前仍是工作区预览包，尚未发布发行版。

唯一读取的连接配置是 `ABH_DATABASE_RUNTIME_URL`：必须是含显式主机、用户和数据库的 `postgres:` 或 `postgresql:` URL，默认端口 5432。密码可为空，不从环境 `PGPASSWORD` 补全。允许的查询参数仅 `sslmode=disable|require|verify-full`；缺省为 disable，TLS 由部署显式配置。其他查询参数、重复参数、URL fragment 拒绝。普通 `PG*` 环境变量不会覆盖连接、只读设置或开启驱动调试日志。

`--format` 接受 `text`（默认）或 `json`；`--timeout-ms` 接受 100 至 30000 毫秒，默认 10000。未知命令、未知或重复 flag、缺失参数与非法范围均拒绝。退出码：0 通过，2 参数／配置错误，3 身份权限错误，4 安全清单不匹配，6 依赖失败或期限／取消。SIGINT／SIGTERM 中止检查并关闭专用连接。

结果由 Contract Package 的 `DatabaseDiagnosticResult` 与 `CliDoctorDataResult` Schema 定义，CLI 输出前进行合同校验。JSON 固定输出 `commandRef/status/errorCode/evidenceRefs/checkId/violationCount/remediation`。只读检查没有写入 Command 或证据 Artifact，因此 `commandRef=null`、`evidenceRefs=[]`；不会生成虚假的持久证明。stdout 仅输出结果，stderr 仅输出稳定错误码，不输出原始 SQL、数据库错误、连接 URL 或目录对象名称。`violationCount` 表示安全清单不匹配项数；修复仍需维护流程与相应权限。

## doctor inspection

## doctor learning --candidate

`abh doctor learning --candidate --organization-id <UUID>` 使用受限 runtime 数据库连接只读检查 Learning Candidate 的发布就绪证据。可选 `--candidate-id <UUID>`、`--workspace-id <UUID>`、`--asset-kind <name>`、`--limit 1..100`；`--format` 和 `--timeout-ms` 语义与其他 doctor 命令一致。

诊断在本地事务中设置组织、acting organization、workspace 和 `abh.learning.read` 用途上下文，受 RLS 约束，按 `(created_at,id)` 倒序最多读取 101 行；第 101 行只用于标记 `truncated`，不会进入结果。每条候选输出 profile 数量和唯一 Profile Ref、Evaluation Run Refs 与已收口数量、Gate Ref、按 Gate 反查的 Release Refs、必需/已撤用途，以及 `PURPOSE_WITHDRAWN`、`PROFILE_MISSING`、`PROFILE_AMBIGUOUS`、`EVALUATION_MISSING`、`EVALUATION_UNSETTLED`、`GATE_MISSING`、`RELEASE_NOT_LINKED`。

命令只做诊断，不创建 Gate、Release 或 Assignment，不重跑评测，也不修复撤回。成功输出由 `CliDoctorLearningResult` 约束，`commandRef=null`、`evidenceRefs=[]`，不伪造新证据。原始 SQL、驱动错误和连接串不会输出；参数／配置为 2，权限为 3，存在 stop reason 为 4，依赖或期限为 6。

## doctor pack

`abh doctor pack --organization-id <UUID> --pack-id <name> --pack-version <version>` 使用受限 runtime 数据库连接只读检查一个精确安装记录。`--format` 和 `--timeout-ms` 语义与其他 doctor 命令一致。

诊断在同一 `READ ONLY` 事务中核验 Manifest 身份、状态列、版本、部署版本和三组持久摘要；验证报告与信任策略的精确引用/摘要绑定；信任策略签名字段和有效期；Capability Set 与每个子注册的身份、摘要和声明集合；以及当前部署修订指针。输出 `RECORD_DRIFT`、`VALIDATION_EVIDENCE_MISSING`、`GOVERNANCE_EVIDENCE_MISSING`、`CAPABILITY_REGISTRATION_INVALID`、`DEPLOYMENT_REVISION_MISSING`、`ENABLEMENT_MISSING`、`SUSPENSION_MISSING` 或 `RETIREMENT_MISSING` 中的实际缺失项。

命令只读数据库，不读取 Package payload，不重验 Cosign 密码学，不查询 runtime 无权访问的全局迁移 Journal，不启用、暂停、退役或修复 Pack。`manifestMigrationCount` 只是 Manifest 声明数，不是迁移执行证明。成功输出由 `CliDoctorPackResult` 约束，`commandRef=null`、`evidenceRefs=[]`；退出码与 learning doctor 一致。

## doctor ledger

`abh doctor ledger --organization-id <UUID> --ledger-id <UUID>` 使用受限 runtime 数据库连接和同一个 `READ ONLY` 事务审计一个 Ledger。诊断最多重建 10,000 条 immutable entries，第 10,001 条只用于标记 `ENTRY_LIMIT_EXCEEDED`；同时核对 Ledger 规范化列、Outbox 版本、余额、Held Reservation、Open Commitment 和到期 Held。可选输出原因包括 `LEDGER_RECORD_DRIFT`、`ENTRY_RECORD_INVALID`、`ENTRY_LIMIT_EXCEEDED`、`BALANCE_DRIFT`、`OBLIGATION_DRIFT` 和 `EXPIRED_HOLD`。

命令固定 `abh.resource.read` 用途，只输出有界诊断，不写 Command、不写 evidence、不释放 Hold、不结算 Usage、不提交 Commitment，也不修复任何数据。修复必须继续走受审计 Ledger Command。成功输出由 `CliDoctorLedgerResult` 约束，`commandRef=null`、`evidenceRefs=[]`；退出码与 learning doctor 一致。

## doctor release

`abh doctor release --organization-id <UUID> --release-id <UUID>` 使用受限 runtime 数据库连接只读检查 Capability Release 的安装与执行就绪状态。可选 `--workspace-id <UUID>`；`--format` 和 `--timeout-ms` 语义与其他 doctor 命令一致。

```sh
# 通过受保护的环境注入设置 ABH_DATABASE_RUNTIME_URL。
pnpm abh doctor release --organization-id 11111111-1111-4111-8111-111111111111 --release-id 22222222-2222-4222-8222-222222222222 --format json
```

诊断检查 Release 用途、Gate Artifact／Learning Gate 证据、兼容性 Artifact、按 exact ref 安装的 Capability、Assignment 数量与执行准入、当前 pin set，以及可覆盖相同行为槽的 Ready 回退候选。输出 `GATE_EVIDENCE_INVALID`、`COMPATIBILITY_INVALID`、`CAPABILITY_NOT_INSTALLED`、`ASSIGNMENT_MISSING`、`EXECUTION_NOT_ALLOWED`、`PIN_UNAVAILABLE`、`ROLLBACK_CANDIDATE_MISSING` 中的实际缺失项。

命令只做诊断，不安装 Pack、创建 Assignment、修复 Gate、生成 pin 或编排回退。成功输出由 `CliDoctorReleaseResult` 约束，`commandRef=null`、`evidenceRefs=[]`，不伪造新证据。原始 SQL、驱动错误和连接串不会输出；退出码与 learning doctor 一致。

## init

`abh init --template action-only [--directory <path>] [--force]` 创建显式 Development 配置、受限数据库角色环境引用、Action-only 业务入口和本地检查脚手架。配置会通过 `resolveDevelopmentConfig` 校验；默认只输出凭据环境变量名，不读取或写入值。

目标已存在且非空时返回 `TARGET_NOT_EMPTY`，不会改写文件。`--force` 只允许替换模板自有文件；替换前输出有界 unified diff，并保留调用方新增的其他文件。非普通文件目标 fail-closed。JSON 成功输出包含 `commandRef:null`、`errorCode:null` 和 `evidenceRefs:[]`；当前命令只生成工程脚手架，不启动服务，也不把模板当作生产可用装配。

## pack validate

`abh pack validate --root <dir> --manifest <file> --policy <file>` 执行有界本地内容预检：复核 Pack Manifest、显式部署策略准入、声明 payload 文件的精确字节和 manifest/artifact-set/package 摘要。Core 扫描会拒绝 symlink、hard link、未声明文件、重复引用和越界内容；命令不执行 Pack 内代码。

## pack build

`abh pack build --root <dir> --manifest <draft.json> --output <file>` 从已声明的 payload 生成规范 JSON Manifest：读取精确字节、写入 Artifact/Migration 尺寸与 SHA-256，并计算 manifest/artifact-set/package 摘要。输出使用固定 proof 引用，但不会创建签名、来源或 CTK 文件。扫描同样拒绝链接、未声明文件、重复引用和越界内容，输出已存在时 fail-closed。

`abh pack compile-business --business <file> --output <manifest.json>` 先封闭重验 `defineBusiness` 声明和摘要，再生成 `manifest.json`、`manifest.business.json` 与 `manifest.ctk-plan.json`。CTK 计划固定 `NotRun`；命令只写本地候选，不签名、不创建正式 CTK 证据、不安装、不启用或执行 Pack。

## pack sign

`abh pack sign --manifest <file> --pack-id <id> --cosign <path> --key-ref <ENV> --public-key-ref <ENV> --output <bundle>` 调用部署方固定的 Cosign 对 `signaturePayload` 原文签名。私钥和解密口令只通过命名环境引用注入；输出前使用显式公钥执行独立的 `verify-blob` 回验，bundle 以 0600 新建且不覆盖。命令不创建 provenance/CTK，不安装 Pack，也不授运行时 authority。

## pack verify

`abh pack verify --root <dir> --manifest <file> --policy <file> --trust <file>` 复核声明 payload 字节、三组摘要、发布签名、SLSA provenance 和签名 CTK 报告，并输出有界 `PackValidationReport` 摘要。验证在同一个只读快照和 100..30000ms 期限内完成；输出只包含身份、摘要和时间，不包含公钥、宿主路径或 CTK 载荷。通过不安装 Pack，也不授运行时 authority。

本地 policy 文件只表示显式开发/验收输入，不作为运行时治理或授权来源。命令成功不代表签名、来源、CTK、安装或执行已通过；它也不注册能力、迁移数据或改变 Pack 状态。失败映射为契约化 JSON，`commandRef=null`、`evidenceRefs=[]`，不返回路径内容、原始异常或凭据。

## doctor operation

`abh doctor operation --organization-id <UUID> --operation-id <UUID>` 使用受限 runtime 数据库连接只读展示 Operation 恢复事实。可选 `--workspace-id <UUID>`；`--format` 和 `--timeout-ms` 语义与其他 doctor 命令一致。

诊断展示原 intent digest、最新 Permit 与有效期、尝试次数、Receipt 数量和最后外部观察水位、最新 Reconciliation 判定，以及 resource fence 是否仍保留责任。它据此报告 permit/receipt/reconciliation 缺失、Unknown 保留或未受保护、关闭无对账，以及当前 Pending dispatch 是否具备安全续跑条件。

命令不调用外部 Provider、不重新派发、不提交对账、不释放 resource fence，也不把 `safeRetry=true` 当作绕过当前授权/fence/lease 的许可。成功输出由 `CliDoctorOperationResult` 约束，`commandRef=null`、`evidenceRefs=[]`。原始 SQL、驱动错误和连接串不会输出；退出码与 release doctor 一致。

`abh doctor inspection --id <Job UUID>` 经公开 SDK 调用 `abh.pack-inspection-jobs.inspect` 的 Strong 查询。API 服务必须已安装该路由、可信身份入口，以及同组织管理 Service 的当前 Grant／部署／证据读取准入；CLI 不传入 actor、Purpose、Grant 或修复指令，也不连接业务数据库。

```sh
# 通过受保护的环境注入设置 ABH_API_BASE_URL 与 ABH_API_TOKEN。
pnpm abh doctor inspection --id 11111111-1111-4111-8111-111111111111 --format json
```

该 ID 是持久巡检 Job 的 ID，不是 Pack ID。`ABH_API_TOKEN` 是 API 接受的当前 Bearer 凭据，不能放在命令行参数中；不从其他环境变量推导身份。API 地址只允许 HTTPS，或显式 loopback HTTP（localhost、127.0.0.1、[::1]）；拒绝 URL 内嵌凭据、查询串、fragment 和重定向。服务端负责凭据映射和组织绑定；生产 IdP 与 Secret Ref 解析仍需安装。

支持 `--format text|json` 和 `--timeout-ms 100..30000`，默认 text／10000 毫秒；响应最多 64 KiB，无自动重试。未知／重复参数拒绝。返回的 Job ID 必须匹配请求，Strong 响应不得标为 stale，元数据评估时间必须与诊断一致。取消或期限结束只结束读取等待，不取消 Job，也不调用修复命令。

输出由 `CliInspectionDiagnosticResult` 约束：`commandRef=null`，成功读取为 `status=Reported`、`errorCode=null`；`diagnostic` 保存真实 Job 状态、评估时间、Refs、剩余预算和下一步建议。顶层 evidenceRefs 必须与诊断中的已有证据 Ref 一致，不生成新的证明。失败时 diagnostic=null、evidenceRefs=[]。stdout 仅输出结果，stderr 仅输出稳定错误码，不打印 API 凭据、原始错误或响应正文。

退出码 0 只表示取得有效诊断，**即使 Job 已 Failed，仍返回 Reported／0**；脚本应读取 diagnostic.status 与 nextStep，不能把命令成功当成业务成功、验证通过或 Enable。输入／配置错误为 2，身份权限为 3，不存在／不可见或前置兼容错误为 4，依赖／协议／期限／取消为 6。文本输出包含 Job、评估时间、预算、证据 Ref 和人工可读建议。

尚未提供 dev、完整签名 Pack 验证、test/build/sign、升级、导入导出、完整配置 Schema、生产 Secret Ref 解析或发行打包。这些命令不会被当作成功的空操作。

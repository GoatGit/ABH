# @abh/cli

当前支持 `doctor data` 与 `doctor inspection`。

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

`abh doctor inspection --id <Job UUID>` 经公开 SDK 调用 `abh.pack-inspection-jobs.inspect` 的 Strong 查询。API 服务必须已安装该路由、可信身份入口，以及同组织管理 Service 的当前 Grant／部署／证据读取准入；CLI 不传入 actor、Purpose、Grant 或修复指令，也不连接业务数据库。

```sh
# 通过受保护的环境注入设置 ABH_API_BASE_URL 与 ABH_API_TOKEN。
pnpm abh doctor inspection --id 11111111-1111-4111-8111-111111111111 --format json
```

该 ID 是持久巡检 Job 的 ID，不是 Pack ID。`ABH_API_TOKEN` 是 API 接受的当前 Bearer 凭据，不能放在命令行参数中；不从其他环境变量推导身份。API 地址只允许 HTTPS，或显式 loopback HTTP（localhost、127.0.0.1、[::1]）；拒绝 URL 内嵌凭据、查询串、fragment 和重定向。服务端负责凭据映射和组织绑定；生产 IdP 与 Secret Ref 解析仍需安装。

支持 `--format text|json` 和 `--timeout-ms 100..30000`，默认 text／10000 毫秒；响应最多 64 KiB，无自动重试。未知／重复参数拒绝。返回的 Job ID 必须匹配请求，Strong 响应不得标为 stale，元数据评估时间必须与诊断一致。取消或期限结束只结束读取等待，不取消 Job，也不调用修复命令。

输出由 `CliInspectionDiagnosticResult` 约束：`commandRef=null`，成功读取为 `status=Reported`、`errorCode=null`；`diagnostic` 保存真实 Job 状态、评估时间、Refs、剩余预算和下一步建议。顶层 evidenceRefs 必须与诊断中的已有证据 Ref 一致，不生成新的证明。失败时 diagnostic=null、evidenceRefs=[]。stdout 仅输出结果，stderr 仅输出稳定错误码，不打印 API 凭据、原始错误或响应正文。

退出码 0 只表示取得有效诊断，**即使 Job 已 Failed，仍返回 Reported／0**；脚本应读取 diagnostic.status 与 nextStep，不能把命令成功当成业务成功、验证通过或 Enable。输入／配置错误为 2，身份权限为 3，不存在／不可见或前置兼容错误为 4，依赖／协议／期限／取消为 6。文本输出包含 Job、评估时间、预算、证据 Ref 和人工可读建议。

尚未提供 doctor pack/operation、init/dev、pack 操作、升级、导入导出、完整配置 Schema、生产 Secret Ref 解析或发行打包。这些命令不会被当作成功的空操作。

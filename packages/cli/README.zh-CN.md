# @abh/cli

[English](./README.md) | 简体中文

`abh` 命令行：工程脚手架、Pack 工具与只读诊断。当前是工作区预览包，尚未发布发行版。

## 命令一览

| 命令 | 用途 |
| --- | --- |
| `abh init` | 从模板创建 Action-only 业务脚手架 |
| `abh pack build` | 从声明的 payload 生成规范 JSON Manifest |
| `abh pack compile-business` | 把 `defineBusiness` 声明编译为 manifest + CTK 计划 |
| `abh pack validate` | 按显式部署策略做有界本地内容预检 |
| `abh pack verify` | 复核 payload 字节、三组摘要、签名、provenance 与签名 CTK 报告 |
| `abh pack sign` | 用部署方固定的 Cosign 对 Pack 签名 |
| `abh doctor data` | 只读的数据库安全清单诊断 |
| `abh doctor learning --candidate` | 检查 Learning Candidate 的发布就绪证据 |
| `abh doctor pack` | 检查一条精确的 Pack 安装记录 |
| `abh doctor ledger` | 重建并审计一个 Ledger（上限 10,000 条） |
| `abh doctor release` | 检查 Capability Release 的安装与执行就绪状态 |
| `abh doctor operation` | 展示 Operation 恢复事实（Permit、Receipt、对账） |
| `abh doctor inspection` | 经公开 SDK 查询持久巡检 Job |

## 通用约定

- **doctor 命令只读。** 它们在 `READ ONLY` 事务内经受限 runtime 连接（`ABH_DATABASE_RUNTIME_URL`）执行，不做迁移、不做修复，也不伪造证据——成功输出固定 `commandRef=null`、`evidenceRefs=[]`。修复必须走受审计的命令流程。
- **连接 URL 规则。** `ABH_DATABASE_RUNTIME_URL` 必须是带显式主机、用户、数据库的 `postgres:`/`postgresql:` URL。允许空密码；绝不读 `PGPASSWORD`。查询参数只接受 `sslmode=disable|require|verify-full`（默认 disable）。其他参数、重复参数与 fragment 一律拒绝；普通 `PG*` 环境变量不会覆盖任何设置。
- **输出。** `--format text|json`（默认 text）、`--timeout-ms 100..30000`（默认 10000）。stdout 只输出结果，stderr 只输出稳定错误码——不含原始 SQL、驱动错误、连接 URL 或目录对象名。
- **退出码。** `0` 通过 · `2` 参数/配置错误 · `3` 身份权限错误 · `4` 安全清单不匹配（或 stop reason／资源不可见，视命令而定）· `6` 依赖失败、期限或取消。

## 具体命令的注意点

- `abh doctor data` 会对真实数据库重放 Core 的启动安全清单（角色、Schema、RLS、权限、约束、索引、受限函数、队列存储）。先构建 Core：`pnpm --filter @abh/core build`。
- `abh doctor inspection` 走 HTTP API 而不是数据库：设置 `ABH_API_BASE_URL` 与 `ABH_API_TOKEN`（仅 HTTPS 或显式 loopback；URL 内不得嵌凭据）。退出码 0 只表示取得了有效诊断——**即使 Job 已 Failed，仍返回 Reported/0**，脚本必须读 `diagnostic.status` 与 `nextStep`。
- `abh init --template action-only` 生成的脚手架经 `resolveDevelopmentConfig` 校验；只输出凭据环境变量名，不读取或写入值。目标非空返回 `TARGET_NOT_EMPTY`；`--force` 只替换模板自有文件，替换前输出有界 diff。
- Pack 命令会扫描 symlink、hard link、未声明文件、重复引用与路径穿越，且从不执行 Pack 内代码。`pack build`/`compile-business` 只写本地候选；`pack sign` 的密钥只经命名环境引用注入，输出前用 `verify-blob` 独立回验，bundle 以 0600 新建；`pack verify` 通过不安装 Pack，也不授予运行时 authority。

## 尚未实现

`dev`、完整签名 Pack 验证、升级、导入导出、完整配置 Schema、生产 Secret Ref 解析与发行打包。缺失的命令会直接报错，不会被当作成功的空操作。

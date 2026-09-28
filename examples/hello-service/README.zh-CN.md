# hello-service — `abh run` 参考部署

[English](./README.md) | 简体中文

一个最小但完整的 ABH 服务部署示例：`abh run` 直接装配本目录的 `service.mjs`，连接真实 PostgreSQL（含 96 个迁移与 pg-boss 队列），通过公开 HTTP 契约提供 Mission 生命周期命令与查询。

## 组成

- `abh.config.json` — Development 配置；`runtime.businessEntry` 指向 `service.mjs`
- `service.mjs` — `createAbhServiceInstallation` 参考实现：
  - 身份：校验 Bearer token 并映射到已 provision 的身份（`deployment.identity_locations`）；生产请替换为真实 IdP 验证
  - 授权：每次调用从 `control.grants` 读取当前 Grant，Core 在每个事务内重验
  - 定义：CreateMission 只接受 `definitions.json` 注册的 workflow/条件/资源包络，且 workflow digest 必须绑定 goal artifact
  - 授权激活：ActivateMission 解析 `deployment.mission_authorities` 中的当前 MissionAuthority
  - 队列：真实 pg-boss 适配器（schema 40）+ `LocalDrainJournal` 持久 drain 证据
  - 启动检查：绑定数据库就绪检查后才监听端口

## 运行步骤

```sh
# 1. 启动 PostgreSQL 16（示例值，请用受保护机制注入真实口令）
docker run -d --name abh-hello -e POSTGRES_PASSWORD=devpass -p 54329:5432 \
  postgres:16

# 2. 应用迁移（migration_runner 是专门的维护角色）
export ABH_DATABASE_MIGRATION_URL='postgres://postgres:devpass@127.0.0.1:54329/postgres'
pnpm --filter @abh/core migrate

# 3. Provision 身份、Grant、Fence、MissionAuthority（幂等），并设置受限角色口令
export ABH_PROVISION_ADMIN_URL="$ABH_DATABASE_MIGRATION_URL"
export ABH_ORGANIZATION_ID='00000000-0000-4000-8000-000000001234'
export ABH_SERVICE_TOKEN='dev-token-0123456789abcdef'
export ABH_RUNTIME_PASSWORD='runtimepass'
export ABH_QUEUE_PASSWORD='queuepass'
node provision.mjs

# 4. 启动服务（两个受限角色连接 + 游标密钥 + drain 目录）
# 不要用维护/admin 连接启动服务，就绪检查会拒绝
# 注意：队列 schema 的内部表由队列角色在首次启动时创建——首个连接必须是 abh_queue。
# 若曾用超级用户连接过 abh_pgboss，请 DROP SCHEMA abh_pgboss CASCADE 后重建再启动。
export ABH_DATABASE_RUNTIME_URL='postgres://abh_runtime:runtimepass@127.0.0.1:54329/postgres'
export ABH_DATABASE_QUEUE_URL='postgres://abh_queue:queuepass@127.0.0.1:54329/postgres'
export ABH_CURSOR_KEY='00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
export ABH_DRAIN_DIR="$PWD/.drain"; mkdir -p "$ABH_DRAIN_DIR"
pnpm abh run --config abh.config.json --host 127.0.0.1 --port 3000

# 5. 调用（在任何已迁移数据库上，例如创建一个 Mission 后）
curl -s http://127.0.0.1:3000/v1/queries/abh.missions.list \
  -H 'authorization: Bearer dev-token-0123456789abcdef' \
  -H 'x-abh-organization: 00000000-0000-4000-8000-000000001234' \
  -H 'x-abh-purpose: abh.mission.manage'
# => {"asOf":"...","missions":[]}

# 排障：ABH_RUN_DEBUG=1 会在 stderr 追加依赖失败的根因（可能含上游文本，勿在生产常开）
```

## 边界

- `ABH_SERVICE_TOKEN` 单令牌身份与 `x-abh-*` 头是**开发形态**：生产必须换成真实 IdP 验证（参见 workbench 的 `identity-production.ts`），组织/用途由验证后的 token 声明决定
- 本示例未安装租户 Worker 循环（`runtime.tenant`）与 Projection SSE 订阅装配；按部署需要逐步加入
- `definitions.json` 与 `deployment.mission_authorities` 是部署拥有的注册表样例，不是框架内置治理

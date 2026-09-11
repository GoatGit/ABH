
## 2026-09-09：Mission Draft Owner 与条件版本

Mission 状态枚举及设计列明的迁移进入统一状态 Registry，新增 MissionRecord、MissionConditionInput/Record、CreateMissionPayload 和内部 CreateMissionCommand。条件摘要绑定目标 revision 与所有条件引用，goalRevision 与 aggregate version 分离；Draft 禁止携带执行 Authority/Run/暂停或清理事实。状态 Registry 仅定义允许的协议，不能作为尚未实现迁移的完成证据。

新增 core.missions 与 core.mission_conditions，启用强制租户 RLS、受限 Runtime 权限与 readiness 清单；条件表不可 UPDATE/DELETE。MissionOwner 校验真实 goal Artifact，保存 Draft、条件版本、Audit/Outbox；createMission 通过独立 abh.missions.create Grant 和 abh.mission.manage 用途，固定受信回调，在幂等与控制锁内复核定义、目标、权限，末次拒绝回滚整个创建。定义安装须校验实际注册 Workflow、确定性条件、资源与责任范围；本批 fixture 明确模拟该安装。

真实 PG 联测验证末次定义拒绝时无残余 Mission/conditions、并发同键一个 Draft、重放重新检查定义、跨租户不可见、条件表禁止更新及撤权拒绝重放。Contracts 覆盖 Draft 不得预先断言运行事实、目标 revision 约束、条件摘要及额外脚本拒绝。

本批完成 Mission 的真实 Draft 持久化基础，尚未完成激活/MissionAuthority、Trigger/Run 创建、Blocker、暂停取消与目标修订、结果关闭、公开 Query/HTTP 或生产 Definition 安装。整体 V1 仍未达到 90%，按设计继续推进。验证见 [Mission Draft 验证](../../../../docs/development/verification-2026-09-09-mission-draft.json)。

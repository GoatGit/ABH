# Secret Broker 与 Isolation 详细设计

> 版本：1.0 · Owner：Security / Adapter Maintainers
>
> 公共 SecretBrokerPort、IsolatedExtensionPort 为 Preview；未通过隔离门禁的扩展拒绝启用。

## 1. 信任边界

Secret Broker 把可用凭据限制到当前 Model/Connector/Operation，Agent、Prompt、普通日志和前端永不接收 Secret Material。隔离运行时承载不受信可执行 Tool/转换/评测，保护宿主与其他租户。

TrustedCode 与宿主同信任级，SDK 不构成恶意代码沙箱。不能接受此信任的代码必须进入 Isolated；缺少隔离能力则拒绝，不降级为同进程运行。

## 2. 数据与 Port

| 数据 / 接口 | 字段与语义 |
|---|---|
| control.secret_bindings | secretRef、ownerOrganizationId、provider/connectionRef、secretClass、brokerBackendRef、credentialVersion；不存秘密正文 |
| control.secret_leases | leaseRef、principal/operationRef、purpose、issuedAt/expiresAt、revokedAt、credentialVersion；只是访问许可 |
| isolation.executions | executionRef、packDigest、input/outputRefs、limits、egressPolicyRef、authorizedSnapshotRef、deadline、resultRef |
| AcquireSecret | principalRef、operation/modelCallRef、secretClass、AuthorizedContextRef；返回 opaque handle，仅受信 Adapter 解引用 |
| RevokeLease / RotateBinding | ref、reason、authorityRef、expectedVersion；返回控制记录，不伪称已使 Provider Token 失效 |
| ExecuteIsolated | exactPack/entryPoint、inputRefs、authorizedContextRef、limits、outputSchemaRef、AbortSignal；返回 execution/result Ref |
| Inspect / Cancel | executionRef、reason；返回隔离进程状态与已观察效果 |

Credential 在 Broker 内的短租约与 Provider Token 生命周期分开：短时访问不保证长期 Token 自动失效，Provider 撤销/轮换要独立完成并验证。普通 Query 只显示到期/健康，不返回 credential 内容。

## 3. 执行协议

Control 授权能力 → Broker 建租约 → 隔离运行时创建租户独立工作目录/非 root 进程 → 只读输入挂载或一次性读取句柄 → 受限入口运行 → 输出大小/类型/Hash 验证 → Artifact 提交 → 清理沙箱与租约。

网络默认关闭；允许出口按域名/地址/TLS 绑定，解析前后拒绝私网/云元数据/loopback 目标（部署明确批准的内部服务另行登记），每次重定向重验，防 DNS Rebinding。无宿主 Socket、设备或可写根文件系统；禁止把通用 Secret 注入环境快照。

模型/工具可能消耗费用或产生副作用，隔离进程成功退出不证明业务成功。Connector 扩展只能按已授权 Operation 请求执行和返回 Receipt，不拥有 Action 状态。

## 4. 超时、崩溃与撤权

Deadline/撤权先取消未开始工作，向进程发送终止，清理期限后强制杀死；保存 output truncation/exit reason。存在已派发外部请求时，Operation 保持 Unknown/Observing，不能因容器结束释放责任。

Broker 故障拒绝新 Secret 访问；已有租约只在当前期限/用途有效时使用，不延长。轮换时保存旧版本用于必要查回的条件由 Provider/安全策略决定；安全事故可禁用全部旧凭据并转人工查回。

清理失败将目录隔离，后台维护重试并告警；不能分配给另一租户复用。隔离执行日志按字段/字节裁剪，不能依赖工具自律隐藏秘密。

## 5. 配置与部署

M0 可使用本地模型或开发凭据 Adapter，但只在 Development Profile 且不放真实 Connector Secret。M1 必须使用生产 SecretBrokerPort，可复用已有 Secret Manager；自托管参考 OpenBao。

Isolated 默认 limits：CPU 1 核、内存 512 MiB、进程数 32、临时磁盘 256 MiB、墙钟 60 s、输出 1 MiB；Pack 声明与部署上限取更小。参数必须显式配置且不可解释 0 为无限。secret.leaseSeconds 默认 60、最大 300，入口控制预算 p95 30 ms，不含 Provider。

`abh doctor secrets` 检查权限/轮换/租约；`abh doctor isolation` 用公开恶意 Fixture 验证出口、挂载、资源和清理；普通健康检查不输出秘密。指标 lease_denied、credential_rotation_age、sandbox_timeout、cleanup_failure、egress_denied。

## 6. 验收与演进

测试：Agent 请求 Secret；错 Organization/Operation 句柄；过期租约；Provider 长 Token 未撤销状态如实展示；元数据 SSRF、重定向/DNS、宿主 Socket、路径穿越、fork/内存/输出炸弹；撤权中途；恶意输出；清理失败；没有隔离能力时拒绝安装。

优先复用 OS/容器与现有 Secret 服务，不自研微虚拟机或 Secret Vault。是否采用更强隔离由实际威胁模型与 CTK 证据决定，不能把 Docker 默认配置等同于可信沙箱。

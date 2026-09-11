# Interaction Ingress 与 Identity 详细设计

> 版本：1.3 · Owner：Identity Maintainer · 内部模块 `ingress / identity`
>
> 公共适配：IdentityProviderPort；当前 Preview。

## 1. 入口与组织边界

统一受理 HTTP、SDK、Webhook、定时唤醒和 Workbench 请求，完成身份、租户、Schema、Purpose、限流与确定性路由。自然语言目标的理解由授权后的 Agent 任务处理，Ingress 不调用 LLM 判断权限。

Human 使用 OIDC Authorization Code + PKCE，浏览器只持 HttpOnly/Secure/SameSite Session Cookie；BFF 保管 Token。Service 使用登记的工作负载身份和短期执行凭据，AgentInvocation 由 Run Owner 创建并限制至自身 Task。ExternalPlatform 只能通过 Connection 绑定的签名入口提交观察。

使用现有产品时复用其受信 BFF/IdP；没有 BFF 的部署由 ABH server 的会话入口承担 OIDC 回调与 Token 保管，Workbench 不成为登录前置。人类与 Service 请求最终都经 IdentityProviderPort 验证并映射到本地 Principal，客户端自报身份或代理头不构成信任依据。单组织场景不创建占位 Workspace。

Organization 是资源所有边界；Workspace 明确连接组织及可用 Scope，不合并各方成员、数据或责任。普通成员资格与 Human Gateway 的 Product Responsibility 分开。

## 2. 数据所有权

| 表 | 字段、唯一键与用途 |
|---|---|
| control.organizations | id、name、status、homeRegion、defaultPurposePolicyRef、version |
| control.memberships | organizationId/principalId 唯一；status、roleTemplateRefs、membershipEpoch |
| control.workspaces | id、participantOrganizationRefs、scopeContractRef、status、scopeEpoch、version |
| control.sessions | idHash、subjectRef、issuer、authnStrength、credentialEpoch、expiresAt、revokedAt |
| control.service_principals | id、ownerOrganizationId、capabilityRefs、credentialEpoch、status |
| control.connection_bindings | connectionId、ownerOrganizationId、providerTenantId、secretRef、eventCapabilityRef |
| control.external_observations | connectionId/providerEventId 唯一；payloadDigest、payloadArtifactRef、signatureResultRef、receivedAt、sourceVersion、status（引用 External Observation） |

Membership/Workspace 变更提升相应 scopeEpoch，并产生撤权事件；角色模板只是 Grant/Responsibility 配置输入。状态可用性按 Active/Revoked/Expired 的权威记录与有效期检查，不将 OIDC group claim 当作完整业务授权。

## 3. 接口契约

| 接口 | Payload / 前置条件 | 返回 / 特有错误 |
|---|---|---|
| CreateOrganization | name、homeRegion、initialOwnerRef；通过部署 bootstrap 或有权组织创建者 | organizationRef、初始治理责任 Ref |
| UpdateMembership | organizationRef、principalRef、roleTemplateRefs、status、expectedVersion | membershipRef + epoch；MEMBERSHIP_LAST_OWNER |
| ConfigureWorkspace | participantRefs、scopeContractRef、bilateralDecisionRefs、expectedVersion | workspaceRef；WORKSPACE_CONSENT_MISSING |
| RevokeSession / Principal | targetRef、reason、expectedVersion | epoch + Audit；IDP_SUBJECT_MISMATCH |
| CreateRequestContext（Internal） | verifiedIdentity、requestTarget、purpose、workspaceSelector | 短时 RequestContext Ref；TENANT_CONTEXT_REQUIRED |
| ReceiveExternalEvent | route-bound connectionId、rawBody、signatureHeaders、providerEventId、timestamp | 202 observationRef；EVENT_SIGNATURE_INVALID |

接口不接受任意 acting/resource Organization 覆盖。目标资源通过服务端 Ref 回源定位 Owner；请求中声明的组织必须与已核实映射一致。

定位与跨组织身份来源核验使用 [Data 第 1 节](28-Data-Artifact与Audit详细设计.md#13-跨组织核验与后台访问)的最小定位索引/受限控制函数；创建 Context 后，业务查询和写入进入固定 resourceOrganizationId 的 RLS/UoW。不能为解析身份给普通 HTTP 路由提供全租户数据库查询入口。独立 Action 的执行 Service 来自受信动作绑定，ExecutionAuthority 由 Control 签发；Ingress 认证成功只允许进入相应提案/治理检查。

`GET /v1/me` 返回当前身份与允许切换的组织，`GET /v1/organizations` 分页，`GET /v1/workspaces` 按当前成员裁剪。Session Token、签名原文和 Secret Ref 的实际内容不进入返回。

## 4. 人类请求主流程

BFF 验 Session/CSRF/Origin → 解析已注册路由与 Payload Schema → 回读 Membership/目标 Organization/Workspace/Purpose → 创建 RequestContext → 调用对应 Owner 的 Command/Query → 权限裁剪后编码返回。

请求体 64 KiB，上传经专用有界流入口；未知字段拒绝。跨组织读取必须同时满足资源 Owner 与 Workspace 范围，不能仅因用户属于代理组织就查看全部客户。

部署 bootstrap 使用一次性本地管理能力创建首个组织与治理责任，输出恢复凭据后立即关闭；必须 Audit，不能留公开注册的永久超级管理员后门。

## 5. Webhook / 外部事件流程

先按路由固定 Connection，再校验原始字节签名、时间窗和 Provider Identity；不信任 body 中租户 ID。T1 保存原始 Artifact Ref、Observation、去重 Receipt 和 Outbox 后返回 202；Worker 按 Connector 归一化，Domain Owner 判断其是否成为领域 Event。

乱序事件保留原 sourceVersion/observedAt，禁止低版本覆盖高版本。签名有效但语义未知进入 Quarantined；重复 eventId 不再次触发 Run。Provider 不支持签名时只接受强认证的主动拉取能力，不为方便降成匿名可信 Webhook。

同 eventId 同摘要返回原受理 Ref；同 eventId 异摘要保存冲突证据并隔离，不覆盖原观察。sourceVersion 的排序/去重规则由 Connector 明确，不能把不透明字符串作数值或字典序比较；缺少可比较版本时以查询快照和领域合并规则收敛。原始事件异步处理前只赋 Received，不借 Artifact 的 Available 表示观察已验证。

## 6. 失败、撤权和隔离

IdP 不可用：新登录失败，已有本地有效且未撤销 Session 在其有效期内可按策略使用；高风险重新认证要求不豁免。数据库不可用：拒绝创建 Context。Workspace 撤销先提交 epoch，再失效缓存/SSE/Run Binding；写路径同步查 fence。

Ingress 限流按来源 IP、Principal、Organization 多维度取最小值；M0/M1 用 PostgreSQL 原子计数与有界本地预过滤，热点成立后再换 Valkey Port。认证/写路径不在数据库失联时回退为不限流。

## 7. 配置、观测和验收

配置 identity.issuer/audience/jwksPolicy 为生产必填；session.ttlSeconds 默认 3600、highRiskReauthSeconds=900；webhook.clockSkewSeconds=300；均在部署时固定并可缩小。IdP/OIDC 只访问允许出口，禁止因自签证书关闭 TLS 验证，部署方提供受信 CA。

`abh doctor identity` 检查 issuer、audience、时间、密钥轮换、成员与 Scope Epoch。记录 auth_failure、context_reject、workspace_revoke_lag、webhook_signature_fail；日志裁剪原始 Token/Body。

测试：伪造 issuer/audience；跨组织目标；body 租户注入；CSRF；OIDC group 越权；Session 撤销；双边 Workspace 缺同意；Webhook 重放/乱序/坏签名；最后治理责任人移除；bootstrap 重用。拒绝请求不得提交业务状态，合法重复回调只产生一个 Observation。

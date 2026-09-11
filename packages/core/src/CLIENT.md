# 类型化 HTTP 客户端

`@abh/core/client` 导出 `createAbhClient`、`AbhClientError` 和输入类型，复用 Contract Package 请求/响应 Schema。入口可打包到浏览器，不引入数据库、Fastify、OPA、Secret 或 Worker。Node 使用原生 fetch；浏览器使用同源 Cookie 或由宿主提供的当前凭据。跨域 Cookie、CORS 与凭据策略由宿主明确配置 fetch。

```ts
import { createAbhClient } from '@abh/core/client';

const client = createAbhClient({ baseUrl: 'https://abh.example.test/' });
const inbox = await client.decisions.listInbox({ status: 'Pending', limit: 25 });
const decision = inbox.data[0];
if (decision) {
  const current = await client.decisions.get({ id: decision.decisionRef.id, consistency: 'Strong' });
  // 将 current.data.package 的完整影响、风险、证据与备选方案交给用户确认。
  // 用户明确操作后再调用 submit；本示例不自动批准。
}
```

Decision 入口：get、listInbox、submit、withdraw。写入输入是 `{ id, expectedVersion, idempotencyKey, payload }`，payload 分别复用 SubmitDecisionPayload / WithdrawDecisionPayload。客户端把版本变成强 If-Match，原样保留幂等键；packageDigest、response 和 conditionRefs 必须来自明确业务操作。相同操作查回/重放时保留原幂等键和参数；不自动换键或重试。

Action 入口：get(id, query?)、list、cancel、requestAuthorization，以及低层 proposeFromArtifact。后者输入 `{ organizationId, idempotencyKey, payload }`，payload 使用现有 ProposeActionPayload，要求服务器已有正式 Artifact/来源引用；Create 不发送 If-Match。它不实现 V1 的业务输入上传和稳定子键编排。Core actionProposal、actionQuery、actionList、actionCancellation 与 actionAuthorizationRequest 已通过真实身份/Grant/Owner 及客户端验证。requestAuthorization 返回持久受理的 202 回执和 Action trackingRef，后续由显式安装的 Service 宿主推进，不能把受理视为已经执行授权。StoreArtifact HTTP 和高层 actions.propose 自动编排尚未完成。

baseUrl 必须是无凭据、查询串和片段的 HTTP(S) 地址，可包含部署路径前缀。headers 回调每次调用重新获取凭据并接收 AbortSignal；方法、内容类型、版本和幂等键由本次协议调用决定，不继承凭据回调的陈旧值。禁止自动跟随重定向。

每次调用可传 `{ signal, timeoutMs }`。默认期限 30 秒，最多 60 秒；凭据解析、fetch、流读取共用同一期限，即使宿主回调未响应取消也会及时返回错误。默认响应上限 1 MiB，可设至 16 MiB；客户端逐块计量，校验 UTF-8/JSON、操作对应的 HTTP 状态及响应 Schema，不返回未经校验的 DTO。

AbhClientError.code 为 INVALID_ARGUMENT、TRANSPORT_ERROR、PROTOCOL_ERROR 或 ABH_ERROR。outcome 表示客户端所知：

- NotSent：尚未调用 fetch。
- Unknown：已调用 fetch，未得到可验证响应；写入可能已提交。
- Responded：收到该操作注册的 ErrorResponse；通过 response 读取错误码和 correlationId。此状态也不证明写入回滚，例如服务端在提交后超时。

客户端不把错误消息作为回滚证明，不自动重试写操作，不签发权限。取消和期限结束仅停止客户端等待；持久结果应通过原命令和对象查询确认。Inbox nextCursor 原样交回下一页，保留筛选条件；空页仍可能带 nextCursor。客户端不将来源指纹水位用于订阅或 GC。

验证位于 `test/client.test.ts`，覆盖四个 Decision 和五个 Action 调用、幂等/版本头、参数与 DTO 校验、错误/期限/流上限、晚到响应取消，以及 esbuild 浏览器依赖图；`test/decisions.test.ts` 另覆盖实际身份、Grant、PostgreSQL 和提交效果的客户端重放。完整客户端 SDK、Mission、上传便捷流程、发行/独立上手验收仍在 V1 缺口清单中。

`artifacts.storeInline({ organizationId, idempotencyKey, payload })` 提交 StoreInlineArtifactPayload，不发送 If-Match，返回正式 Artifact objectRef 和原 commandId。它与 `actions.proposeFromArtifact` 可组合使用，重试需保持同一幂等键和内容；201 是原存储受理事实，后续读取/提案仍检查当前 Artifact 状态与权限。大对象流式上传和高层提案自动子键编排仍待实现。

### 高层 JSON 提案

`actions.propose({ organizationId, idempotencyKey, input, artifact, action })` 先规范化 JSON input，以 application/json 保存 64 KiB 以内的 Artifact，再以其引用同时作为 payloadRef/sourceProposalRef 创建 Action。artifact 提供 owner、用途、数据分级、来源、地域和保留参数；action 提供既有提案类型、目标和来源版本，不能覆盖权限或受信业务定义。两步在首次写入前校验，输入在异步调用前复制，整次调用共享期限和取消信号。

子键使用固定版本命名空间、组织和调用者幂等键的摘要，不包含输入内容。同键异参交给真实 Owner 拒绝。响应丢失后以同一调用参数重试，原存储/提案回执去重，不自动重试或删除已提交 Artifact。部分写入后的取消返回 Unknown；错误响应也不代表前一步没有提交。此方法只编排公开存储与提案，服务端提案后的自动创建授权请求与生产推进安装仍待完成。


`client.packInspections.inspect({ id, consistency? }, options?)` 查询持久巡检 Job 的当前诊断。服务端必须显式安装巡检诊断路由和管理 Service 的身份／Grant／证据准入；浏览器或 CLI 提供的 ID、请求头和一致性选择不能产生管理权限。默认／Strong 返回真实状态、Refs 与剩余预算，Projection 当前拒绝。成功响应表示诊断查询成功，不能视为检查语义通过、Enable 或执行下一步的授权。

# @abh/adapter-fastify

[English](./README.md) | 简体中文

内部 HTTP 入站适配器，基于 Fastify 5.12.3，运行于 Node 24.13.0。

`createHttpApp` 返回一个**未监听**的实例。宿主安装可信的 `authenticate` 和需要公开的命令/查询处理器，然后自行负责监听、真实 readiness 与排空。这里没有默认身份、默认业务处理器或健康状态。

## 请求如何被处理

- 路由来自 Contract Package 注册表，只安装显式提供的处理器；内部命令与未安装操作返回契约 404。
- 请求用已编译的契约校验器验证：多余字段、客户端自带的 Context/commandId、重复条件头、非法 UUID、未注册查询参数一律拒绝；只有契约声明的数值查询字段才会转换。
- 认证安装负责验证凭据并解析身份、组织、Workspace 与用途，不得直接复制客户端上下文头。适配器生成 `requestId`、`correlationId`、`receivedAt` 和 `commandId`，并对认证上下文做校验与快照。
- 认证不等于授权：Owner 仍负责独立的 Grant/fence/重放准入、事务和字段可见性。适配器不会自动重试命令。
- 处理器返回公开契约 DTO；错误经 `HttpFailure` 显式映射，未知异常统一返回脱敏 `INTERNAL_ERROR`。成功响应先生成规范 JSON、再校验待发送快照；命令 ETag 与 202 Location 都从该快照生成。

## 限制与取消

默认请求体上限 1 MiB，总处理期限 30 秒（最多配置到 60 秒）。显式 binary route 可单独设置 `maxBytes`，解码流超限时断流并返回脱敏 `LIMIT_EXCEEDED`。认证安装与 Owner 都会收到 `AbortSignal`：超时后返回的认证结果不能启动 Owner；Socket 断开同样会触发取消。HTTP 超时不证明事务已回滚——调用方应使用原幂等键查回。

## 安全停机

`stopHttpIngress(app)` 同步关闭业务准入，然后关闭监听并 join 所有已进入的认证与 Owner Promise——保留真实的工作 join，不用 `Promise.race` 超时冒充业务完成。重复调用返回同一个停机 Promise。永不结束的自定义处理器仍会阻止安全停机；进程强制终止与持久恢复由部署负责。异步启动场景传入 `stopHttpIngress(app, pendingListen)`；Core 的 `runHttpService` 已统一处理这一顺序。

## 状态

测试使用 Fastify `inject`，并用真实 TCP 验证原始重复头。生产身份/治理安装、hello-business、TLS/代理配置与完整发行验收仍待完成；Core DTO 映射、typed SDK、显式 CLI 宿主和本地服务生命周期联测已通过。

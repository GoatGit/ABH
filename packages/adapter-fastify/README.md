# @abh/adapter-fastify

内部 Fastify 5.12.3 入口适配器，Node 24.13.0。`createHttpApp` 返回未监听的实例，调用方安装可信 `authenticate` 和公开命令/查询处理器后，由 Host 负责监听、实际 readiness 和排空。没有默认身份、业务处理器或健康状态。

路由来自 Contract Package 注册表，仅安装明确提供的处理器；内部命令和未安装操作返回契约 404。请求用已编译的契约校验器验证，拒绝额外字段、客户端 Context/commandId、重复条件头、无效 UUID 和未注册查询参数。只有契约声明的查询数值字段可以转换。

认证安装负责验证凭据，解析当前身份、组织、Workspace 和用途，不得直接复制客户端上下文头。适配器生成 requestId、correlationId、receivedAt 和 commandId，校验并快照认证上下文。Owner 仍负责独立授权、当前 Grant/fence、重放准入、事务和字段可见性。适配器不会把认证成功视为业务授权，也不自动重试命令。

处理器返回公开契约 DTO；错误通过 `HttpFailure` 显式映射。未知异常和操作未声明的错误统一返回脱敏 INTERNAL_ERROR。成功响应先生成规范 JSON，再校验实际发送快照；命令 ETag 和 202 Location 从该快照生成。错误默认不承诺可安全重试。

默认请求体上限 1 MiB、总处理期限 30 秒（配置最多 60 秒），认证上下文更早过期时提前终止。认证及 Owner 收到 AbortSignal；不合作的 Promise 也不会阻塞 HTTP 响应，超时后返回的认证结果不能启动 Owner。已开始的业务事务是否提交由 Owner 的取消/事务规则决定，HTTP 超时不证明回滚，调用方应使用原幂等键查回。Socket 断开也会取消信号。

测试使用 Fastify inject，并用真实 TCP 验证原始重复头。生产身份/治理安装、Core DTO 映射、SDK/CLI、hello-business、TLS/代理配置和完整服务生命周期仍待完成；本包不代表 V1 服务验收。

`stopHttpIngress(app)` 可直接接入 RuntimeService.stopIngress。调用时同步关闭业务准入，关闭监听/连接并等待所有已进入的认证和 Owner Promise；重复调用返回同一停机 Promise。超时响应后的后台业务也必须真正结束后才能关闭数据库。请求自身的业务失败由请求处理，传输关闭失败则在收尾后上报。直接 app.close() 只负责 Fastify 的传输生命周期，生产宿主应使用此钩子。

这里保留实际工作 join，不以 Promise.race 超时冒充业务完成；安装的认证/Owner 必须遵守信号并有界收尾。永不结束的自定义处理器仍会阻止安全停机，进程强制终止和持久恢复由部署负责。测试覆盖超时 Owner 晚到失败、认证超时后不能启动 Owner、重复关闭和停止后拒绝新请求；Core 联测验证实际入口收尾先于队列 drain/报告保存/数据库关闭。

与异步启动并用时，传入 `stopHttpIngress(app, pendingListen)`，其中 pendingListen 是已经开始的 app.listen Promise。准入立即关闭，传输关闭等该 Promise 完成后执行，避免 close 先结束而 listen 随后绑定端口；启动失败仍由启动宿主报告。Core runHttpService 已统一处理这一顺序。

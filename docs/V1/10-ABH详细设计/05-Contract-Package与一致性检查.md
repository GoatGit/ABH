# ABH Contract Package 与一致性检查

> 版本：1.2 · Owner：Contract Maintainer
>
> 包：`@abh/contracts`；MIT；公共入口 Preview，数据库/Controller 内部类型不导出。

## 1. 单一来源

公共数据契约采用 JSON Schema 2020-12；Ajv 8 在入口校验，json-schema-to-typescript 生成 TypeScript 声明。OpenAPI 3.1 引用同一 Schema。状态 Registry 以结构化 YAML 定义枚举、迁移守卫 ID、Owner 和事件，并生成对应 JSON Schema、迁移判定表和数据库 CHECK 片段。

服务端不再手写平行 Zod/DTO 枚举。语义守卫不能由 Schema 表达的部分使用具名 Guard 函数并在 Registry 引用，必须有独立测试。复杂正则、递归深度和自定义格式有界；任意代码不得嵌入 Schema。

~~~text
packages/contracts/
  schemas/       primitive / context / command / event / runtime / config
  states/        registry.yaml
  errors/        registry.yaml
  ports/         contracts.ts
  generated/     types / schemas / state-tables / openapi
  fixtures/      valid / invalid / upgrades
  manifests/     contract-version.json
~~~

Machine Registry 实现前以本组规范为唯一设计输入；生成后文档引用对应 Contract Version/Guard ID，CI 检查二者一致。单改生成文件拒绝合并。

M0-A 首批 Schema 包含 AuthorityRef 闭合联合、ExecutionAuthority 的 Scope/Action 绑定与签发证据、Run/Action 主体的 PinSet 请求/结果，以及服务端内部 TenantContext；字段分别引用 01、21、30 的权威合同。TenantContext 构造与数据库角色/表归属清单为内部制品，不从公开客户端导出。迁移清单按 Data 第 1 节登记 tableScope、RLS/角色/函数权限；CI 检查实际 PostgreSQL catalog 与清单一致，文档存在不代表该检查已通过。

## 2. exports 与边界

| export | 内容 |
|---|---|
| `@abh/contracts` | EntityRef、Money、Context、Command/Query/Event 公共类型 |
| `@abh/contracts/schema` | Schema ID 与编译后的入口验证器 |
| `@abh/contracts/states` | 枚举、合法组合检查与迁移 Guard 描述 |
| `@abh/contracts/errors` | 注册代码、分类及 HTTP/Tool 映射 |
| `@abh/contracts/ports` | Agent、Model、Durable、Identity、Secret、Object 等 Port 类型 |

验证器编译产物须支持 Node.js 24 ESM 与浏览器无 Node 内建依赖的子集。服务端 Context 构造函数不在浏览器入口导出；类型构造不意味着权限签发。

Workbench 的 JSON Forms 注入相同方言的 Ajv2020 实例与已登记 Schema，禁用默认 Ajv 的隐式转换/删除；动态表单只取已安装受信 Schema。客户端验证用于即时反馈，权限裁剪与最终校验由服务端执行；UI Schema 可渲染子集必须列入 Fixture，不能宣称支持所有 2020-12 结构的自动布局。

Domain Pack 以自有 Schema 命名空间依赖公共 Primitive。Provider 状态不进入公共 enum；适配后的 Observation 才可进入 Operation。Core 不导入营销或采购 Schema。

## 3. 生成流水线

1. lint Schema/状态/错误 Registry：唯一 ID、Owner、版本、注释、合法引用。
2. 编译 Ajv 严格校验器，拒绝未知关键字和不支持的模式。
3. 生成 TS、OpenAPI、事件 Schema、状态 CHECK、Workbench 标签映射骨架。
4. 对 valid/invalid Golden Fixture 运行 Schema、HTTP、SDK、数据库迁移与浏览器解析交叉验证。
5. 与上一已发布契约做差异分类，输出兼容报告。
6. API Extractor 检查 exports；Changesets 绑定版本；制品生成摘要并进入 SBOM。

校验器错误仅返回公开 JSON Pointer 与安全描述；不能泄漏包含 Secret 的原始值。OpenAPI 的 response schema 同样校验，防止服务端返回比权限裁剪契约更多字段。

Fastify 5 的请求验证通过 `setValidatorCompiler` 接入由 `Ajv2020` 预编译的同源校验器；路由按 Schema ID 获取产物。构建时解析并封装全部 `$ref`，运行时仅加载已登记 Schema，不下载远端引用或编译请求携带的 Schema。HTTP 路径与查询参数按契约声明转换后校验；JSON Body 禁用隐式类型转换、默认值填充和额外字段静默删除。

JSON 响应通过 `setSerializerCompiler` 接入同源响应校验器，先验证已完成权限裁剪的 DTO，再序列化；不依赖 Fastify 默认编译器对其他 JSON Schema 方言的解释。响应不符合契约时返回脱敏 500 错误并记录 Schema ID，禁止发送原始对象。SSE、流式下载和无正文响应遵循各自协议，不经过 JSON 响应序列化器；交叉 Fixture 必须覆盖 2020-12 关键字、引用、请求拒绝和响应越界。

## 4. 状态与数据库一致性

数据库使用 text + 生成 CHECK，避免 PostgreSQL enum 的破坏性升级负担；不使用物理外键。State Registry 同时生成 TypeScript 判定表，数据库约束负责合法值/组合，Owner Guard 负责迁移证据。

修改状态必须带 Expand/Contract Migration：先使旧读者能安全拒绝新状态，再部署新写者；不可用的迁移回滚只允许前滚。所有终态、Outcome 合法组合、取消和迟到回执均有生成测试。

迁移文件还须校验实际 CHECK 与生成片段一致。Schema/状态改变造成投影版本变化时，要求并行重建与水位切换，不能只改前端类型。

## 5. Port 合同

Port 类型固定 AbortSignal、Deadline、Context Ref、Target 和幂等/调用身份。取消返回 Cancelled 只用于没有外部效果的任务；可能有效果的请求返回追踪 Ref，由 Operation 判定。

AgentRuntimePort 的 continue 与 Durable Resume 分离：前者在通过恢复检查后恢复同一 Invocation；后者重新唤醒 Owner。实现不得通过供应商类型绕开公共 Port。

所有 Adapter CTK 必须使用同一请求/响应 Fixture、错误 Registry 和事件顺序断言。兼容矩阵登记 Node/架构/Core/Adapter/Profile 的真实已测组合；0.x 不伪造历史稳定承诺。

## 6. CLI 与示例接口

工程实现将提供以下确定接口，当前文档中的命令是实现契约，不表示仓库已存在可执行 CLI：

~~~sh
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:test
abh conformance --profile core --report ./artifacts/ctk.json
~~~

`contracts:check` 重新生成到临时目录并做字节/语义差异检查；失败不能自动覆盖并算通过。文档中的 JSON/YAML 示例加入 Fixture，保留合法最小例及拒绝例；示例 ID 必须符合正式 Schema。

首闭环 Golden Fixtures 必须固定：有效/越界/撤销的 ExecutionAuthority、无 Run 的 Action pinSet、同主体异摘要冲突、签发与版本固定各提交点的恢复输入，以及缺租户上下文和错组织写入的拒绝结果。后续 PostgreSQL 集成测试按同一字段合同验证 RLS/UoW 与实际角色，不能用 Schema 校验通过替代数据库隔离证据。

## 7. 失败、可观测与验收

生成错误以 Schema ID/Pointer、Guard ID、文件和错误码报告；不执行无网络依赖的生成期间下载。依赖缓存缺失时明确提示安装，不回退到不同版本生成器。

必测：同名 enum 不同值；未知 Owner；有接口无错误映射；过宽 Context；数字金额；未登记 Scope；OpenAPI/DB/SDK 版本不一致；新增领域类型污染 Core；生成器版本变化导致不稳定输出。两次相同输入生成应字节一致，随机时间戳不进入摘要。

本模块不拥有业务状态，只拥有契约发行；初始作为构建工具和公共 Package，无生产常驻服务。Contract Maintainer 在第一个 API/持久状态实现前完成机器 Registry 与 Golden Fixture；未完成时可以继续设计，不能声称 D3 或启用生产写入。

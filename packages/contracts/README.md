# @abh/contracts

M0-A Preview 机器契约。源码采用 JSON Schema 2020-12；状态、错误和传输协议由 YAML 注册表定义，生成 TypeScript、离线 Ajv 校验器、状态表、SQL CHECK 片段与 OpenAPI 3.1。当前包为 private，尚未发布。

## 已实现

- 精确十进制字符串、UTC 时间、UUID、实体/能力引用、闭合 AuthorityRef。
- RequestContext / AuthorizedRequestContext、ExecutionAuthority、Run/Action PinSet 与 Development 配置。
- 13 类首闭环状态机，Action/Operation 的生命周期与 Outcome 组合，39 个错误码。
- Action 提案/记录、不可变 Operation Plan、Decision Package/提交/效果查询，嵌套关系检查。
- 有限 Command/Event/Job 封套；5 个公开命令、4 个查询与 2 个内部命令登记。
- HTTP 头与正文一致性、查询转换、响应发送前验证；RFC 8785 摘要、集合排序、Pin 恢复输入冲突检查。
- 17 项配置元数据与显式默认解析；42 个 Core 对象类型、7 个用途、从 HTTP/Port 协议派生的动作目录及 Domain 静态扩展校验。
- IdentityProviderPort、DurableExecutionPort、ObjectStorePort 共 11 个方法的生成类型、请求/结果 Schema 与取消/查回协议；尚无 Adapter 实现。
- 状态文档覆盖与生成迁移参考表；9 个公开入口的 API Extractor 报告检查。
- 内部 TenantContext 校验；不会进入公共类型入口、公开 Schema 列表或 OpenAPI。
- 有效/无效 Fixture、浏览器无 Node 依赖校验、确定性生成与制品漂移检查。

```ts
import { validateContract } from '@abh/contracts/schema';
import { describeTransition } from '@abh/contracts/states';

const amount = validateContract('Money', { amount: '12.34', currency: 'USD' });
const transition = describeTransition('Action', 'Validated', 'Authorized');
// transition 只描述必须验证的 Owner 守卫，不授予执行权。
```

`validateContract` 不转换数值、不填充默认、不移除未知字段。错误只返回路径、关键字与固定安全描述。浏览器与服务端使用同一生成校验器；内部 Context 构造、身份认证和业务授权由后续服务实现。

```ts
import { parseHttpCommand, serializeHttpResponse } from '@abh/contracts/http';
import { digestCommandIntent, digestContract, checkPinInput } from '@abh/contracts/digest';

// body 是已解析的 JSON；入口认证、commandId 和可信 Context 仍由服务端负责。
const result = parseHttpCommand('abh.actions.cancel', {
  'Idempotency-Key': 'cancel-brief-40',
  'If-Match': '"3"',
}, {
  target: { type: 'abh.action', id: '00000000-0000-4000-8000-000000000006' },
  payload: { reason: '不再需要发布。' },
});
```

`digestContract` 验证完整记录后，仅摘要 Schema 的 `x-abh-digest-fields`；摘要字段本身不参与计算。`x-abh-set` 数组排序而不修改输入，普通数组保留顺序，重复身份直接拒绝。该函数计算预期摘要，不自动将传入的摘要字符串视为可信；Owner 需要比较结果、验证引用和签发来源。`checkPinInput` 只核对恢复输入及槽位完整性，不查询数据库或授予执行权。

`serializeHttpResponse` 的输入必须是已完成权限裁剪的普通 JSON DTO；验证不代替权限裁剪。它先生成固定 JSON 字节，再校验对应 DTO；失败只返回内部错误标记和 Schema ID，未来 HTTP 入口负责发送脱敏 500。

```ts
import { resolveDevelopmentConfig } from '@abh/contracts/config';
import { createContractCatalog, validateRegisteredTarget } from '@abh/contracts/catalog';
import type { DurableExecutionPort } from '@abh/contracts/ports';
import { validatePortRequest, validatePortResult } from '@abh/contracts/ports';
```

配置先严格校验，再在新对象中补充 Schema 声明的默认值；缺失的显式 Development、数据库引用或业务入口不会自动填充。环境只通过显式 Ref 声明，此包不读取 `process.env` 或凭据内容。目录只验证已登记类型/动作/用途的组合，不证明对象存在或授权有效。Object Store 内容通过 `AsyncIterable<Uint8Array>` 传递，字节流与可校验的 JSON 描述分开。

## 当前限制

Schema 通过只表示数据形状和本地字段关系成立。币种是否位于版本化 ISO 4217 目录、类型/动作/Scope 是否已安装登记、主体是否为有效 Service、Grant 范围/到期/fence、摘要所指内容真实性，以及计划是否在批准和账本上界内，必须由相应 Owner 回源验证。历史 Revoked Authority 可以被解析，不能因此执行。

`fixtures/recovery-requirements.json` 是 M0-B/C 恢复测试输入与预期清单，尚不是恢复通过证据。SQL 是供 Owner 迁移引用的片段，尚未建表或通过 PostgreSQL 验证。OpenAPI 的路由是 ContractOnly 规范，全部标记 `Unavailable`，没有运行中的 HTTP 服务。Agent/Model/Secret 等后续 Port、公开客户端与兼容发行仍待实现。具体线格式见[第二批记录](../../docs/development/M0-A-contracts.md)和[第三批记录](../../docs/development/M0-A-foundation.md)。API 报告是当前 Preview 表面的变更检查，不是历史版本兼容证书。

公共入口为根类型、`/schema`、`/states`、`/errors`、`/http`、`/digest`、`/config`、`/catalog`、`/ports`。不发布内部 TenantContext 子路径。`generated/` 只由生成器维护；改源文件后运行 `pnpm contracts:generate`。公开类型变化还需 `pnpm api:update` 更新 `api/` 报告并审阅差异，`pnpm check` 不自动接受漂移。

`@abh/contracts/digest` 的 `digestPackManifest` 实现 V1 Pack 完整性元数据算法：整个 integrity 排除，Artifact/Migration 集合包含 kind 并按 UTF-8 ref 排序，返回三个 SHA-256 与 Cosign 所需的原始 signaturePayload 文本。函数先验证惰性 JSON 并快照，拒绝重复/大小写别名/NFC 歧义/穿越路径与无效条目；保持 Manifest 中声明数组的原顺序。跨语言固定向量位于 fixtures/pack-digest-vectors.json。

此函数不是完整 Manifest Schema 或 Pack Loader，不校验实际文件字节、归档链接、签名、来源、CTK 或信任策略。构建器与 Loader 仍须各自读取原始字节校验尺寸/摘要，并使用独立受信 Cosign 验证证明；仅匹配元数据摘要不能启用 Pack。defineBusiness、构建器与生产 Loader 尚待实现。

PackManifest 已提供正式生成类型与校验器，覆盖 V1 元数据、能力提供/依赖、权限包络、按信任模式选择的资源策略、Payload/Migration 和 Sigstore 证明引用。IsolatedLimits 的明确单位为 cpuMillis、memoryBytes、processes、temporaryDiskBytes、outputBytes、wallTimeMs，0 表示不允许使用。跨字段校验拒绝模式/资源不匹配、非 TrustedCode 迁移、Declarative 网络/Secret 与 Payload/证明路径碰撞。版本范围字符串的可满足性、SPDX 许可策略、共享命名空间签名授权及部署资源上限由 Loader 检查；Schema 通过不授予运行权限，也不代表完整性/签名已验证。

ConformanceReport 为 CTK 签名报告合同：Complete/Incomplete 与逐 case Passed/Failed/Skipped/NotRun 分开表达，Complete 不代表通过；重复 case/能力、未知偏差引用及时间倒序拒绝。digestContract('ConformanceReport', report) 排除 reportDigest/signatureRef，其余字段采用既有 JCS 摘要政策，数组顺序保留。报告完整性/可信 Suite 清单/环境/签名/能力是否可用由 Loader 独立准入，Schema 校验不授予信任。Sigstore DSSE predicateType 为 urn:abh:conformance:v1，predicate 为报告，subject 摘要绑定被测 Pack 原文的 packageDigest；不把报告放入被测 Pack Payload 形成循环。

Pack 治理策略及 SignedTrustPolicyDocument 纳入 catalog Schema，覆盖静态部署权限/资源、三类证明策略、完整治理快照与组织/期限签名文档。签名原文固定为 JCS(["abh-pack-trust-v1", document])。结构校验不验证 PEM 数学有效性或签名，不授予发行权限；部署仍须独立配置管理公钥、核验当前权限/撤回及策略版本。

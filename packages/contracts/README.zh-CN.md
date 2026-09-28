# @abh/contracts

[English](./README.md) | 简体中文

ABH 的机器契约包。Schema 以 JSON Schema 2020-12 编写；状态机、错误模型与传输协议在 YAML 注册表中声明。TypeScript 类型、离线 Ajv 校验器、状态表、SQL CHECK 片段和 OpenAPI 3.1 文档全部由这些源生成。

当前为 private 工作区包，尚未发布到 npm。

## 入口一览

| 导入 | 内容 |
| --- | --- |
| `@abh/contracts/schema` | `validateContract` 与全部公开 Schema |
| `@abh/contracts/states` | 状态机查询，如 `describeTransition` |
| `@abh/contracts/errors` | 公开错误模型（39 个错误码） |
| `@abh/contracts/http` | `parseHttpCommand`、`serializeHttpResponse` |
| `@abh/contracts/digest` | RFC 8785 摘要、集合排序、Pin 恢复输入检查、`digestPackManifest` |
| `@abh/contracts/config` | `resolveDevelopmentConfig`，显式默认值 |
| `@abh/contracts/catalog` | 已登记的类型 / 动作 / 用途 |
| `@abh/contracts/ports` | 已声明端口的类型与校验器 |

## 用法

```ts
import { validateContract } from '@abh/contracts/schema';
import { describeTransition } from '@abh/contracts/states';

const amount = validateContract('Money', { amount: '12.34', currency: 'USD' });
const transition = describeTransition('Action', 'Validated', 'Authorized');
// transition 只描述必须验证的 Owner 守卫，不授予执行权。
```

`validateContract` 不转换数值、不填充默认、不移除未知字段；错误只返回路径、关键字与固定安全描述。浏览器与服务端使用同一套生成校验器。

```ts
import { parseHttpCommand } from '@abh/contracts/http';

// body 是已解析的 JSON；入口认证、commandId 与可信 Context 仍由服务端负责。
const result = parseHttpCommand('abh.actions.cancel', {
  'Idempotency-Key': 'cancel-brief-40',
  'If-Match': '"3"',
}, {
  target: { type: 'abh.action', id: '00000000-0000-4000-8000-000000000006' },
  payload: { reason: '不再需要发布。' },
});
```

## "校验通过"意味着什么

Schema 通过只表示数据形状和本地字段关系成立。它**不**表示币种在版本化 ISO 4217 目录里、类型/动作/Scope 已安装、Grant 覆盖当前调用方、或摘要指向真实字节——这些必须由对应的 Owner 回源验证。

其他边界：

- `serializeHttpResponse` 的输入必须是已完成权限裁剪的 DTO——校验不代替脱敏。
- OpenAPI 路由是 ContractOnly 规范，全部标记 `Unavailable`；本包没有运行中的 HTTP 服务。
- SQL 片段是供 Owner 迁移参考的材料，不是可执行 DDL。
- `generated/` 只由生成器维护：改源文件后运行 `pnpm contracts:generate`；公开类型变化还需要 `pnpm api:update`，`pnpm check` 不会静默接受漂移。

## 状态

公开表面是 0.x Preview，由 api-extractor 报告锁定。后续端口（Agent/Model/Secret）、公开客户端与兼容发行仍待实现。具体线格式见[第二批记录](../../docs/development/M0-A-contracts.md)与[第三批记录](../../docs/development/M0-A-foundation.md)。

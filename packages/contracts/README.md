# @abh/contracts

[English](./README.md) | [简体中文](./README.zh-CN.md)

The machine-generated contract package for ABH. Schemas are authored as JSON Schema 2020-12; state machines, the error model and the transport protocol are declared in YAML registries. From those sources the package generates TypeScript types, offline Ajv validators, state tables, SQL CHECK fragments and an OpenAPI 3.1 document.

This is a private workspace package — not published to npm yet.

## Entry points

| Import | What you get |
| --- | --- |
| `@abh/contracts/schema` | `validateContract` and every public schema |
| `@abh/contracts/states` | State machine queries such as `describeTransition` |
| `@abh/contracts/errors` | The public error model (39 codes) |
| `@abh/contracts/http` | `parseHttpCommand`, `serializeHttpResponse` |
| `@abh/contracts/digest` | RFC 8785 digests, set ordering, pin-input checks, `digestPackManifest` |
| `@abh/contracts/config` | `resolveDevelopmentConfig` with explicit defaults |
| `@abh/contracts/catalog` | Registered types / actions / purposes |
| `@abh/contracts/ports` | Types and validators for the declared ports |

## Usage

```ts
import { validateContract } from '@abh/contracts/schema';
import { describeTransition } from '@abh/contracts/states';

const amount = validateContract('Money', { amount: '12.34', currency: 'USD' });
const transition = describeTransition('Action', 'Validated', 'Authorized');
// transition only describes the owner guards that must be verified; it grants no execution rights.
```

`validateContract` never converts values, fills defaults, or strips unknown fields. Errors carry a path, a keyword and a fixed safe description. Browsers and servers share the same generated validators.

```ts
import { parseHttpCommand } from '@abh/contracts/http';

// body is already-parsed JSON; ingress authentication, commandId and the trusted
// context remain the server's job.
const result = parseHttpCommand('abh.actions.cancel', {
  'Idempotency-Key': 'cancel-brief-40',
  'If-Match': '"3"',
}, {
  target: { type: 'abh.action', id: '00000000-0000-4000-8000-000000000006' },
  payload: { reason: 'No longer needed.' },
});
```

## What "valid" does and does not mean

A schema pass says the data shape and its local field relations hold. It does **not** say that a currency exists in a versioned ISO 4217 catalog, that a type/action/scope is installed, that a grant covers the caller, or that a digest refers to real bytes. Those checks belong to the owning service.

Other boundaries worth knowing:

- `serializeHttpResponse` requires an already permission-trimmed DTO — validation is not redaction.
- OpenAPI routes are contract-only and marked `Unavailable`; there is no running HTTP service in this package.
- SQL fragments are reference material for owner migrations, not executed DDL.
- `generated/` is owned by the generator: edit the sources, then run `pnpm contracts:generate`. Public type changes also need `pnpm api:update`, and `pnpm check` never accepts drift silently.

## Status

The public surface is a 0.x preview covered by an api-extractor report. Later ports (Agent/Model/Secret), public clients and compatibility releases are still to come. Wire-format details live in the [second batch record](../../docs/development/M0-A-contracts.md) and the [third batch record](../../docs/development/M0-A-foundation.md) (both Chinese).

# @abh/adapter-fastify

[English](./README.md) | [简体中文](./README.zh-CN.md)

The internal HTTP ingress adapter, built on Fastify 5.12.3 for Node 24.13.0.

`createHttpApp` returns an instance that is **not** listening. The host installs a trusted `authenticate` plus the command/query handlers it wants to expose, then owns listening, real readiness, and draining. There is no default identity, no business handler, and no health state.

## How requests are handled

- Routes come from the contract registry; only explicitly provided handlers are installed. Internal commands and uninstalled operations return a contract 404.
- Requests are validated with compiled contract validators: extra fields, client-supplied context/commandId, duplicate conditional headers, invalid UUIDs and unregistered query parameters are all rejected. Only contract-declared numeric query fields are coerced.
- The authentication install verifies credentials and resolves identity, organization, workspace and purpose. It must not copy client context headers. The adapter generates `requestId`, `correlationId`, `receivedAt` and `commandId`, and snapshots the authenticated context.
- Authentication is not authorization: owners still do their own grant/fence/replay checks, transactions and field visibility. The adapter never retries a command on its own.
- Handlers return public contract DTOs. Errors are mapped explicitly via `HttpFailure`; anything unknown becomes a redacted `INTERNAL_ERROR`. Success responses are canonical JSON generated first and validated before sending; command ETags and 202 Location headers derive from that snapshot.

## Limits and cancellation

Default body limit is 1 MiB with a 30-second total deadline (configurable up to 60 s). Explicit binary routes may set their own `maxBytes`; an oversized stream is cut off with a redacted `LIMIT_EXCEEDED`. Both the authentication install and owners receive an `AbortSignal`: a slow authentication cannot start an owner after the deadline, and a socket disconnect cancels the signal. HTTP timeout does not prove a rollback — callers should query back with the original idempotency key.

## Graceful shutdown

`stopHttpIngress(app)` closes admission immediately, then stops listening and joins every in-flight authentication and owner promise — the real work join, not a `Promise.race` timeout. Repeat calls return the same shutdown promise. A never-resolving custom handler will still block a safe shutdown; forced termination and durable recovery remain the deployment's job. For async startup, pass the pending listen promise: `stopHttpIngress(app, pendingListen)`. Core's `runHttpService` already wires this ordering.

## Status

Tests use Fastify `inject` plus real-TCP checks for raw duplicate headers. Production identity/governance installation, hello-business, TLS/proxy configuration and full release acceptance are still pending; core DTO mapping, the typed SDK, the explicit CLI host and local service lifecycle integration have passed joint testing.

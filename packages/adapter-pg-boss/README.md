# @abh/adapter-pg-boss

[English](./README.md) | [简体中文](./README.zh-CN.md)

The internal queue delivery adapter, pinned to pg-boss 12.30.0 (native schema 40) on Node 24.13.0.

It implements the `enqueue` / `inspect` / `drain` subset of `DurableExecutionPort`. The wait-related methods (`scheduleWakeup`, `cancelWakeup`, `signal`) come from core's DurableWaitPort; `composeDurableExecutionPort` combines them into the full port. This package owns native queue delivery only.

## Setup rules

- Run core data migrations first. Migration #23 creates the `abh_pgboss` schema owned by `abh_queue`; the adapter creates native tables, functions and the four queue families through pg-boss's public API.
- Connections must use the isolated queue role — never a runtime or admin connection. Core readiness validates the native object inventory, function digests and permissions; re-run readiness after installing pg-boss.
- `DeliveryAdmission.resolve` must be provided by the server: it resolves the current ContextRef, permissions and installed consumers. It is not a user-supplied tenant selector. Core's `QueueAdmissionDirectory` is the assembly entry point — every publish, fetch-back and drain re-verifies current grant/fence inside a real transaction.
- Queue policies must be configured explicitly via `queuePolicies` (control/reconcile/interactive/background): active lease, retention window, completion cleanup, retries, delay and backoff. `deleteAfterSeconds: 0` is only for deployments that must keep completed jobs for idempotent replay; a positive value means the same dedupeKey may be re-enqueued later.

## Delivery semantics

- `enqueue` derives a stable JobRef from organization, consumer and the business dedupeKey; the queue stores only the JobEnvelope and bound digests. A timeout or cancellation after native send returns `Tracked` — never resend on that basis; query back or resubmit the same request instead. The outbox confirms consumer delivery only after `Completed`.
- Worker `fetch` returns a public ref plus the JobEnvelope. Every owner call builds a fresh service context and re-verifies lease and permissions. `complete` runs after the owner/inbox commit; `fail` only triggers a delivery retry. Queue state never proves business success or authorizes external execution.
- While a job is retained, enqueues with the same organization/consumer/dedupeKey serialize through the queue-role transaction and a cross-queue advisory lock; competing different inputs get `IDEMPOTENCY_CONFLICT`.
- `complete`/`fail` lock the native job row and check active state, retry count and lease expiry against the database clock before touching state, so a stale process cannot settle a delivery claimed by another worker. This read-lock query is bound to schema 40 and must be re-reviewed on upgrades; the package never writes native state directly.
- `drain` stops new deliveries for the given queues and joins in-flight owner confirmations and native send/fetch up to the deadline. Cancelled drains still return a real drain report — reception has already stopped.

## Status

Real-PostgreSQL tests live in core (`pg-boss.test.ts`, `inbox.test.ts`) and cover role isolation, permission drift, enqueue uncertainty, lost confirmations after commit, frozen fan-out, publish rollback / lost lease, and bounded drain. Still open: the global publish scan, the full business worker service, and complete V1 module acceptance. The trade-off between the idempotent replay window and cleanup watermarks must be approved by the deployment.

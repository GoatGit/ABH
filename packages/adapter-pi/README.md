# @abh/adapter-pi

[English](./README.md) | [简体中文](./README.zh-CN.md)

The Pi Agent runtime adapter, pinned to `@earendil-works/pi-agent-core@0.85.1` and the matching `@earendil-works/pi-ai`. The adapter reuses the upstream model–tool loop and adds only what ABH needs: contract mapping, enforced gateway injection, event normalization, bounded buffering, and basic stopping.

## Safety boundaries

- Model requests only go through the caller-injected `ModelGatewayPort`.
- Tool calls only go through `ToolGatewayPort`; unknown or unbound tools are rejected before execution.
- The tool loop is fixed to `sequential`; outbound Pi telemetry is disabled.
- `maxBufferedEvents` is clamped to 32–4096, `cleanupDeadlineMs` to 1000–10000.
- The adapter owns no run, task, authorization, or business state — artifacts and completion evidence always return to their owners.

## Invoke and continue

Basic `invoke` covers contract validation, startup, Turn/Tool/Output/Stopped events, stopping on token/cost/deadline limits, external cancellation, and dependency failure.

`continue` reuses the same Pi/gateway/event path. With a `checkpointSink` installed, checkpoints are saved only at wait points where tool results have landed: a trimmed transcript, tool receipt refs, the event watermark, remaining budget, and tool counts. Resuming requires the checkpoint and a permit ref through an explicit `checkpointGateway` and `resumeAdmission`. If the version, definition, context digest, current authorization, remaining budget, transcript end, or unsettled receipts disagree, the call fails with `INVOCATION_RESUME_UNSAFE`. Once admitted, it uses Pi's native `continue()` and never replays already-observed tools.

## Status

Production model/tool gateway assembly, the full CTK and fault matrix, a real artifact checkpoint owner, and an independent upgrade-compatibility matrix are still on the V1 roadmap.

# ABH Workbench

[English](./README.md) | [简体中文](./README.zh-CN.md)

An optional Next.js reference console for ABH — the service does not require it. The pages cover an overview, responsibility inbox, decision approvals, mission progress / pause / resume, action list / detail / cancel / compensation, plus host-declared settings snapshots and governance commands. Every ABH call goes through the public HTTP contract; the server always has the final say on authorization.

## Enabling it

1. Point `ABH_API_URL` at your ABH HTTP service.
2. Identity is wired in `src/lib/identity-install.ts`, chosen by environment:
   - Set `ABH_IDENTITY_ISSUER`, `ABH_IDENTITY_AUDIENCE` and `ABH_IDENTITY_JWKS_URL` (RS256/ES256, https required in production), or `ABH_IDENTITY_SHARED_SECRET` (HS256, self-hosted), to enable the built-in production adapter (`src/lib/identity-production.ts`). It verifies Bearer JWT signature, `exp`/`nbf`/`iss`/`aud`, builds the session from the `sub`/`name`/`abh_organizations`/`abh_purpose` claims, and forwards the verified token to the ABH API server-side. The organization cookie is a selection intent only — membership is always re-checked against token claims.
   - A production build (`NODE_ENV=production`) without identity configured fails closed: every session is rejected.
   - A dev build without configuration falls back to a browser e2e fixture — local demos only, never deploy it.
3. For custom session semantics, implement `WorkbenchIdentityAdapter` in `src/lib/identity.ts`: resolve the real human identity from your IdP/session, inject host credentials per request in `apiHeaders`, and keep `actingOrganizationId` and `resourceOrganizationId` distinct. The organization-selection cookie is user intent; the adapter must re-verify membership, workspace, both organizations and purpose on every request.
4. Provide a stable, non-secret `authorizationDigest` to partition client caches. It never replaces server-side authorization.
5. For compensation, replace `denyAllCompensationAdapter` in `src/lib/compensation.ts` with an adapter that returns compensation templates from registered action definitions, checking action visibility, state, definition ownership and authorization.
6. For custom responsibility forms, replace `contractDecisionFormsAdapter` in `src/lib/decision-forms.ts`. The default form exposes only the public `SubmitDecisionPayload` fields (reason, condition refs, reauth proof). Custom adapters must verify decision visibility, state and approval rights, and may only declare registered schemas.
7. For settings governance, set `WORKBENCH_SETTINGS_URL` to enable the explicit production HTTP assembly; the service must return a bounded non-secret snapshot and registered commands, and `execute` re-authorizes per call with request-ID idempotency. Alternatively keep the `denyAllSettingsAdapter` in `src/lib/settings.ts`.
8. Never store API credentials in browser responses, logs, or the Next cache. Shared caching is disabled for pages and the BFF.

A production build without an identity adapter only shows a logged-out screen and sends no ABH requests.

## Current boundaries

- Approvals use stable idempotency keys and If-Match; the UI never optimistically shows "applied".
- Mission projections, decision state and action details refresh via TanStack Query. A same-origin SSE BFF injects identity and supports bounded Last-Event-ID; it falls back to authorized polling when disabled or failing.
- Mission projections render as semantic tables plus lazy-loaded ECharts SVG; only shape-guarded authorized summaries are charted, with a safe fallback on bad data.
- Decision approvals use lazy-loaded JSON Forms; the server strong-reads the decision, re-checks state and package digests, and re-validates registered form input with Ajv 2020. Run `pnpm test:e2e` for production browser journeys, axe scans and LCP/CLS gates.
- Compensation forms use host-declared JSON Schemas; production action definitions, completion policies and business governance remain with the core host.
- The settings page renders only host-declared members, purposes, connections, automations and commands; with no adapter installed it denies by default. Connection views must not contain credentials, and command acceptance is not governance completion.
- Not yet included: production settings/domain-pack governance assembly, real IdP and production API journeys, screen-reader confirmation, mobile/desktop visual matrices, INP/SSE recovery journeys.

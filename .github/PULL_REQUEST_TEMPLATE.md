<!-- Conventional Commits style title, e.g. fix(core): ... / feat(contracts): ... / docs(cli): ... -->

## What and why

<!-- What does this PR change, and why? Link the issue: "Closes #123" -->

## How it is tested

<!-- Which tests cover the change? New tests, existing suites, or reasoning why no test is needed. -->

## Checklist

- [ ] `pnpm check` passes locally (or say which parts you could not run)
- [ ] Contract artifacts regenerated with `pnpm contracts:generate` if registries changed
- [ ] Public API report refreshed with `pnpm api:update` if the public API changed intentionally
- [ ] README changes reflected in **both** `README.md` and `README.zh-CN.md`
- [ ] No secrets, real connection strings, or `.env` files committed

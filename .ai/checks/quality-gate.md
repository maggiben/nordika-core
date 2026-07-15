# Quality Gate

Use this as the final change checklist. Mark an item complete only with current-change evidence; “not applicable” must state why.

- [ ] No secrets or `.env` files are staged; logs and errors do not expose JWTs, passwords, authorization values, or stack traces.
- [ ] No unresolved TODOs were added. Existing TODOs are either resolved or explicitly tracked with owner and issue reference.
- [ ] No `console.log` was added; use an approved, structured logging approach when logging is introduced.
- [ ] No `any` was added, including explicit `any`, implicit untyped escape hatches, or unsafe casts.
- [ ] No dead code, unused exports, obsolete branches, or unreachable tests were added.
- [ ] Tests are added or updated for the changed behavior, including e2e tests for changed public routes.
- [ ] Documentation is updated for changed contracts, commands, environment variables, architecture, or operations.
- [ ] Types compile: `pnpm run build`.
- [ ] Formatting is applied: `pnpm run format`.
- [ ] Lint passes: `pnpm run lint` (inspect changes because this command runs ESLint with `--fix`).
- [ ] Build succeeds: `pnpm run build`.
- [ ] Accessibility passes, or is explicitly not applicable because this is server-only code with no UI; any introduced UI needs a dedicated accessibility review.
- [ ] Security review/scan passes for the changed attack surface; use `.ai/harnesses/security-audit.md` and record the tool/scope.
- [ ] Performance regression is measured or explicitly not applicable due to no defined workload; use `.ai/harnesses/performance-audit.md` when performance-sensitive behavior changes.
- [ ] Every new dependency is justified, pnpm-locked, compatible with NestJS 11, and does not duplicate existing capability.

# Release Check

- [ ] Commits are focused; no published history was rewritten and no force-push targets `main`.
- [ ] Merge conflicts were resolved intentionally and the resolved result was validated.
- [ ] No `node_modules/`, `dist/`, `build/`, coverage, generated runtime files, secrets, or `.env` files are staged.
- [ ] Tests and documentation were updated for changed behavior, contracts, environment, or operations.
- [ ] `pnpm run build` succeeds.
- [ ] `pnpm run test` succeeds.
- [ ] `pnpm run test:e2e` succeeds.
- [ ] Run `pnpm run format`, then run `pnpm run lint` last and inspect any `--fix` changes.
- [ ] Verify the desired `PORT` behavior (default `3000`) in the target runtime.
- [ ] Document any new environment variables, routes, deployment assumptions, and rollback step.

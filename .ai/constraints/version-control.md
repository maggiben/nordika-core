# Version Control Constraints

## History safety

- Never force-push to `main`.
- Never rewrite published history. Do not amend, rebase, reset, or force-push commits that have been shared.
- Always resolve merge conflicts intentionally and validate the resolved code before merging.

## Commit hygiene

- Keep each commit focused on one coherent change. Do not combine feature work, unrelated cleanup, dependency upgrades, and generated output.
- Never commit `node_modules/`, build artifacts (`dist/`, `build/`), coverage output, generated runtime files, or generated code unless the repository explicitly adopts that generated file as versioned source.
- Never commit secrets or `.env` files; follow `.ai/constraints/security.md`.
- Preserve the repository's existing ignore rules in `.gitignore`.

## Change completeness

- Always update or add tests for behavior changes.
- Always update project documentation when public contracts, environment variables, architecture, operations, or developer workflow changes.
- Always run the relevant formatter before committing. For this project, use `pnpm run format` for source/test formatting and run `pnpm run lint` last because it applies automatic fixes.

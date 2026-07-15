# Nodika Core AI Development Framework

This framework is derived from the current `nodika-core` repository: a minimal NestJS 11 HTTP service. It is intentionally scoped to what exists today. There is no frontend, database, authentication provider, external integration, Docker configuration, CI workflow, or deployment manifest to standardize yet.

Start with `constitution.md` and `architecture.md`, apply the relevant skill and harness, obey every file in `constraints/`, then run the relevant checklist in `checks/`.

## Current delivery commands

- `pnpm run lint` (currently invokes ESLint with `--fix`)
- `pnpm run build`
- `pnpm run test`
- `pnpm run test:e2e`

Do not infer production infrastructure or credentials from the starter README.

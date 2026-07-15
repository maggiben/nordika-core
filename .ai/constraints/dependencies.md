# Dependency Constraints

- Do not add a package unless native Node/NestJS capability or existing dependencies cannot satisfy the requirement.
- Justify each added runtime dependency by capability, maintenance, security, bundle/runtime impact, and removal plan.
- Use pnpm and update `pnpm-lock.yaml` for approved dependency changes.
- Prefer NestJS 11-compatible packages and avoid duplicate libraries for validation, configuration, HTTP, or testing.
- Do not add database, auth, payment, UI, Docker, or cloud packages until those product boundaries exist.

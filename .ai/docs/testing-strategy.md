# Testing Strategy

Use unit tests for controller/service behavior and e2e tests for public HTTP contracts.

- Unit: co-locate `*.spec.ts` under `src/`; use `@nestjs/testing` with the smallest module, as in `src/app.controller.spec.ts`.
- E2E: place specs under `test/`; compile `AppModule`, create the application, initialize it, issue Supertest calls, and close it, as in `test/app.e2e-spec.ts`.
- Commands: `pnpm run test`, `pnpm run test:e2e`, `pnpm run test:cov`.

There is no coverage threshold, database fixture strategy, mock server convention, or CI enforcement yet. Establish those only with the first relevant integration.

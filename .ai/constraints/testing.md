# Testing Constraints

- Every bug fix must add a regression test.
- Every public route change needs e2e coverage in `test/`.
- Close `INestApplication` instances in e2e teardown, matching `test/app.e2e-spec.ts`.
- Do not delete or weaken assertions to hide failures.
- Keep tests deterministic; current tests have no database or network dependency, and new tests should not introduce one without explicit integration scope.

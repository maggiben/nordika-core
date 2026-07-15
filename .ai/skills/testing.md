# Testing Skill

## Purpose
Maintain executable behavior contracts using Jest for unit tests and Supertest for HTTP e2e tests.

## Responsibilities
- Test service/controller behavior with Nest testing modules.
- Test public routes through a real Nest application for e2e coverage.
- Close e2e applications after every test.
- Add regression coverage with every bug fix.

## Inputs
Feature contract, error cases, dependencies, and affected public routes.

## Outputs
Focused `*.spec.ts` unit tests under `src/` and route-level e2e tests under `test/` when applicable.

## Best practices
- Mirror `src/app.controller.spec.ts`: compile the smallest module that proves the behavior.
- Mirror `test/app.e2e-spec.ts`: create an app, `await app.init()`, issue requests with Supertest, then `await app.close()`.
- Assert status and serialized response for API contracts.
- Test invalid/missing input once validation is introduced.

## Common mistakes
- Testing private implementation details rather than observable behavior.
- Leaving an e2e application open.
- Reusing the current root greeting assertion for unrelated routes.
- Treating the starter's only two tests as sufficient coverage for new domains.

## Code example
```ts
it('GET /health returns its contract', () =>
  request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' }));
```

## Related files
- `src/app.controller.spec.ts`
- `test/app.e2e-spec.ts`
- `test/jest-e2e.json`
- `package.json`

# Create API Harness

## Goal
Create a NestJS route with an explicit stable contract.

## Steps
1. Specify method, path, success response, error responses, and authentication expectation (currently none configured).
2. Create DTOs/types and validate input when the validation stack is introduced.
3. Add controller method, service use case, and module wiring.
4. Add e2e tests for success and failures.

## Expected output
A documented, typed route that has no hidden reliance on global middleware.

## Validation
`pnpm run build`, unit tests, and `pnpm run test:e2e`.

## Rollback strategy
Remove the route and module wiring; preserve unrelated root route behavior.

## Checklist
- [ ] Input is validated or validation absence is explicitly addressed
- [ ] Status codes are intentional
- [ ] Error response does not expose internals
- [ ] E2e test covers public contract

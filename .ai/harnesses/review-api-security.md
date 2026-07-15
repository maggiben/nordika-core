# API Security Review Harness

## Goal
Review NestJS routes and bootstrap configuration for API-specific security failures.

## Steps
1. Inventory controllers, route decorators, DTOs, guards, pipes, interceptors, and global configuration.
2. For each route, verify server-side validation, authentication, authorization, response minimization, and safe error mapping.
3. Check method/path behavior for injection, mass assignment, IDOR, insecure defaults, and information disclosure.
4. Review HTTPS, CORS, CSP where applicable, rate limiting, request size limits, and logging.
5. Add or update e2e tests for remediation behavior.

## Expected output
Prioritized API findings with affected route, exploit precondition, evidence, remediation, and regression test.

## Validation
Run `pnpm run build`, unit tests, and `pnpm run test:e2e`; test unauthorized and malformed requests as well as successful requests.

## Rollback strategy
Roll back a route-level change only with a replacement control or a temporary route disablement; never bypass guards or validation to restore service.

## Checklist
- [ ] Inputs are validated server-side
- [ ] Authorization is object/action specific
- [ ] No stack traces or secrets reach responses/logs
- [ ] Abuse controls are retained
- [ ] E2e tests cover invalid and unauthorized requests

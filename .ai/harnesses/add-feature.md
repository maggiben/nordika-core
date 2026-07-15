# Add Feature Harness

## Goal
Add one bounded API capability without turning the starter `AppController`/`AppService` into a catch-all.

## Steps
1. Read the applicable skill and all constraints.
2. Define route, DTOs, responses, errors, authentication expectation, and compatibility impact.
3. Create a domain folder/module when the capability is not the root greeting.
4. Implement controller HTTP translation and an injectable service.
5. Register the module in `AppModule`.
6. Add unit and e2e tests.

## Expected output
Typed source, module registration, tests, and updated project docs only if the architecture or runtime contract changed.

## Validation
Run `pnpm run build`, `pnpm run test`, and `pnpm run test:e2e`; run lint last because it writes fixes.

## Rollback strategy
Remove the new module import and its isolated domain directory. Do not alter existing route behavior to accommodate a new feature.

## Checklist
- [ ] Route and error contract are explicit
- [ ] Input validation and intentional status codes are defined
- [ ] No business logic lives in controller
- [ ] Public behavior is tested
- [ ] No unjustified dependency was added

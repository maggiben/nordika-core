# Refactor Harness

## Goal
Improve structure without changing observable HTTP behavior.

## Steps
1. Capture current unit/e2e behavior.
2. Move code along existing Nest boundaries: controller → service → module.
3. Keep exported contracts and route paths unchanged.
4. Delete obsolete code only after callers and tests are moved.

## Expected output
Equivalent behavior, clearer boundaries, and no dead references.

## Validation
Run `pnpm run build`, `pnpm run test`, and `pnpm run test:e2e` before and after where practical.

## Rollback strategy
Revert the isolated refactor commit/change; refactors must not require data migration because no datastore exists.

## Checklist
- [ ] No public contract changed
- [ ] No duplicated business logic remains
- [ ] Module registration is intact
- [ ] Tests assert behavior rather than implementation layout

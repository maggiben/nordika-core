# Fix Bug Harness

## Goal
Correct a reproducible defect with the narrowest safe change.

## Steps
1. Reproduce through a failing unit or e2e test.
2. Identify whether the defect is bootstrap, routing, service behavior, or configuration.
3. Change the owning layer only.
4. Add a regression assertion and check adjacent error behavior.

## Expected output
A focused fix with a test that failed before the change and passes afterward.

## Validation
Run the targeted test, then `pnpm run build` and the full relevant suite.

## Rollback strategy
Revert the focused implementation and regression test together; avoid reverting unrelated formatting changes from lint.

## Checklist
- [ ] Cause, not symptom, was fixed
- [ ] Regression is covered
- [ ] Existing route contracts remain stable
- [ ] No silent error swallowing was introduced

# Permissions Review Harness

## Goal
Verify that authenticated identities can perform only actions allowed by the authorization model.

## Steps
1. Enumerate resources, actions, roles/claims, ownership rules, and tenant boundaries.
2. Map each API route and service operation to an explicit authorization decision.
3. Verify checks run after authentication and before reading, changing, exporting, or deleting protected data.
4. Test horizontal escalation (another user's resource), vertical escalation (higher privilege), and tenant boundary bypass.
5. Ensure denied actions are logged safely and return non-sensitive responses.

## Expected output
A permissions matrix, coverage gaps, findings, and regression tests for denied/allowed paths.

## Validation
Use at least two synthetic identities with different roles and resource ownership. Run e2e tests against each protected route.

## Rollback strategy
If a new authorization rule is faulty, revert it with an explicit tested rule; never disable authorization broadly to restore access.

## Checklist
- [ ] Every protected action has an authorization rule
- [ ] Object ownership/tenant checks are enforced
- [ ] Denied access does not leak object existence or data
- [ ] Allowed and denied paths are tested
- [ ] Middleware/guards cannot be bypassed by alternate routes

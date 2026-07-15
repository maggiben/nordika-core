# Release Harness

## Steps
1. Confirm the intended version, scope, migration requirements, and rollback owner.
2. Review the complete diff and dependency lockfile changes.
3. Run build, unit tests, e2e tests, and applicable security checks.
4. Verify deployment configuration and production-safe environment values.
5. Publish release notes describing user-visible changes and recovery steps.

## Checklist
- [ ] Validation results are recorded
- [ ] No secrets or generated artifacts are included
- [ ] Compatibility and migration impact are documented
- [ ] Rollback is feasible

# Security Audit Harness

## Goal
Review the HTTP service for threats supported by its actual implementation and deployment surface.

## Steps
1. Inventory routes, environment access, dependencies, and external calls.
2. Verify validation, authz/authn, error exposure, and sensitive logging.
3. Review bootstrap protections such as CORS, rate limits, headers, and limits; none are currently configured.
4. For uploads, verify authorization, type and size allowlists, content parsing, storage behavior, and cleanup.
5. Report severity, evidence, exploit preconditions, and remediation.

## Expected output
Evidence-backed findings and a validation plan, not assumptions about missing product features.

## Validation
Run tests and static checks; add abuse-case tests for fixes.

## Rollback strategy
Use a focused revert if a control breaks a public contract; avoid disabling a control globally without a replacement.

## Checklist
- [ ] Inputs treated as untrusted
- [ ] Errors do not leak internals
- [ ] Dependencies reviewed
- [ ] Secrets absent from code/tests
- [ ] Uploads do not trust file names or client-supplied type alone

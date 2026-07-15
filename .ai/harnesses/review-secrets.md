# Secrets Review Harness

## Goal
Identify and prevent exposure of credentials, tokens, keys, and sensitive configuration.

## Steps
1. Inspect tracked source, tests, documentation, fixtures, build/deployment configuration, and recent diffs for secret material.
2. Review environment-variable access and configuration loading paths.
3. Inspect logging, error responses, telemetry, and debug output for JWTs, passwords, authorization headers, session values, and keys.
4. Verify `.gitignore` protects `.env` files and that documentation uses variable names or placeholders only.
5. For any exposure, rotate/revoke the secret outside the repository, remove it from active configuration, and assess history/distribution impact.

## Expected output
A sanitized report containing locations/categories, exposure assessment, rotation owner, remediation, and prevention controls. Never paste discovered secret values into the report.

## Validation
Run approved secret scanning tools or pattern checks without echoing matched secret values. Confirm remediation with synthetic placeholders.

## Rollback strategy
Do not roll back a secret rotation. If configuration breaks, issue a new replacement secret through the approved secret store.

## Checklist
- [ ] No real secret value appears in source, tests, docs, or logs
- [ ] `.env` files remain untracked
- [ ] JWTs/passwords/authorization values are redacted from logs
- [ ] Exposed secrets are rotated, not merely deleted
- [ ] New configuration has a documented secret-management owner

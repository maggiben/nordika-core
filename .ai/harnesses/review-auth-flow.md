# Authentication Flow Review Harness

## Goal
Review an authentication implementation for identity proofing, credential handling, session/token lifecycle, and failure behavior.

## Steps
1. Map login, registration, reset, refresh, logout, and account-recovery routes.
2. Trace credentials and tokens through controllers, services, guards, storage, logs, and responses.
3. Verify password hashing, constant-time sensitive comparisons, expiry, rotation, revocation, and brute-force controls.
4. Verify failures are generic and do not reveal account existence, secrets, or stack traces.
5. Confirm authentication is followed by per-action authorization where required.

## Expected output
Findings tied to exact flows and code paths, with risk, remediation, and required tests.

## Validation
Test valid, invalid, expired, revoked, replayed, and rate-limited credentials with synthetic accounts only.

## Rollback strategy
Deploy authentication changes behind a tested compatibility plan; retain a secure revocation/rollback path without re-enabling weak controls.

## Checklist
- [ ] Passwords are never plaintext or logged
- [ ] Tokens/JWTs are never logged or exposed unnecessarily
- [ ] Authentication failures are non-enumerating
- [ ] Authorization occurs after authentication
- [ ] Token/session expiry and revocation are tested

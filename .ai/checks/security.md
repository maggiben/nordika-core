# Security Check

- [ ] Route input contract and validation strategy are explicit.
- [ ] Server-side DTO validation rejects invalid client input before business logic.
- [ ] No secrets, `.env` files, JWTs, passwords, authorization values, or sensitive request data are committed or logged.
- [ ] Error behavior does not expose stack traces or implementation details.
- [ ] New dependency is justified and locked with pnpm.
- [ ] Protected actions authenticate first and authorize every action afterward; no middleware or guard is bypassed.
- [ ] Passwords are modernly hashed and security-sensitive comparisons are constant-time.
- [ ] HTML is sanitized before storage/rendering, and uploaded files have type, size, content, storage, and authorization validation.
- [ ] SQL uses parameter binding or a safe query API; no value is concatenated into SQL.
- [ ] Production traffic uses HTTPS; CSP and rate limiting are enabled and not weakened.
- [ ] Authentication/authorization is not assumed where none exists.

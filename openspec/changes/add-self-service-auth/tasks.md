## 1. Authentication domain
- [x] Add validated environment settings and dependencies.
- [x] Create provider-neutral Mongoose account, credentials, session, and action-token models.
- [x] Implement scrypt credential handling, rotating opaque sessions, JWT issuance, and Resend mail delivery.
- [x] Add registration, login, refresh, logout, verification, reset request, and reset endpoints.

## 2. Security and compatibility
- [x] Enable validated DTO input handling and endpoint throttling.
- [x] Preserve Bearer JWT source authorization and assign `source_writer` on registration.

## 3. Tests and documentation
- [x] Add unit tests for credential, token, and authentication behavior.
- [x] Document required environment variables and email/session design.
- [ ] Run specification, build, unit, e2e, and coverage validation.

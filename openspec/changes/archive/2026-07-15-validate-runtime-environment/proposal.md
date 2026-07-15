# Proposal: Validate runtime environment

## Why

Invalid port values and missing JWT secrets currently fail late or leave
security behavior unclear.

## What Changes

- Centralize validation for `PORT`, MongoDB URLs, and `JWT_SECRET`.
- Default an unset `PORT` to 3000 and reject ports outside 1–65535.
- Require a non-empty `JWT_SECRET` before Passport configures JWT verification.

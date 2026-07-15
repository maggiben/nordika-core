# Proposal: Require JWT authorization for source uploads

## Why

Unauthenticated clients can currently submit source-of-truth uploads.

## What Changes

- Verify Bearer JWTs signed with the externally configured `JWT_SECRET`.
- Require the `source_writer` role for `POST /sources`.
- Reject missing or invalid credentials with HTTP 401 and authenticated callers
  without the role with HTTP 403.

## Non-goals

- Issuing tokens, user registration, and identity management.
- Protecting unrelated routes.

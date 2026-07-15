# Add self-service authentication

## Why
The core service has Bearer-token authorization for source uploads but no
first-party identity lifecycle. Clients need a secure, backend-owned way to
register and manage email/password identities without exposing browser cookies
from Core.

## Scope
- Add email/password registration, login, refresh, logout, email verification,
  and password-reset HTTP endpoints.
- Return a short-lived HS256 access JWT and opaque rotating refresh token for a
  frontend BFF to place in HttpOnly cookies.
- Persist provider-neutral identities, credentials, sessions, and one-time
  verification/reset tokens in MongoDB.
- Send verification and reset messages through Resend.
- Assign `source_writer` to newly registered accounts.

## Non-goals
- OAuth, social-login providers, browser cookie mutation, account administration,
  and email-template hosting are not part of this change.

## Compatibility
Existing Bearer JWT source-upload authorization remains supported. New tokens
contain the existing `sub` and `roles` claims.

## Affected capabilities
- `core-api`
- `source-of-truth`
- New `authentication` capability

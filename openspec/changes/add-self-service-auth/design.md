# Design: self-service authentication

## Decisions
Accounts use a provider-neutral `identities` array keyed by provider and
provider subject. Local credentials are stored separately as a scrypt-derived
hash and random salt. An account owns roles and verified-email state.

Access tokens are HS256 JWTs with a 15-minute expiry and the existing `sub` and
`roles` claims. Refresh tokens are 32-byte random opaque values. Only an SHA-256
digest is stored. Refresh rotates the token atomically: use of an expired,
revoked, or already-rotated token fails without issuing credentials.

Verification and password-reset values are also random opaque tokens whose
digests and expiry timestamps are stored. The public forgotten-password result
is identical for existing and non-existing accounts.

Core returns JSON tokens only; a BFF is responsible for secure/HttpOnly cookie
attributes. No token, password, secret, or raw email is logged.

## Data model
- `Account`: normalized unique email, roles, verification timestamp, identities.
- `LocalCredential`: account id, scrypt salt and derived key.
- `RefreshSession`: account id, digest, expiry, revocation/replacement metadata.
- `EmailActionToken`: account id, digest, purpose, expiry, consumed timestamp.

## External email
The Resend client is constructed only when `RESEND_API_KEY` is present. Missing
mail configuration fails a registration/action attempt safely rather than
pretending delivery occurred. Resend message failures do not expose provider
details.

## Alternatives
JWT refresh tokens were rejected because opaque stored sessions make replay
revocation and rotation enforceable. bcrypt was rejected because Node `crypto`
scrypt satisfies the dependency constraint. Cookies were rejected because Core
is deliberately BFF-friendly and does not own browser-origin policy.

## Security
DTOs validate input globally. Auth endpoints have stricter throttles. Password
comparison uses `timingSafeEqual`; token lookup uses a digest and database
single-use state. Password reset revokes active sessions. Emails include only
the action URL and no secrets in logs.

## Rollback
Remove the Auth module and new collections after revoking outstanding sessions;
existing source Bearer JWT behavior remains unaffected.

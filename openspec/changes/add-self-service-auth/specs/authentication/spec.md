# Authentication Specification

## Purpose
Provide secure self-service credentials and session tokens to a frontend BFF.

## Requirements

### Requirement: Register local identities
The service SHALL register a valid email/password account with a provider-neutral
local identity, a scrypt password credential, the `source_writer` role, and an
unverified email state. It SHALL return Core-issued tokens and send an email
verification message.

#### Scenario: Register account
- **WHEN** a client submits a valid unused email and password
- **THEN** the service responds with access and refresh tokens and an account
  summary without password material

### Requirement: Authenticate and rotate sessions
The service SHALL issue a 15-minute HS256 access JWT and opaque refresh token on
successful login. It SHALL rotate each refresh token once and invalidate it on
logout or password reset.

#### Scenario: Reuse refresh token
- **GIVEN** a refresh token was used successfully
- **WHEN** it is used again
- **THEN** the service rejects it without issuing tokens

### Requirement: Resist account enumeration
Login failures and forgot-password requests SHALL use non-enumerating responses.

#### Scenario: Unknown forgot-password email
- **WHEN** a client requests a reset for an unregistered email
- **THEN** the response is indistinguishable from the response for a registered
  email

### Requirement: Complete email actions
The service SHALL verify emails and reset passwords only with unexpired,
single-use opaque action tokens sent using Resend.

#### Scenario: Reset password
- **GIVEN** a valid password-reset token
- **WHEN** a client supplies a valid new password
- **THEN** the password is replaced and active sessions are revoked

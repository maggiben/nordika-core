# Security Constraints

## Secrets and sensitive data

- Never commit secrets or `.env` files. Do not add real credentials, keys, tokens, or passwords to source, tests, documentation, or fixtures.
- Never log JWTs, passwords, authorization headers, session identifiers, secrets, or raw sensitive user data.
- Never expose stack traces or internal error details to API clients.

## Input and output handling

- Treat all client input, uploaded files, headers, cookies, query values, route parameters, and environment values as untrusted.
- Always validate request DTOs server-side before business logic. NestJS does not validate automatically; configure and test a global validation pipe when DTO-backed inputs are introduced.
- Always sanitize HTML before it is stored or rendered. Do not rely on client-side sanitization.
- Always validate uploaded-file size, type, content where applicable, storage location, and authorization before processing it.

## Authentication and authorization

- Always authenticate before authorizing, and check authorization for every protected action after authentication.
- Always hash passwords with a modern password-hashing algorithm; never encrypt or store them in plaintext.
- Always use constant-time comparison for security-sensitive secrets, tokens, and verification values.
- Do not claim authentication or authorization exists: the current dependency graph and bootstrap configure neither.
- Never bypass security middleware, guards, interceptors, validation, or authorization checks to make an endpoint work.

## Transport, browser, and abuse protections

- Always use HTTPS in deployed environments and avoid emitting insecure URLs for sensitive flows.
- Never disable Content Security Policy. Any future CSP change requires a documented, tested reason and must retain an effective policy.
- Never disable rate limiting. Add endpoint-appropriate limits before exposing public or credential-bearing routes.

## Data access

- Always use parameterized SQL or the equivalent safe query API supplied by the selected persistence library.
- Never build SQL strings manually from values or concatenate client input into a query.
- Do not add a database, SQL client, file-upload pipeline, authentication flow, CSP, or rate-limiting dependency without an approved implementation and test plan; none exist in the current scaffold.

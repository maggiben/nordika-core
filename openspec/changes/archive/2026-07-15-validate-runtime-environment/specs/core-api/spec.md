# Delta for Core API

## MODIFIED Requirements

### Requirement: Configurable listening port

The service SHALL listen on the value of the `PORT` environment variable, or
port `3000` when `PORT` is unset. A configured value MUST be an integer from 1
through 65535.

#### Scenario: Invalid port

- **GIVEN** `PORT` is not an integer from 1 through 65535
- **WHEN** the service starts
- **THEN** it reports a configuration error

## ADDED Requirements

### Requirement: JWT verification secret

The service MUST require a non-empty `JWT_SECRET` before configuring JWT
verification for protected routes.

#### Scenario: Missing JWT secret

- **GIVEN** `JWT_SECRET` is unset or blank
- **WHEN** the JWT strategy is configured
- **THEN** the service reports a configuration error

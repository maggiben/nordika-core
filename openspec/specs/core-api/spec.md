# Core API Specification

## Purpose

Define the baseline HTTP behavior and runtime configuration of the Nodika Core
service.

## Requirements

### Requirement: Root greeting

The service SHALL expose an unauthenticated `GET /` endpoint that returns the
exact plain-text body `Hello World!` with HTTP 200.

#### Scenario: Read the root greeting

- **WHEN** a client sends `GET /`
- **THEN** the service responds with HTTP 200
- **AND** the response body is `Hello World!`

### Requirement: Configurable listening port

The service SHALL listen on the value of the `PORT` environment variable, or
port `3000` when `PORT` is unset. A configured value MUST be an integer from 1
through 65535.

#### Scenario: Default port

- **GIVEN** `PORT` is unset
- **WHEN** the service starts
- **THEN** it listens on port `3000`

#### Scenario: Invalid port

- **GIVEN** `PORT` is not an integer from 1 through 65535
- **WHEN** the service starts
- **THEN** it reports a configuration error

### Requirement: Default endpoint rate limit

The service SHALL limit each client IP address to 60 requests per 60-second
window unless an endpoint defines a stricter policy.

#### Scenario: Default rate limit exceeded

- **GIVEN** a client has sent 60 requests in 60 seconds to a default endpoint
- **WHEN** the client sends another request to that endpoint
- **THEN** the service responds with HTTP 429

### Requirement: Enforced test coverage

The project MUST enforce at least 80% global statements, branches, functions,
and lines coverage when the coverage test suite runs.

#### Scenario: Coverage below threshold

- **GIVEN** the test suite reports a coverage metric below 80%
- **WHEN** `pnpm run test:cov` runs
- **THEN** the command fails

#### Scenario: Pre-commit quality check

- **WHEN** a developer creates a commit
- **THEN** the pre-commit hook runs `pnpm run test:cov`

### Requirement: Optional MongoDB connectivity

The service SHALL use `MONGO_URI` as the MongoDB connection URL when present,
or `MONGO_URL` when `MONGO_URI` is absent. The URL MUST use the `mongodb://` or
`mongodb+srv://` protocol.

#### Scenario: No database configuration

- **GIVEN** neither MongoDB environment variable is configured
- **WHEN** the service starts
- **THEN** it starts without creating a MongoDB connection

#### Scenario: Invalid database protocol

- **GIVEN** a configured MongoDB URL does not use a supported protocol
- **WHEN** MongoDB configuration is resolved
- **THEN** the service reports a configuration error

### Requirement: JWT verification secret

The service MUST require a non-empty `JWT_SECRET` before configuring JWT
verification for protected routes.

#### Scenario: Missing JWT secret

- **GIVEN** `JWT_SECRET` is unset or blank
- **WHEN** the JWT strategy is configured
- **THEN** the service reports a configuration error

### Requirement: Optional Redis cache

The service SHALL register a global Redis-backed cache when `REDIS_URL` is
configured with the `redis://` or `rediss://` protocol. It SHALL not register a
cache when the variable is absent.

#### Scenario: Redis caching enabled

- **GIVEN** `REDIS_URL` contains a supported Redis URL
- **WHEN** the service starts
- **THEN** the global cache uses Redis storage

#### Scenario: Redis caching disabled

- **GIVEN** `REDIS_URL` is unset
- **WHEN** the service starts
- **THEN** no cache provider is registered

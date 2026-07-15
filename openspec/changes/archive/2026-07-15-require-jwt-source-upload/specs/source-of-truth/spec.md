# Delta for Source of Truth

## MODIFIED Requirements

### Requirement: Upload a JSON source

The service SHALL expose `POST /sources` as a multipart endpoint accepting one
file in the `file` field. The file MUST declare the `application/json` media
type or a structured JSON media type ending in `+json`. The caller MUST present
a valid Bearer JWT with the `source_writer` role.

#### Scenario: Authorized JSON upload

- **GIVEN** MongoDB is configured
- **AND** a client supplies a valid JSON file no larger than 5 MiB
- **AND** the client presents a valid JWT with the `source_writer` role
- **WHEN** the client sends `POST /sources`
- **THEN** the service stores the source and responds with HTTP 201

## ADDED Requirements

### Requirement: Reject unauthorized uploads

The service MUST reject uploads without a valid Bearer JWT with HTTP 401 and
uploads whose JWT does not contain the `source_writer` role with HTTP 403.

#### Scenario: Missing Bearer token

- **WHEN** a client sends `POST /sources` without an Authorization header
- **THEN** the service responds with HTTP 401

#### Scenario: Insufficient role

- **GIVEN** a client presents a valid JWT without the `source_writer` role
- **WHEN** the client sends `POST /sources`
- **THEN** the service responds with HTTP 403

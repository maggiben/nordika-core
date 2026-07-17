# Source of Truth Specification

## Purpose

Store validated JSON uploads as immutable source-of-truth records.

## Requirements

### Requirement: Upload a JSON source

The service SHALL expose `POST /sources` as a multipart endpoint accepting one
file in the `file` field. The file MUST declare the `application/json` media
type or a structured JSON media type ending in `+json`. The caller MUST present
a valid Bearer JWT with the `source_writer` role.

#### Scenario: Authorized JSON upload

- **GIVEN** MongoDB is configured
- **AND** a client supplies a JSON file no larger than 5 MiB in the `file` field
- **AND** the client presents a valid JWT with the `source_writer` role
- **WHEN** the client sends `POST /sources`
- **THEN** the service stores the file name, parsed JSON payload, and creation
  time
- **AND** responds with HTTP 201 containing the record `id`, `filename`, and
  `createdAt`

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

### Requirement: Limit upload request rates

The service SHALL limit each client IP address to 10 `POST /sources` requests
per 60-second window.

#### Scenario: Upload rate limit exceeded

- **GIVEN** a client has sent 10 requests to `POST /sources` in 60 seconds
- **WHEN** the client sends another request to `POST /sources`
- **THEN** the service responds with HTTP 429

### Requirement: Reject invalid uploads

The service MUST reject a missing, oversized, non-JSON, or malformed JSON file
without persisting a record.

#### Scenario: Malformed JSON

- **GIVEN** a client supplies a file declared as `application/json`
- **AND** the file body is not valid JSON
- **WHEN** the client sends `POST /sources`
- **THEN** the service responds with HTTP 400
- **AND** the response does not expose internal implementation details

### Requirement: Report unavailable persistence

The service SHALL report that persistence is unavailable when a valid upload is
received but MongoDB is not configured.

#### Scenario: Missing MongoDB configuration

- **GIVEN** no MongoDB URL is configured
- **AND** a client supplies a valid JSON upload
- **WHEN** the client sends `POST /sources`
- **THEN** the service responds with HTTP 503

### Requirement: Delete sources by project id

The service SHALL expose `DELETE /sources/:projectId` for callers with a valid
Bearer JWT that includes the `source_writer` role. The service MUST hard-delete
every SourceOfTruth document whose `projectId` matches the path parameter. When
at least one document is deleted, the service responds with HTTP 200 containing
`projectId` and `deletedCount`. When no documents match, the service responds
with HTTP 404.

#### Scenario: Authorized project delete

- **GIVEN** MongoDB has one or more SourceOfTruth documents with `projectId`
  `proj_a`
- **AND** the client presents a valid JWT with the `source_writer` role
- **WHEN** the client sends `DELETE /sources/proj_a`
- **THEN** the service deletes those documents
- **AND** responds with HTTP 200 containing `projectId` `proj_a` and a
  `deletedCount` greater than zero

#### Scenario: Project not found

- **GIVEN** no SourceOfTruth documents match `projectId` `missing`
- **AND** the client presents a valid JWT with the `source_writer` role
- **WHEN** the client sends `DELETE /sources/missing`
- **THEN** the service responds with HTTP 404

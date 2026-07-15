# Delta for Source of Truth

## ADDED Requirements

### Requirement: Limit upload request rates

The service SHALL limit each client IP address to 10 `POST /sources` requests
per 60-second window.

#### Scenario: Upload rate limit exceeded

- **GIVEN** a client has sent 10 requests to `POST /sources` in 60 seconds
- **WHEN** the client sends another request to `POST /sources`
- **THEN** the service responds with HTTP 429

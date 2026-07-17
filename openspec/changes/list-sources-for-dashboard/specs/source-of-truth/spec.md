## ADDED Requirements

### Requirement: List latest sources per project

Authenticated clients SHALL be able to GET /sources and receive the newest SourceOfTruth document for each distinct projectId, including snapshot content needed by the dashboard.

#### Scenario: Multiple uploads for two projects

- **GIVEN** two uploads for projectId proj_a and one for proj_b
- **WHEN** an authenticated client calls GET /sources
- **THEN** the response SHALL include exactly one entry for proj_a (the newest)
- **AND** exactly one entry for proj_b
- **AND** each entry SHALL include id, projectId, name, filename, createdAt, and content

#### Scenario: Sources without projectId are omitted

- **GIVEN** a SourceOfTruth document with no projectId
- **WHEN** an authenticated client calls GET /sources
- **THEN** that document SHALL NOT appear in the response

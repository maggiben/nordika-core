## ADDED Requirements

### Requirement: Source records are project-scoped

Uploaded SourceOfTruth documents SHALL include `projectId` when the JSON
payload supplies `meta.projectId`. List/get helpers used by messaging SHALL
be able to resolve the newest source for a given project id.

#### Scenario: Newest source for project

- **GIVEN** two uploads for `projectId` `proj_a` and one for `proj_b`
- **WHEN** messaging resolves the source for active project `proj_a`
- **THEN** it selects the newest `proj_a` upload
- **AND** ignores `proj_b`

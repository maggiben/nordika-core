## ADDED Requirements

### Requirement: Catalog recipients scoped to active project

WhatsApp contacts used for scheduled catalog and task-checklist asks SHALL be
associated with a `projectId`. Dispatch for a slot SHALL only include contacts
whose `projectId` matches the account’s active project.

#### Scenario: Jefe of another obra is not messaged

- **GIVEN** contact A has `projectId` `proj_a` and contact B has `projectId`
  `proj_b`
- **AND** the active project is `proj_a`
- **WHEN** scheduled catalog/task dispatch runs
- **THEN** contact A may receive asks
- **AND** contact B MUST NOT receive asks for that run

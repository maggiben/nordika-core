## ADDED Requirements

### Requirement: Task checklist uses only the active source

Pending objective-task extraction for WhatsApp SHALL use the SourceOfTruth
belonging to the account’s active project only. The service MUST NOT use
global newest-source ordering across projects.

#### Scenario: Other project upload does not change asks

- **GIVEN** active project is `proj_a` with pending task `colocacion carpinterias`
- **AND** a newer upload exists only for `proj_b`
- **WHEN** a notification slot runs task checklist
- **THEN** asks are built from `proj_a` tasks
- **AND** MUST NOT include `proj_b` tasks

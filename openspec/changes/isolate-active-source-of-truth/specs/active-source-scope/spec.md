## ADDED Requirements

### Requirement: Exactly one active project for messaging

The service SHALL expose an active project id used by scheduled WhatsApp
catalog and task-checklist dispatch. At most one project id SHALL be active
per account. Messaging MUST NOT load objective tasks from a non-active
project’s source.

#### Scenario: Activate project

- **WHEN** an authenticated caller sets the active project to `proj_a`
- **THEN** subsequent scheduled task-checklist loads use a SourceOfTruth whose
  `projectId` is `proj_a`
- **AND** MUST NOT use sources belonging to other project ids

#### Scenario: No active project

- **GIVEN** the account has no active project id
- **WHEN** a notification slot is claimed
- **THEN** the service skips task-checklist asks
- **AND** MUST NOT fall back to “latest source globally”

### Requirement: Sources carry project identity

Each stored SourceOfTruth SHALL persist a `projectId` derived from
`content.meta.projectId` when present at upload time. Sources without a
resolvable project id MUST NOT become the active messaging source.

#### Scenario: Upload stamps projectId

- **GIVEN** a snapshot JSON whose `meta.projectId` is `proj_north`
- **WHEN** it is stored via `POST /sources`
- **THEN** the SourceOfTruth record includes `projectId` `proj_north`

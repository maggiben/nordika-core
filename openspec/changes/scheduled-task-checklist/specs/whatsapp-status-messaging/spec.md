## ADDED Requirements

### Requirement: Scheduled slots include task checklist asks

When a notification schedule slot is claimed and Evolution is configured, after
catalog sequence handling for each contact with assigned catalog messages, the
service SHALL enqueue pending objective-task checklist asks for that contact as
specified by the `task-checklist` capability. Task asks for a contact MUST NOT
start while that contact still has an unanswered catalog step in the active
slot.

#### Scenario: Catalog then tasks in one slot

- **GIVEN** a contact has an open unanswered catalog step in the active slot
- **AND** pending objective tasks exist in the latest source
- **WHEN** the scheduler runs for that slot
- **THEN** the service does not send a task ask yet
- **WHEN** the contact later answers the catalog step
- **THEN** the service may send the first pending task ask in that same slot

#### Scenario: Catalog complete unlocks tasks on reply path

- **GIVEN** all assigned catalog steps for the contact are complete for the
  active slot
- **AND** pending tasks remain
- **WHEN** inbound handling closes the last catalog step
- **THEN** the service sends the first pending task ask without waiting for the
  next schedule minute

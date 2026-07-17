## MODIFIED Requirements

### Requirement: Task checklist follows catalog and respects date window

After catalog messaging for a contact has no further open step for the notification slot (or catalog is empty for that contact), Core SHALL enqueue in-window pending objective-task checklist asks for that contact, then MAY send the obra adelanto catch-up ask last when enabled.

Pending task selection SHALL use the active project source-of-truth, effective avance &lt; 100, and the task date-window rules. Out-of-window tasks SHALL NOT be asked as numbered checklist items.

#### Scenario: Sequence is catalog then in-window tasks then adelanto

- **GIVEN** a contact has assigned non-adelanto catalog messages and in-window pending tasks, and adelanto is enabled
- **WHEN** a notification slot runs and replies advance the conversation
- **THEN** Core sends catalog asks first
- **AND** then in-window task checklist asks one at a time
- **AND** then a single adelanto catch-up ask

#### Scenario: Open catalog blocks task and adelanto asks

- **GIVEN** a catalog outbound for the contact still awaits a reply in the slot
- **WHEN** Core considers task checklist or adelanto send
- **THEN** neither task checklist nor adelanto WhatsApp is sent until that catalog step is clear

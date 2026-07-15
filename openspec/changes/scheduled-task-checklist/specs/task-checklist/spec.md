## ADDED Requirements

### Requirement: Pending objective tasks from latest source

On each claimed notification slot, the service SHALL load the latest
`SourceOfTruth` document (by `createdAt` descending) and treat entries in
`content.tareas_con_objetivo` as pending when `avance_base` is missing or
strictly less than `100`. Completed tasks (`avance_base >= 100`) MUST NOT be
asked again on that load.

#### Scenario: Pending colocacion carpinterias

- **GIVEN** the latest source contains a task with
  `label` `"colocacion carpinterias"` and `avance_base` `40`
- **AND** another task with `avance_base` `100`
- **WHEN** a notification slot is claimed
- **THEN** the pending set includes `"colocacion carpinterias"`
- **AND** excludes the completed task

#### Scenario: No source uploaded

- **GIVEN** MongoDB has no `SourceOfTruth` documents
- **WHEN** a notification slot is claimed
- **THEN** the service skips task checklist asks
- **AND** existing catalog sends continue to run

### Requirement: One WhatsApp ask per pending task

The service SHALL send at most one open task-checklist WhatsApp at a time per
contact per slot, advancing to the next pending task only after a meaningful
inbound reply closes the current ask. Asks SHALL be addressed to each contact
that has at least one active assigned catalog message. Message titles SHALL
identify task progress (for example `Tarea 1/N · {label}`).

#### Scenario: Reply unlocks next task

- **GIVEN** two pending tasks for the catalog contact in the active slot
- **AND** the first task ask was sent
- **WHEN** the contact sends a meaningful WhatsApp reply
- **THEN** the service persists the check-in for the first task
- **AND** sends the second task ask

#### Scenario: Ack noise does not advance

- **GIVEN** an open task ask
- **WHEN** the contact (or Evolution) sends an ack-like body such as
  `Recibido`
- **THEN** the ask remains open
- **AND** the next task is not sent

### Requirement: Persist answers in StaffMessage

The service SHALL persist each task ask as an outbound `StaffMessage` with
`source` `task_checklist` and each meaningful reply as an inbound
`StaffMessage` linked by `threadId`, without modifying the source snapshot.
Outbound asks MUST store at least `sourceId`, `taskId`, `taskLabel`,
`contactId`, `phone`, and `slotKey`.

#### Scenario: Check-in stored on reply

- **GIVEN** a pending task ask was sent for task id `task_1`
- **WHEN** the contact replies with meaningful text
- **THEN** an outbound `StaffMessage` for that `taskId` has `repliedAt` set
- **AND** an inbound `StaffMessage` exists with the reply body and the same
  `taskId` / `threadId`

### Requirement: List task checklist history

Authenticated `message_admin` callers SHALL be able to list recent task
checklist asks via a Core HTTP GET endpoint filtered optionally by `contactId`
or `slotKey`, backed by outbound `StaffMessage` rows with `source`
`task_checklist`.

#### Scenario: List by contact

- **WHEN** a `message_admin` calls the task-checklist list endpoint with a
  `contactId` query
- **THEN** the service returns task ask rows for that contact ordered by
  newest ask first
- **AND** answered rows include the linked inbound reply body when available

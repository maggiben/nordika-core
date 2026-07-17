## ADDED Requirements

### Requirement: Task ask titles use chat progress

Outbound task-checklist WhatsApp titles SHALL use `Tarea {step}/{total}` (with project and label as already formatted) where progress reflects the active notification slot’s ask conversation, not the shrinking set of incomplete tasks alone.

For each next ask in the slot:

- `answered` SHALL be the number of distinct `taskId`s with a replied outbound `task_checklist` ask for that contact and slot
- `remaining` SHALL be the number of currently eligible pending tasks for the project that do not yet have such a replied ask
- `total` SHALL equal `answered + remaining`
- `step` SHALL equal `answered + 1`

Replying that a task is at 100% MUST still count as an answered ask for progress: the next title SHALL advance `step` and MUST NOT reset to `1` solely because that task left the incomplete set. Tasks never asked because they became ineligible (for example effective avance already `>= 100`) MUST NOT increment `answered`; they MAY reduce `remaining` and thus `total`.

#### Scenario: 100% reply advances step without shrinking total

- **GIVEN** five in-window pending objective tasks for the contact in the active slot
- **AND** the first ask was titled with `Tarea 1/5`
- **WHEN** the contact replies that the first task is at 100%
- **AND** the service sends the next task ask
- **THEN** that ask title includes `Tarea 2/5`
- **AND** MUST NOT use `Tarea 1/4`

#### Scenario: Partial replies keep total while advancing step

- **GIVEN** three in-window pending tasks remain unasked after two answered asks in the slot (`answered` is 2)
- **WHEN** the service sends the next ask
- **THEN** the title includes `Tarea 3/5` when `remaining` is 3
- **WHEN** the contact replies with a partial avance (below 100) and the service sends the following ask
- **THEN** the title includes `Tarea 4/5`

#### Scenario: Skipped live-complete task does not count as answered

- **GIVEN** four pending tasks at the start of the checklist
- **AND** one unasked task becomes effective avance `>= 100` before it would be asked
- **WHEN** the service sends the next ask among the remaining eligible tasks
- **THEN** `answered` does not include the skipped task
- **AND** `total` equals answered plus the remaining eligible unasked tasks

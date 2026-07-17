## ADDED Requirements

### Requirement: Objective tasks asked only inside planned date window

When Core builds the pending objective-task list for WhatsApp checklist asks, it SHALL include only incomplete tasks whose planned calendar window contains today.

Pending remains effective avance missing or strictly less than 100 (live parsed percent preferred over snapshot `avance_base`).

A task is in window when both `ini` and `fin` parse as calendar dates and `ini ≤ today ≤ fin` (inclusive), with `today` computed in the account notification schedule timezone when set.

Tasks with missing or invalid `ini` or `fin` SHALL be treated as out of window and SHALL NOT be asked as numbered checklist items.

A safety cap MAY still limit how many in-window tasks are asked per load, but the date window SHALL be applied before the cap.

#### Scenario: Task in range is asked

- **GIVEN** today is 2026-07-17 in the account timezone
- **AND** an incomplete objective task has `ini` 2026-07-01 and `fin` 2026-07-31
- **WHEN** the task checklist selects pending asks for the active project source
- **THEN** that task is eligible for a checklist WhatsApp ask

#### Scenario: Future task is not asked as checklist

- **GIVEN** today is 2026-07-17
- **AND** an incomplete objective task has `ini` 2026-08-01 and `fin` 2026-08-31
- **WHEN** the task checklist selects pending asks
- **THEN** that task is not included in the checklist ask list

#### Scenario: Past window task is not asked as checklist

- **GIVEN** today is 2026-07-17
- **AND** an incomplete objective task has `ini` 2026-06-01 and `fin` 2026-06-30
- **WHEN** the task checklist selects pending asks
- **THEN** that task is not included in the checklist ask list

#### Scenario: Missing dates are out of window

- **GIVEN** an incomplete objective task has no usable `ini` or `fin`
- **WHEN** the task checklist selects pending asks
- **THEN** that task is not included in the checklist ask list

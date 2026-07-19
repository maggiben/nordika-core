## ADDED Requirements

### Requirement: Persist attendance marks on a site lead contact

A WhatsApp contact SHALL store zero or more attendance marks in `attendanceMarks`. Each mark MUST include `reportId`, an ISO date `YYYY-MM-DD`, and a `status` of `full_day`, `half_day`, `absent`, or `justified`.

#### Scenario: Replace a month of marks

- **WHEN** an authenticated client PUTs `/messaging/contacts/:id/attendance` with a valid `yearMonth` and `marks` array
- **THEN** Core SHALL replace that contact’s marks whose dates fall in that year-month with the validated list
- **AND** SHALL leave marks outside that year-month unchanged

#### Scenario: Clear a month

- **WHEN** an authenticated client PUTs an empty `marks` array for a `yearMonth`
- **THEN** Core SHALL remove all marks for that contact in that year-month

### Requirement: Read attendance marks

Core SHALL expose GET `/messaging/contacts/:id/attendance` that returns the contact’s attendance marks, optionally filtered by `yearMonth`.

#### Scenario: Filter by month

- **WHEN** the client GETs attendance with `yearMonth=2026-07`
- **THEN** the response SHALL include only marks dated in July 2026 for that contact

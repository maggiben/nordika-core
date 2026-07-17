## Why

Task checklist WhatsApp asks ignore planned task dates and always take the first 20 incomplete objective tasks, which floods jefes with out-of-window work. Operators also lack a closing ask to record adelantos (work started before its planned window). Filtering by `ini`/`fin` and appending one adelanto catch-up ask fixes both.

## What Changes

- Filter pending objective-task checklist asks to tasks whose planned calendar window includes “today” (account schedule timezone).
- Keep a safety cap, but date-window filtering is the primary selector (replacing “always 20” as the effective behavior).
- After in-window task asks for a slot are complete (or none apply), send one **adelanto** catch-up outbound when enabled for the contact/account.
- Persist adelanto asks/replies as StaffMessage history (`source` distinct from per-task checklist) for obra adelanto records.
- Tasks outside the window are not auto-asked as numbered checklist items (adelanto free-text covers early/other work).

## Capabilities

### New Capabilities

- `task-date-window`: Decide which objective tasks are eligible for checklist WhatsApp asks using snapshot `ini`/`fin` vs today.
- `obra-adelanto-catchup`: End-of-sequence adelanto ask after in-window checklist, with configurable body and persisted thread.

### Modified Capabilities

- `whatsapp-status-messaging`: Task checklist sequencing after catalog MUST use date-window eligibility and MAY append adelanto catch-up last.

## Impact

- `src/messaging/pending-objective-tasks.ts` (date filter + optional cap)
- `src/messaging/messaging.service.ts` (checklist load/send; adelanto after complete)
- StaffMessage schema / DTOs for adelanto source
- Account or catalog flag for adelanto enable + body (frontend sibling `staff-adelanto-catchup`)
- Unit tests for window math and sequencing

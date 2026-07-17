## Why

Task-checklist WhatsApp titles use `Tarea step/total` where `total` is the current count of incomplete (avance &lt; 100) tasks. When a jefe answers “Al 100”, that task drops out of the pending set and the next ask often shows `1/(N-1)` instead of `2/N`, so the counter no longer reflects how many questions remain in the chat.

## What Changes

- Recalculate outbound task-checklist titles so `step`/`total` track **chat progress** for the active notification slot: answered asks plus remaining unasked pending tasks.
- Keep existing ask selection (skip effective 100%, date window, one open ask at a time); only the label arithmetic changes.
- Extend unit coverage for sequences that mix 100% and partial replies (e.g. `1/5` → `2/5` after “Al 100”, not `1/4`).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `task-checklist`: `Tarea step/total` titles MUST reflect slot chat progress (`answered + remaining`), not the shrinking incomplete-task list after mid-slot 100% replies. The delta adds that requirement under `specs/task-checklist/` (capability introduced in prior checklist changes; not yet synced into `openspec/specs/`).

## Impact

- `src/messaging/messaging.service.ts` (`sendNextTaskChecklistAsk` title `step`/`total`)
- `src/messaging/messaging.service.spec.ts` (checklist title expectations after 100% replies)
- No API, schema, Evolution, or frontend changes

## Why

Operators need a living obra record: on every scheduled notification date, WhatsApp should ask the catalog contact about each pending objective task from the latest snapshot (e.g. "colocacion carpinterias"), not only the hand-written catalog prompts. Answers must persist as a task checklist so progress history is queryable in MongoDB.

## What Changes

- On each claimed notification slot, after (or interleaved with) existing assigned catalog sends, enqueue **one WhatsApp question per pending** `tareas_con_objetivo` task from the **latest** `SourceOfTruth` upload
- Treat a task as pending when `avance_base < 100` (or missing avance)
- Send each task ask to the **same contact** already used for catalog assignment
- Advance task questions one-at-a-time on meaningful reply (same reply-gated pattern as catalog)
- Persist each reply as StaffMessage inbound (linked to the outbound ask); do **not** mutate the immutable snapshot
- Expose read APIs that list task asks/answers from StaffMessage so Staff can audit obra updates

## Capabilities

### New Capabilities
- `task-checklist`: Load pending objective tasks from the latest source-of-truth snapshot, ask them via WhatsApp on schedule, gate progression on reply, and persist asks/answers in StaffMessage

### Modified Capabilities
- `whatsapp-status-messaging`: Scheduled notification runs SHALL also drive per-task checklist questions for the catalog contact within the active notification slot
- `source-of-truth`: Messaging MAY read the latest stored source payload to derive pending `tareas_con_objetivo` (read-only; uploads remain immutable)

## Impact

- Core: `messaging` (scheduler, inbound advance, schemas, DTOs, controller), optional light read helper on `sources`
- MongoDB: StaffMessage fields for task asks; reads from existing `SourceOfTruth`
- Evolution WhatsApp: additional outbound messages per pending task per slot
- Frontend (follow-up, out of Core scope for v1): optional checklist viewer via new Core GET endpoints
- No breaking HTTP contract for existing catalog/contact APIs

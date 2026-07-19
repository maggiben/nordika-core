## Why

Operators already send «Asistencia del equipo» to each jefe de obra and get structured replies. Those replies should fill `attendanceMarks` automatically so the planilla stays current without re-typing.

## What Changes

- Tag catalog attendance messages with `attendance`.
- On inbound reply to an attendance catalog outbound, parse per-person marks and upsert them for the reply calendar date.
- Skip progress-% parsing for attendance-tagged catalog replies.

## Capabilities

### New Capabilities

- `attendance-whatsapp-ingest`: Map WhatsApp attendance replies into contact attendance marks.

### Modified Capabilities

- (none)

## Impact

- `recordInboundMessage`, catalog tags, orgReports matching, attendance merge helpers, tests
- Frontend attendance preset tags (sibling)

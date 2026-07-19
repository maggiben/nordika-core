## ADDED Requirements

### Requirement: Ingest attendance marks from WhatsApp catalog replies

When an authenticated inbound reply closes an open catalog outbound whose catalog message is tagged `attendance` (or matches attendance title/body heuristics), Core SHALL parse per-person attendance statuses from the reply and upsert `attendanceMarks` on that contact for the reply’s calendar date.

#### Scenario: Full-day and absent marks from a reply

- **WHEN** a lead with org reports Ana and Luis replies to an attendance catalog ask with text that marks Ana as full day and Luis as absent
- **THEN** Core SHALL store marks for that calendar date: Ana `full_day`, Luis `absent`
- **AND** SHALL NOT overwrite marks for other dates

#### Scenario: Skip progress parse for attendance replies

- **WHEN** the matched outbound is an attendance catalog message
- **THEN** Core SHALL NOT require progress-% parsing for that reply

## 1. Parser and tag

- [x] 1.1 Add `ATTENDANCE_CATALOG_TAG` and attendance reply parser (name + status keywords)
- [x] 1.2 Detect attendance catalog (tag or title/body heuristic)

## 2. Inbound hook

- [x] 2.1 On attendance catalog reply, upsert marks for reply calendar date
- [x] 2.2 Skip progress parse for attendance replies
- [x] 2.3 Add unit tests for parser + inbound ingest

## 3. Validation

- [x] 3.1 Run targeted Jest suites

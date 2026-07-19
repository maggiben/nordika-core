## Context

Org charts already live on `WhatsAppContact.orgReports`. The frontend planilla needs durable marks (full_day / half_day / absent / justified) keyed by report id + ISO date.

## Goals / Non-Goals

**Goals:**

- Persist attendance marks in Mongo on the lead contact.
- GET filtered by `yearMonth`; PUT replaces marks for that month only.
- Validate status enum and date shape.

**Non-Goals:**

- Payroll / hours.
- Parsing WhatsApp replies into marks.
- Separate multi-tenant attendance collection (v1 embeds on contact).

## Decisions

1. **Embed `attendanceMarks` on WhatsAppContact** — same ownership as org chart; no new collection.
2. **Month replace on PUT** — `{ yearMonth, marks: [{ reportId, date, status }] }` replaces all marks whose date is in that month; other months untouched.
3. **GET `?yearMonth=`** — returns filtered list; omit query to return all (capped reasonably).

## Risks / Trade-offs

- **[Risk] Large arrays over years** → Mitigation: team-sized sheets; optional later archive by year.
- **[Risk] Concurrent editors** → Last PUT wins for that month.

## Migration Plan

- Deploy Core before frontend switch. Empty array default. Rollback: stop writing field.

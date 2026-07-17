## Why

The frontend stores each jefe de obra’s org chart (direct reports) only in the browser. Operators need that hierarchy—and each lead’s membership in one or more Nodika obras—persisted in MongoDB so it survives devices, is shared across users, and can feed messaging/progress later.

## What Changes

- Persist per-contact org-chart **reports** on `WhatsAppContact` (id, name, role, optional roleOther).
- Expose reports on roster/contact read responses and accept them on contact create/update DTOs.
- **BREAKING (membership write)**: When `PATCH /messaging/contacts/:id` includes `projectIds` (array present), **replace** the contact’s project membership with that list (empty array clears membership). Singular `projectId` continues to **merge**/add one obra (existing Staff create behavior).
- Non-goals: separate OrgChart collection, multi-level trees, frontend UI (owned by frontend change `persist-staff-org-chart`), automatic import of browser localStorage charts.

## Capabilities

### New Capabilities

- `staff-org-chart`: Core persistence and API for a contact’s direct-report org chart.

### Modified Capabilities

- `whatsapp-status-messaging`: Contact update/roster shapes include org reports; `projectIds` on PATCH replaces membership when the array field is sent.
- `contact-project-membership`: Document replace-vs-merge write rules for `projectIds` / `projectId`.

## Impact

- Core: `messaging.schema`, DTOs, `MessagingService` create/update/roster mapping, tests.
- Frontend BFF consumers: org-chart editor and roster team counts (sibling change).
- No new environment variables.

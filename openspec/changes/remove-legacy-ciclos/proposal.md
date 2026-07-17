## Why

Obra dates (`ciclo_inicio` / `ciclo_fin`) already live in uploaded snapshot meta (`SourceOfTruth`). A separate Mongo `Ciclo` / `WorkStatus` / `MessageDispatch` stack and weekly ciclo dispatcher were never wired from the product UI—operators only upload snapshots and use catalog / task-checklist messaging—so the empty collections and dead APIs are confusing debt.

## What Changes

- **BREAKING**: Remove HTTP APIs for ciclos, work-status, dispatches, and manual ciclo weekly dispatch (`POST /messaging/dispatch/run`).
- Remove Mongoose models/schemas and Mongo collections `ciclos`, `workstatuses`, `messagedispatches` (drop empty production collections after deploy).
- Stop invoking `runWeeklyStatusDispatch` from the minute scheduler; scheduled WhatsApp remains account `emailNotificationSchedule` → catalog + task checklist → `staffmessages`.
- Update OpenSpec requirements so weekly status messaging no longer depends on a Ciclo window / work-status rows.
- Keep `MessageTemplate`, contacts, catalog, staff messages, and snapshot meta `ciclo_*` fields (display / template placeholders only).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `whatsapp-status-messaging`: Remove Ciclo window, weekly work-status upsert, and ciclo-based dispatch requirements; keep contacts, templates, locale, Evolution adapter, and non-ciclo send paths.
- `core-api`: Drop Redis cache entries for removed messaging list endpoints (`/ciclos`, `/work-status`, `/dispatches`).

## Impact

- **nodika-core**: messaging schema/models, controller routes, service methods + tests, scheduler branch, cache path invalidation, `.ai`/README mentions if any.
- **Mongo (Railway)**: drop orphan collections after code ships (already empty in production).
- **nodika-frontend**: no BFF routes for ciclos today; snapshot dashboard meta and optional template placeholders named `ciclo_*` stay. No frontend OpenSpec change required for this removal.
- **Clients**: any external caller of the removed endpoints will get 404.

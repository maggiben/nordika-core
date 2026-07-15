## Context

Today:
- Frontend library keeps many projects in `localStorage`; navbar selector only changes local UI
- Core `SourceOfTruth` stores uploads without `projectId` or active flag
- Task checklist uses `loadPendingObjectiveTasksFromLatestSource()` → newest upload globally
- Catalog contacts are global → jefes can get asks derived from the wrong obra

## Goals / Non-Goals

**Goals:**
- One active obra in Core at a time
- Navbar selection (and upload of a project) sets that active obra
- WhatsApp catalog + task asks only from the active source, to contacts belonging to that project
- Message/task history queryable per project without leakage

**Non-Goals:**
- Creating a new MongoDB collection per project (operational cost; use `projectId` partition instead)
- Multi-active messaging (“send all projects every schedule”)
- Moving the full snapshot library from browser to Core in v1 (selector still local, but **active id** synced to Core)

## Decisions

### 1. Isolation model = `projectId` partition (not per-project collections)
- Every `SourceOfTruth`, catalog assignment, and task-checklist StaffMessage carries `projectId`
- Queries always filter by active `projectId`
- **Alt rejected:** dynamic collection names per project — breaks Mongoose models and indexes

### 2. Active source = Core singleton
- Account or app-level setting: `activeProjectId` (prefer account settings so multi-tenant stays correct)
- Helper `resolveActiveSource()` → latest SourceOfTruth for that `projectId` (or the source marked `active: true` within the project)
- Simultaneously at most one source document may have `active: true` **or** derive active solely from account `activeProjectId` without a flag on the doc
- **Preferred:** `Account.activeProjectId` + always take newest SourceOfTruth for that projectId

### 3. Navbar → Core sync
- When user selects a project in the navbar, frontend BFF `PATCH /account/settings` or `POST /sources/active` with `{ projectId }`
- On successful snapshot upload, upsert library **and** set active project to that upload’s `projectId`

### 4. Contacts / jefes scoped to project
- Add optional `projectId` on WhatsAppContact (and catalog messages inherit via assigned contact)
- Scheduler: only contacts with `projectId === activeProjectId` (or null only during migration with warning)
- Task asks use pending tasks from active project’s source only

### 5. StaffMessage
- Keep `sourceId` + add `projectId` on task_checklist (and eventually catalog) outbounds
- Inbound copies `projectId` from openThread
- List APIs filter by active or explicit `projectId` query

## Risks / Trade-offs

- **[Risk] Local selector out of sync with Core** → Mitigation: select/upload always PATCH active; show toast on failure
- **[Risk] Legacy contacts without projectId** → Mitigation: migration script or “assign to active project” Staff action; until then exclude from dispatch
- **[Risk] User expected literal Mongo collections** → Mitigation: document that isolation is logical; same safety if every query filters `projectId`

## Migration Plan

1. Add `projectId` on SourceOfTruth at upload (from `content.meta.projectId`)
2. Backfill existing sources; set account `activeProjectId` to newest backfilled project
3. Require contact `projectId` for new catalog assigns; Staff UI to set project on contact
4. Switch task loader to active source only
5. Frontend wires selector + upload to activate API

## Open Questions

- Should catalog **titles** (Performance / Asistencia) also be per-project duplicates, or shared templates with per-project assignment only? **Default:** shared catalog message definitions with `projectId` on assignment/contact so one jefe in project A does not get project B tasks.

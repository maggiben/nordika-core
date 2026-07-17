## Context

Nodika persists obra date ranges in snapshot `meta.ciclo_inicio` / `meta.ciclo_fin` (`SourceOfTruth`). Separately, messaging still registers Mongoose models `Ciclo`, `WorkStatus`, and `MessageDispatch`, exposes CRUD/list/dispatch HTTP routes, and the minute scheduler still calls `runWeeklyStatusDispatch`. Production Mongo has those three collections empty; the frontend never creates ciclos. Live scheduled WhatsApp already uses account `emailNotificationSchedule` → catalog messages + task checklist → `StaffMessage`.

## Goals / Non-Goals

**Goals:**

- Delete the ciclo / work-status / message-dispatch persistence and HTTP surface.
- Remove weekly ciclo dispatch from the scheduler and controller.
- Align OpenSpec (`whatsapp-status-messaging`, `core-api`) with catalog/checklist-based scheduling.
- Drop empty production Mongo collections after the code ships.

**Non-Goals:**

- Changing snapshot meta field names (`ciclo_*`) or dashboard display.
- Removing `MessageTemplate` / template CRUD (still used by staff test-send UI).
- Changing catalog, task-checklist, contacts, progress, or Evolution send for non-ciclo paths.
- Renaming the Mongo database from accidental `test` (separate ops follow-up).
- Frontend OpenSpec change (no ciclos BFF routes exist).

## Decisions

1. **Remove three models together** (`Ciclo`, `WorkStatus`, `MessageDispatch`)  
   - **Why:** They form one unused subgraph; leaving any one keeps dead API surface.  
   - **Alt rejected:** Keep schemas “for later” — contradicts product reality and confuses operators inspecting Mongo.

2. **Keep `MessageTemplate`**  
   - **Why:** Frontend staff messaging still lists/creates templates and test-send uses `templateKey`.  
   - **Alt rejected:** Fold templates into catalog only in this change — larger product rewrite.

3. **Scheduler: delete ciclo branch only**  
   - **Why:** `runScheduledNotifications` must keep claiming slots, email digest, catalog send, and task-checklist kickoff.  
   - **Alt rejected:** Disable entire scheduler — would break live WhatsApp.

4. **Hard-delete routes (404), no deprecation window**  
   - **Why:** No production callers; collections empty.  
   - **Alt rejected:** Return 410 Gone for a release — unnecessary complexity.

5. **Ops drop collections after deploy**  
   - **Why:** Mongoose does not auto-drop unused collections; empty leftovers would reappear as noise.  
   - **Alt rejected:** Leave empty collections — same confusion that started this cleanup.

## Risks / Trade-offs

- **[Risk] Hidden external client uses `/messaging/ciclos` or `/dispatch/run`** → Mitigation: endpoints unused by frontend; breaking change called out in proposal; monitor 404s briefly after deploy.
- **[Risk] Tests tightly couple to ciclo helpers** → Mitigation: delete/rewrite ciclo-focused unit tests; keep catalog/checklist coverage green before merge.
- **[Risk] Cache path helpers still reference ciclos** → Mitigation: remove from `MESSAGING_CACHE_PATHS` / invalidation lists in the same PR.
- **[Trade-off] Snapshot still says “ciclo”** → Acceptable naming in obra meta; not the Mongo model.

## Migration Plan

1. Land Core PR removing models, routes, scheduler branch, and specs sync.
2. Deploy nodika-core.
3. Drop Mongo collections `ciclos`, `workstatuses`, `messagedispatches` on the app DB (currently `test`).
4. Rollback: revert Core deploy; collections can be recreated empty by Mongoose if code is restored (no data to restore).

## Open Questions

- None blocking; optional later: rename snapshot meta keys away from `ciclo_*` for clarity (frontend + generators).

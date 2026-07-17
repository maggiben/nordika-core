## Context

Nodika Core already:
- Stores immutable snapshot JSON in `SourceOfTruth` (`content.tareas_con_objetivo[]` with `id`, `label`, `avance_base`, …)
- Sends assigned catalog WhatsApps one-step-at-a-time per contact on notification slots, advancing on meaningful inbound replies
- Scopes catalog cycles with `catalogSlotKey` / `catalogSlotStartAt`

It does **not** yet read snapshot tasks for WhatsApp or persist obra check-ins. Operators currently only get hand-written catalog asks (e.g. Performance / Asistencia).

## Goals / Non-Goals

**Goals:**
- On each claimed schedule slot, ask the catalog contact one WhatsApp per pending objective task from the latest source upload
- Pending = `avance_base` missing or `< 100`
- Persist each answered check-in as StaffMessage rows (`outbound` ask + `inbound` reply) without mutating the snapshot
- Reuse catalog reply-gating (one open question at a time) within the same slot

**Non-Goals:**
- Frontend checklist UI (Core GET is enough for v1; Staff UI can follow)
- Editing snapshot `avance_base` from WhatsApp replies
- Multi-contact / per-sector assignment for tasks
- Asking context tasks (`tareas_contexto`)
- Branching / flow-graph logic for task answers

## Decisions

### 1. Source of tasks = latest `SourceOfTruth` by `createdAt`
- **Choice:** `findOne().sort({ createdAt: -1 })` and read `content.tareas_con_objetivo`
- **Why:** Single obra blob is already the upload path; operators expect "the project I just uploaded"
- **Alt:** Active project id → deferred until multi-project Core wiring exists

### 2. Pending filter
- **Choice:** Effective avance `!(Number(avance) >= 100)`, where effective avance prefers the latest live `parsedProgress.percent` for that `taskId` on the project when present, otherwise snapshot `avance_base`
- **Why:** Matches dashboard mental model of incomplete objective tasks; includes null/undefined avance; avoids re-asking tasks already reported at 100% via WhatsApp when the snapshot was not re-uploaded
- **Alt:** Filter by `fin` / dates → less reliable in current snapshots
- **Alt rejected:** Snapshot-only filter → re-asks completed live tasks every slot until operators re-upload

### 3. Delivery = synthetic catalog-like sequence per slot
- **Choice:** Build ordered task asks for the same `assignedContactId` used by catalog messages (first assigned catalog contact for the obra; if multiple contacts have assigned catalog items, each contact still only receives their own catalog; task checklist uses the contact that owns at least one assigned catalog message — if several, prefer the contact with the lowest phone/label sort as v1 default, **or** replicate asks to every contact that has catalog assignments).  
  **Locked for v1:** send task checklist to **every contact that has ≥1 assigned active catalog message** (same people already in the operational loop). Each contact gets the full pending-task list sequenced after / as part of their slot sends.
- **Why:** User confirmed "el responsable es el mismo contacto del catalogo"
- **Ordering within a slot:** existing catalog steps first (by `sortOrder`), then pending tasks by snapshot order (array index), titles like `Tarea 1/N · {label}`
- **Alt:** Separate WhatsApp templates / buttons → more Evolution complexity for v1

### 4. Persistence = StaffMessage only
- Outbound ask: `source: 'task_checklist'` with `taskId`, `taskLabel`, `sourceId`, `slotKey`
- Inbound reply: existing webhook inbound row linked by `threadId`, with `questionMessageId` pointing at the outbound ask StaffMessage (plus task metadata / title for display)
- History/list APIs query outbound task_checklist messages and join inbound by thread / questionMessageId
- **Why:** one collection for the conversation trail; no duplicate TaskChecklist docs
- **Alt (rejected):** separate `TaskChecklist` collection; denormalizing full `questionBody` text on inbound

### 5. Advance path
- Reuse inbound → advance pattern: when the open outbound is a task checklist ask (`source: 'task_checklist'` with `taskId`), on meaningful reply stamp the outbound and send the next pending ask in the same slot
- Do not treat prior slots' answers as completing today's asks

### 6. Empty pending set
- If no pending tasks, skip checklist sends (catalog still runs)

## Risks / Trade-offs

- **[Risk] Large pending lists flood WhatsApp** → Mitigation: hard cap (e.g. 20 asks/slot) + log skip remainder; document in API
- **[Risk] Latest snapshot is wrong/outdated obra** → Mitigation: log `sourceId` on each checklist row; Staff can re-upload
- **[Risk] Catalog + tasks interleaved incorrectly** → Mitigation: finish catalog sequence for the contact in-slot before task asks (or: tasks only after catalog step 1 open is answered — prefer **catalog sequence exhaust or all catalog steps complete/awaiting before starting tasks** wait: currently catalog is one open at a time. So: while a catalog step awaits reply, do not start tasks. After catalog has no open step (all complete for slot OR no catalog items), start tasks.
- **[Risk] fromMe / same Evolution phone** → Already documented; checklist inherits same limitation
- **[Risk] Parsing free-text replies into %** → Non-goal: store raw `replyBody`; humans interpret

## Migration Plan

1. Deploy schema + read APIs (no behavior change until flag/scheduler branch)
2. Enable scheduler path generating task asks
3. Rollback: stop creating task asks (feature flag or revert); checklist rows remain harmless history

## Open Questions

- None blocking for v1 (decisions above locked with user). Cap of 20 asks/slot is an implementation default until operators ask otherwise.

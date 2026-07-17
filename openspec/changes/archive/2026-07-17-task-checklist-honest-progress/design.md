## Context

`sendNextTaskChecklistAsk` loads in-window pending objective tasks (`effective avance < 100`), skips taskIds already answered in the slot (`doneIds`), then labels the next ask as:

```
step  = nextIndex + 1
total = tasks.length
```

`nextIndex` is the index in the **current** pending array. After a “100%” reply, that task leaves `tasks`, so the next pending item sits at index `0` again and the title becomes `1/(N-1)` (e.g. `1/5` → `1/4` → `1/3`). Jefes read that as a broken or shrinking questionnaire, not as “tasks finished early.”

Ask selection and adelanto-after-checklist stay unchanged; only title arithmetic changes.

## Goals / Non-Goals

**Goals:**
- Title `Tarea step/total` reflects how many asks the contact has answered in this slot and how many remain to ask.
- After a 100% reply, the next title advances (e.g. `2/5`), not resets to `1/(N-1)`.
- Partial replies keep the same total while advancing step.

**Non-Goals:**
- Changing which tasks are eligible (date window, live 100% skip, cap).
- Persisting a frozen total on the contact/slot document.
- Frontend or catalog-step `step/total` titles.
- Changing adelanto catch-up copy or ordering.

## Decisions

### 1. Chat-progress formula (no frozen snapshot)

- **Choice:** When sending the next ask:

  ```
  answered  = |doneIds|   // unique taskIds with replied outbound asks this slot
  remaining = |tasks.filter(t => !doneIds.has(t.taskId))|
  total     = answered + remaining
  step      = answered + 1
  ```

- **Why:** Matches “questions in this chat.” Completing a task at 100% increments `answered` and drops it from `remaining`, so `total` stays stable across those replies. If an unasked task later becomes 100% via live progress and is skipped, `remaining` shrinks without inflating `answered` — more honest than freezing the first-ask total.
- **Alt rejected:** Freeze `total` at first outbound of the slot (needs extra state; lies if tasks are skipped mid-slot).
- **Alt rejected:** Keep `nextIndex + 1` / `tasks.length` (current confusing UX).

### 2. Count unique answered taskIds

- **Choice:** Use `doneIds.size` (already built from replied `task_checklist` outbounds), not raw prior row count.
- **Why:** Avoids double-counting if duplicate history rows exist; aligns with skip logic.

### 3. Tests over production telemetry

- **Choice:** Extend `messaging.service.spec.ts` with a multi-ask sequence that replies 100%, then 100%, then partial, asserting titles `1/5`, `2/5`, `3/5`, …
- **Why:** Regression is purely labeling; unit coverage is enough.

## Risks / Trade-offs

- **[Risk] Mid-slot skip of an unasked task (live 100%) shrinks `total`** → Acceptable; jefe will not be asked that question. Document in spec scenario.
- **[Risk] Prior slot answers leak into `doneIds`** → Existing query already scopes by `slotKey`; no change.
- **[Trade-off] `total` is not a promise at message 1 of the exact final count if eligibility changes mid-chat** → Prefer accuracy of remaining asks over a frozen lie.

## Migration Plan

- Deploy Core only; no data migration.
- Rollback: revert the `step`/`total` assignment; titles return to pending-list indexing.

## Open Questions

- None — product chose chat-progress over frozen-at-start.

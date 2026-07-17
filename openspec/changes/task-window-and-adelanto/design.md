## Context

Core already sequences catalog WhatsApps then pending objective-task checklist asks (`source: 'task_checklist'`), one open ask at a time per `slotKey`. Pending extraction uses effective avance &lt; 100 and `DEFAULT_CAP = 20`, ignoring snapshot `ini`/`fin`. Frontend Mensajes del equipo authors catalog bodies via presets; sibling change `staff-adelanto-catchup` adds an adelanto preset.

## Goals / Non-Goals

**Goals:**
- Ask only incomplete objective tasks whose planned `[ini, fin]` includes “today” in the account notification timezone
- After those asks finish for the slot (or none exist), send one adelanto catch-up ask when enabled
- Persist adelanto outbound/inbound for history and progress parsing hooks
- Reduce flood vs the hard “always 20” behavior

**Non-Goals:**
- Editing snapshot `ini`/`fin` from the app
- Auto-matching adelanto free-text replies to a specific future task id (v1 stores raw reply; OpenAI parse may still set notes/%)
- Asking `tareas_contexto`
- Per-task override toggles in UI beyond catalog assignment/enable

## Decisions

### 1. In-window rule
- **Choice:** Calendar date `today` (YYYY-MM-DD in `emailNotificationSchedule.timezone`, else account/default TZ) is in window when `ini` and `fin` parse as dates and `ini ≤ today ≤ fin` (inclusive).
- **Missing/invalid `ini` or `fin`:** treat as **out of window** (do not auto-ask as checklist).
- **Why:** Matches “si entra en rango envía; si está afuera no”. Avoids undated noise.
- **Alt rejected:** `ini ≤ today` only (includes all started overdue forever) — user asked for range.

### 2. Cap
- **Choice:** Keep a safety `DEFAULT_CAP` (raise to 50 or keep 20) applied **after** window filter. Primary selector is the date window.
- **Why:** Still protects Evolution/WhatsApp if a day has many overlapping tasks.

### 3. Adelanto send timing
- **Choice:** When `sendNextTaskChecklistAsk` finds no remaining in-window unanswered tasks for the slot, call `sendAdelantoCatchupIfNeeded` once per contact/slot if:
  - adelanto is enabled for the account (or a catalog row tagged/preset `adelanto` is assigned to that contact), and
  - no adelanto outbound already exists for this `slotKey`+contact.
- **Order:** catalog → in-window tasks → adelanto (last).
- **Why:** “al final de todo” as obra adelanto registro.

### 4. Adelanto identity
- **Choice:** StaffMessage `source: 'obra_adelanto'` (or `task_checklist_adelanto`), no `taskId` (or sentinel). Body from account setting `adelantoCatchupBody` / locale default, overridable by assigned catalog message with tag/preset key `adelanto` when present.
- **Why:** Distinct from per-task asks; frontend can generate catalog copy; Core can still auto-append without requiring sortOrder last if using dedicated path.
- **Locked for v1:** Prefer **dedicated post-checklist send** using configurable text (account field or first assigned active catalog message with `templateKey`/`tags` including `adelanto`). Do not rely on catalog sortOrder alone (catalog still runs before tasks).

### 5. Enable flag
- **Choice:** Account setting `adelantoCatchupEnabled` (default `true` once body exists / default copy). Frontend toggle optional in settings or implied by creating/assigning adelanto catalog preset.
- **Why:** Operators can disable without code change.

### 6. Empty in-window set
- **Choice:** If catalog complete and zero in-window pending tasks, still send adelanto when enabled (covers “only adelantos today”).
- **Why:** July working on August tasks is exactly the adelanto case.

## Risks / Trade-offs

- **[Risk] Bad/missing snapshot dates → no checklist asks** → Mitigation: log skip counts; dashboard still shows all tasks; adelanto still runs.
- **[Risk] Timezone mismatches** → Mitigation: reuse schedule timezone already used for slots.
- **[Risk] Adelanto duplicates if both catalog last item and auto-send** → Mitigation: dedicated source + once-per-slot guard; catalog rows tagged adelanto are used as **copy source only**, not sent during catalog sequence (strip from catalog auto-send OR tag excluded from catalog dispatcher). **Locked:** adelanto-tagged catalog messages are **excluded from normal catalog sequential send** and only used as body for the post-checklist adelanto ask.

## Migration Plan

1. Ship date filter + tests (behavior change: fewer asks).
2. Ship adelanto send + account/catalog body resolution.
3. Frontend preset + help copy (sibling change).
4. Rollback: feature flag or revert filter to prior extract; adelanto rows remain history.

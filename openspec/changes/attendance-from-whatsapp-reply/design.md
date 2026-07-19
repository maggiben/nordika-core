## Context

Catalog attendance drafts list each org-chart report with Día completo / Media jornada / Faltó. Inbound replies already match the open catalog outbound. Progress AI currently runs on all catalog replies and is the wrong extractor for attendance.

## Goals / Non-Goals

**Goals:**

- Detect attendance catalog via tag `attendance` (fallback: title/body heuristics).
- Deterministic parse of reply text against `orgReports` names + status keywords (es/en).
- Upsert marks for the reply’s calendar date (account TZ when available, else UTC date).
- Leave other days/months untouched.

**Non-Goals:**

- LLM attendance parse (v1 rules-first).
- Mapping “justificada” from WhatsApp (not in the template yet).
- Frontend UI for parse confidence.

## Decisions

1. **Tag `attendance`** — mirrors `adelanto`.
2. **Rules parser** — match report names (case-insensitive) near status phrases; numbered lists supported.
3. **Date = reply day** — matches “asistencia de hoy” copy.
4. **Skip progress parse** when attendance ingest applies.

## Risks / Trade-offs

- **[Risk] Ambiguous free-text** → Partial marks only for confidently matched people; operators can edit the planilla.
- **[Risk] Untagged legacy messages** → Heuristic on title/body containing asistencia/attendance.

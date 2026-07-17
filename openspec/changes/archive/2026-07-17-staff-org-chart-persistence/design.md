## Context

Frontend org charts live in browser storage. Contacts already have `projectIds` for multi-obra membership, but update always **merges**, so a Staff UI cannot remove an obra. There is no Core field for operario/jornalero reports under a jefe.

## Goals / Non-Goals

**Goals:**
- Persist direct-report org charts on `WhatsAppContact` in MongoDB.
- Roster/contact JSON includes those reports for authenticated clients.
- When PATCH sends `projectIds` as an array, replace membership (including empty = clear); keep singular `projectId` as add/merge.

**Non-Goals:**
- Frontend editor UI.
- Nested management trees.
- Migrating browser localStorage into Mongo automatically.

## Decisions

### 1. Embed `orgReports` on WhatsAppContact
- **Choice:** `orgReports: { id, name, role: 'operario'|'jornalero'|'otro', roleOther?: string }[]` on the contact schema (default `[]`).
- **Why:** Same lifecycle as the lead; simple PATCH; no join queries.
- **Alt rejected:** Separate collection keyed by contactId — unnecessary indirection for v1.

### 2. DTO validation
- **Choice:** Optional `orgReports` on create/update; max reasonable size (e.g. 100); role enum; `roleOther` only meaningful for `otro`.
- **Why:** Matches frontend types already used in local storage.

### 3. Replace vs merge for projects (fix intended multi-project design)
- **Choice:** If `dto.projectIds !== undefined`, set membership to the normalized unique list (replace). If only `dto.projectId` is set, merge that id into existing membership. Do not clear when neither field is present.
- **Why:** multi-project-contacts design already said “full replace unless PATCH sends explicit `projectIds`”; implementation only merged. Editor multi-select needs replace.
- **Alt rejected:** New `replaceProjectIds` flag — extra API knobs when array presence is enough.

### 4. Roster projection
- **Choice:** Include `orgReports` (and existing `projectIds`) on roster rows so the frontend can count team size without N+1 GETs.
- **Why:** Staff grid already loads roster once.

## Risks / Trade-offs

- **[Risk] Clients that sent `projectIds` expecting merge** → Document breaking change; frontend create path uses singular `projectId` only. Audit other callers.
- **[Risk] Large report lists** → Cap array size in DTO; org charts stay small in practice.
- **[Risk] Invalid roleOther** → Strip or ignore when role ≠ `otro`.

## Migration Plan

1. Deploy schema with `orgReports` default `[]` (backward compatible reads).
2. Deploy replace semantics for `projectIds` with tests; release notes for API clients.
3. Frontend ships editor against the new contract.
4. Rollback: revert service write rules; `orgReports` field can remain unused.

## Open Questions

- None blocking; optional later endpoint to import a chart blob is out of scope.

## Context

After active-project isolation, each contact has optional `projectId`. Real crews reuse jefes across obras. Overwriting membership breaks scheduling for the obra that was removed.

## Goals / Non-Goals

**Goals:**
- A contact can list multiple `projectIds`
- Dispatch includes the contact when the active project is in that list
- Legacy `projectId` field is merged into `projectIds` transparently

**Non-Goals:**
- Multiple simultaneous active projects on an account
- Separate WhatsApp sequences per project on the same phone in one slot (one catalog sequence per contact remains)
- Building a full Staff multi-select UI in this change (minimal: merge on create + show list)

## Decisions

### 1. Store `projectIds: string[]` on WhatsAppContact
- Unique, trimmed strings; empty array means unscoped/legacy until stamp
- Keep obsolete singular `projectId` readable: on load, if `projectIds` empty and `projectId` set, treat as `[projectId]`
- Writes prefer `$addToSet` / merge helpers rather than full replace unless PATCH sends explicit `projectIds`

### 2. Dispatch match = set intersection
- `ensureContactInActiveProjects`: true if any contact project is in the allowed active set
- Legacy empty membership: still auto-stamp the sole active project (migration behaviour unchanged)

### 3. Task checklist source
- Ask body still comes from the **active** project’s source
- Contact must include that active project among `projectIds` to receive asks
- Title and body MUST include the obra display name from snapshot `meta.projectNombre` (fallback: `projectId`) so multi-obra jefes are not confused

### 4. StaffMessage.projectId
- Remains a single string: the obra of that outbound (active project at send time)

### 5. API compatibility
- Create/Update DTOs accept `projectIds?: string[]` and/or `projectId?: string` (adds one)
- Roster returns `projectIds: string[]` and `projectId: string | null` (first for older UIs)

## Risks / Trade-offs

- **[Risk] One phone, two obras, one catalog sequence** → Accepted for v1; sequence is per contact not per project
- **[Risk] Accidental mix of task asks** → Mitigated because tasks always resolve from active project source only

## Migration Plan

1. Deploy schema allowing `projectIds`
2. On touch (list/create/update/dispatch), normalize singular → array
3. Frontend posts `projectId` of selected obra; Core merges into `projectIds`

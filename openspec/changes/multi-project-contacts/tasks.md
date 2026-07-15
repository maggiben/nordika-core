## 1. Schema + API

- [x] 1.1 Add `projectIds: string[]` on WhatsAppContact; normalize legacy `projectId`
- [x] 1.2 Create/Update DTOs accept `projectIds` and/or `projectId` (merge)
- [x] 1.3 Roster returns `projectIds` + compatibility `projectId`

## 2. Dispatch

- [x] 2.1 `ensureContactInActiveProjects` matches any membership ∩ active set
- [x] 2.2 Legacy stamp adds to `projectIds` (not only singular field)
- [x] 2.3 Task checklist requires active project ∈ contact membership
- [x] 2.4 Task checklist title/body include `meta.projectNombre` (fallback `projectId`)

## 3. Frontend

- [x] 3.1 Staff create merges selected project; roster displays `projectIds`

## 4. Validation

- [x] 4.1 Core tests for multi-project match / non-match
- [x] 4.2 Re-validate OpenSpec + update checklist tests for obra name in asks

## 1. Schema and DTOs

- [x] 1.1 Add `orgReports` to `WhatsAppContact` schema (default `[]`) with id/name/role/roleOther shape
- [x] 1.2 Extend create/update contact DTOs with validated optional `orgReports` (role enum, size cap)
- [x] 1.3 Map `orgReports` on roster rows and contact responses

## 2. Write semantics

- [x] 2.1 On update/create, replace `orgReports` when the field is present
- [x] 2.2 When PATCH includes `projectIds` (array present), replace membership (empty clears); keep singular `projectId` as merge-only
- [x] 2.3 Normalize legacy singular `projectId` reads unchanged

## 3. Tests and validation

- [x] 3.1 Service/controller tests: persist org reports, roster includes them, replace vs merge project membership
- [x] 3.2 Run unit tests, lint/format, and `openspec validate` for this change

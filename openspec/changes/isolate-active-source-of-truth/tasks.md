## 1. Source + active project

- [x] 1.1 Add `projectId` to SourceOfTruth schema; stamp from `content.meta.projectId` on upload
- [x] 1.2 Add account `activeProjectId` (settings GET/PATCH) with validation
- [x] 1.3 Replace “latest global source” with `resolveSourceForActiveProject(account)`

## 2. Contact / message scoping

- [x] 2.1 Add `projectId` on WhatsAppContact; require it for catalog assign used in dispatch
- [x] 2.2 Stamp `projectId` on task_checklist StaffMessage outbounds/inbounds
- [x] 2.3 Filter scheduler catalog + task kickoff to active project contacts only

## 3. Frontend sync

- [x] 3.1 BFF: activate project endpoint proxy to Core
- [x] 3.2 Navbar selector + successful upload call activate with selected `projectId`
- [x] 3.3 Staff UI: set/show contact `projectId` (minimal: default to active on create/assign)

## 4. Tests + validation

- [x] 4.1 Core tests: active project isolation; other project upload ignored; contact filter
- [x] 4.2 Frontend tests for activate BFF + selector hook
- [x] 4.3 `npm run test:cov` / frontend checks + `npx openspec validate isolate-active-source-of-truth`

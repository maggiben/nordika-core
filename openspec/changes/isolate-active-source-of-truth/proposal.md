## Why

Task checklist and schedule messaging currently read the **latest** `SourceOfTruth` globally and send to shared catalog contacts. Uploading or selecting another obra mixes tasks and WhatsApp traffic across projects. Jefes must never get asks from multiple obras; the navbar project selector should pick the **one active** source that drives messaging.

## What Changes

- Treat each uploaded snapshot as an isolated obra keyed by `projectId` (from snapshot `meta.projectId`)
- Exactly **one active source of truth** at a time in Core; navbar project selection syncs that active project to Core
- Scheduled catalog + task checklist WhatsApp SHALL only use the **active** source’s tasks and the contacts/catalog scoped to that project
- StaffMessage rows for task asks already carry `sourceId`; extend scoping so history and dispatch never cross projects
- **No** mixing: listing/messaging APIs for a project SHALL NOT return other projects’ messages or tasks
- Physical Mongo “one collection per project” is **not** required; isolation is by `projectId` / `sourceId` filters (same collections, hard partition)

## Capabilities

### New Capabilities
- `active-source-scope`: Exactly one active source/project drives WhatsApp task + catalog dispatch; switching the navbar selection updates Core’s active project

### Modified Capabilities
- `source-of-truth`: Store `projectId` on upload; support activate/list by project; reject ambiguous multi-active state
- `task-checklist`: Load pending tasks only from the **active** source (not “latest by createdAt”)
- `whatsapp-status-messaging`: Catalog/task dispatch and contact assignment scoped to the active project

## Impact

- Core: `sources` schema/API, messaging schedule + task checklist loader, contact/catalog optional `projectId`
- Frontend: navbar `selectStoredProject` / upload flow calls Core to set active project (BFF)
- Existing StaffMessage history remains; new asks tagged with active `sourceId`/`projectId`
- Migration: backfill `projectId` from snapshot `content.meta.projectId` where possible; mark newest as active once

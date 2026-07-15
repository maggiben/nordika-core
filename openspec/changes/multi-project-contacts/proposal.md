## Why

Some jefes de obra work on more than one Nodika project at the same time. Contacts today store a single `projectId`, so assigning a second obra overwrites the first and they stop receiving WhatsApp for the obra that was dropped. We need membership in multiple obras while keeping active-project isolation.

## What Changes

- Store contact obras as `projectIds: string[]` (plural)
- Keep accepting legacy single `projectId` on create/update (merge into the list)
- Scheduled catalog / task checklist: send when **any** of the contact’s `projectIds` matches the account’s active obra
- Task-checklist WhatsApp asks include the obra display name (`meta.projectNombre`) so multi-obra jefes know which site the ask is about
- Roster exposes `projectIds` (and a compatibility `projectId` = first entry when present)
- Migrate existing single `projectId` values into `projectIds` on read/write
- Frontend Staff: adding a contact with the navbar selection **adds** the active obra to the list instead of replacing

## Capabilities

### New Capabilities

- `contact-project-membership`: a WhatsApp contact can belong to zero or more Nodika project ids

### Modified Capabilities

- `whatsapp-status-messaging`: catalog dispatch membership check uses multi-project contact lists

## Impact

- Core: `WhatsAppContact` schema/DTOs, messaging dispatch helpers, roster shape, tests
- Frontend BFF consumers: staff roster/create
- StaffMessage `projectId` remains the single obra of the **message** (active when sent), not the full membership list

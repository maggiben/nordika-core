## 1. Data model and source read

- [x] 1.1 Store task asks/answers on `StaffMessage` (`taskId`, `taskLabel`, `sourceId`, `slotKey`, `source: task_checklist`) — no separate TaskChecklist collection
- [x] 1.2 Register source-of-truth model for messaging reads and wire list DTO from StaffMessage
- [x] 1.3 Add helper to load latest `SourceOfTruth` and extract pending `tareas_con_objetivo` (`avance_base` missing or `< 100`), capped (e.g. 20)

## 2. Ask / advance lifecycle

- [x] 2.1 Implement `sendNextTaskChecklistAsk(contact, slotKey)` creating outbound StaffMessage + Evolution send
- [x] 2.2 After catalog sequence has no open step in-slot, start or continue task asks for each contact with assigned catalog messages
- [x] 2.3 On meaningful inbound reply to a task ask, persist inbound StaffMessage and immediately send the next pending task ask
- [x] 2.4 Ignore ack-like / empty inbounds for task advancement (reuse catalog meaning filters)

## 3. Scheduler integration

- [x] 3.1 Hook task-checklist kickoff into `runScheduledNotifications` after catalog sync/send for the claimed slot
- [x] 3.2 Ensure task asks do not start while an in-slot catalog step still awaits reply
- [x] 3.3 Skip quietly when no source or no pending tasks

## 4. HTTP API

- [x] 4.1 Add `GET /messaging/task-checklist` (`message_admin`) with optional `contactId` / `slotKey` filters, newest first (from StaffMessage)

## 5. Tests and validation

- [x] 5.1 Unit tests: pending filter, catalog-then-tasks ordering, reply advances to next task, ack does not advance, StaffMessage persistence
- [x] 5.2 Unit/controller tests for list endpoint auth + filters
- [x] 5.3 Run `npm run test:cov` (branch ≥ 80%) and `npx openspec validate scheduled-task-checklist`

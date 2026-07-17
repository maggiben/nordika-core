## REMOVED Requirements

### Requirement: Ciclo window
**Reason**: Ciclo documents were never created by snapshot upload or the frontend; obra date ranges already live in `SourceOfTruth` meta. Weekly catalog / task-checklist scheduling replaced ciclo-window dispatch.
**Migration**: Use snapshot `meta.ciclo_inicio` / `meta.ciclo_fin` for obra display. Scheduled WhatsApp follows account `emailNotificationSchedule` and catalog / task-checklist flows.

### Requirement: Weekly work status
**Reason**: Per-ciclo `WorkStatus` upserts and skip-on-missing-status dispatch are unused; progress now comes from inbound `StaffMessage.parsedProgress` and snapshot tasks.
**Migration**: Stop calling `POST /messaging/work-status`. Read progress via existing messaging progress / snapshot APIs.

## ADDED Requirements

### Requirement: No ciclo campaign persistence
The service MUST NOT register Mongoose models or Mongo collections for `Ciclo`, `WorkStatus`, or `MessageDispatch`, and MUST NOT expose HTTP routes under `/messaging/ciclos`, `/messaging/work-status`, `/messaging/dispatches`, or `POST /messaging/dispatch/run`.

#### Scenario: Ciclo routes absent
- **WHEN** a client calls `GET /messaging/ciclos` or `POST /messaging/dispatch/run`
- **THEN** the service does not serve those handlers (HTTP 404)

#### Scenario: Scheduler without ciclo dispatch
- **GIVEN** an account schedule slot is claimed
- **WHEN** the minute notification job runs
- **THEN** the service does not query or send based on Ciclo / WorkStatus / MessageDispatch documents
- **AND** catalog and task-checklist WhatsApp paths remain available when Evolution is configured

## MODIFIED Requirements

### Requirement: Evolution send adapter
When `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, and `EVOLUTION_INSTANCE` are set,
catalog, remind, test-send, and task-checklist sends SHALL use Evolution
(`sendButtons` when buttons exist, otherwise `sendText`). When unset, those
manual send endpoints SHALL return HTTP 503.

#### Scenario: Manual send without Evolution
- **GIVEN** Evolution env vars are omitted
- **WHEN** a client calls a WhatsApp send endpoint that requires Evolution (for example `POST /messaging/test-send`)
- **THEN** the service responds with HTTP 503

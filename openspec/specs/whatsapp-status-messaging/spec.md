# WhatsApp weekly status messaging

## Purpose

Maintain WhatsApp recipients and interactive message templates, then send
weekly work-status updates while a ciclo is active.

## Requirements

### Requirement: Recipient collection

The service SHALL store WhatsApp recipients in MongoDB with a normalized phone
number (digits only), optional label/tags, and an active flag.

#### Scenario: Create a recipient

- **WHEN** an authenticated `message_admin` posts `POST /messaging/contacts`
- **THEN** the service stores the contact with a digits-only phone number

### Requirement: Interactive template format

Message templates SHALL use format `interactive_v1` with:

- `body.text` supporting placeholders `{{percent}}`, `{{duration}}`,
  `{{avance}}`, `{{week}}`, `{{ciclo_inicio}}`, `{{ciclo_fin}}`,
  `{{ciclo_name}}`, `{{notes}}`
- `body.widgets` limited to `button`, `input`, and `checkbox`

#### Scenario: Create a template

- **WHEN** a client posts a valid `interactive_v1` template to
  `POST /messaging/templates`
- **THEN** the service persists it for later weekly rendering

### Requirement: Ciclo window

A ciclo SHALL define `ciclo_inicio`, `ciclo_fin`, and a `templateKey`. Weekly
dispatch SHALL only run for active ciclos whose current date falls within that
inclusive window.

#### Scenario: Outside the ciclo window

- **GIVEN** today is after `ciclo_fin`
- **WHEN** the weekly dispatcher runs
- **THEN** that ciclo is ignored

### Requirement: Weekly work status

The service SHALL upsert per-ciclo weekly progress via
`POST /messaging/work-status` including at least `percent` and optional
`duration` / `avance`.

#### Scenario: Missing weekly status

- **GIVEN** an active ciclo has no work-status row for the computed week
- **WHEN** dispatch runs
- **THEN** recipients are recorded as `skipped` and no WhatsApp message is sent

### Requirement: Evolution send adapter

When `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, and `EVOLUTION_INSTANCE` are set,
the dispatcher SHALL send rendered templates through Evolution
(`sendButtons` when buttons exist, otherwise `sendText`). When unset, manual
dispatch SHALL return HTTP 503.

#### Scenario: Manual dispatch without Evolution

- **GIVEN** Evolution env vars are omitted
- **WHEN** a client calls `POST /messaging/dispatch/run`
- **THEN** the service responds with HTTP 503

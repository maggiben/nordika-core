## ADDED Requirements

### Requirement: Adelanto catch-up ask after in-window checklist

After catalog messaging for a contact’s notification slot has no further open step and there is no remaining unanswered in-window task-checklist ask for that slot, Core SHALL send at most one obra adelanto catch-up WhatsApp for that contact and slot when adelanto catch-up is enabled.

The adelanto ask SHALL use a distinct StaffMessage source (not a per-task `taskId` checklist ask) and SHALL ask whether the team worked on any other / ahead-of-schedule task, which one, and how much was advanced or worked.

Inbound replies to that ask SHALL be persisted on the same thread for obra adelanto history.

#### Scenario: Adelanto sent after last in-window task reply

- **GIVEN** adelanto catch-up is enabled for the account
- **AND** the contact’s in-window task checklist asks for the slot are all answered
- **AND** no adelanto outbound exists yet for that contact and slot
- **WHEN** Core advances after the last in-window task reply
- **THEN** Core sends one adelanto catch-up WhatsApp and records an outbound StaffMessage

#### Scenario: Adelanto sent when no in-window tasks

- **GIVEN** adelanto catch-up is enabled
- **AND** catalog for the contact/slot has no further open step
- **AND** there are zero in-window pending objective tasks
- **AND** no adelanto outbound exists for that contact and slot
- **WHEN** Core would otherwise finish the task checklist with nothing to ask
- **THEN** Core still sends the adelanto catch-up WhatsApp once

#### Scenario: Adelanto not duplicated in the same slot

- **GIVEN** an adelanto outbound already exists for the contact and slot
- **WHEN** Core evaluates the next checklist/adelanto step
- **THEN** Core does not send another adelanto ask for that slot

### Requirement: Adelanto catalog copy is not a mid-sequence catalog step

Catalog messages reserved for adelanto catch-up copy (tagged or keyed as adelanto) SHALL NOT be sent as part of the normal pre-task catalog sequential send. Their body MAY supply the text for the post-checklist adelanto ask.

#### Scenario: Adelanto-tagged catalog skipped in catalog sequence

- **GIVEN** a contact has an assigned active catalog message tagged/keyed as adelanto and other non-adelanto catalog messages
- **WHEN** Core runs the catalog sequential send for a slot
- **THEN** only non-adelanto catalog messages are sent in that sequence
- **AND** the adelanto body is available for the later catch-up ask

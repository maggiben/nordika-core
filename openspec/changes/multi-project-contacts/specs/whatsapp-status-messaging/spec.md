## MODIFIED Requirements

### Requirement: Catalog and roster contacts can be managed for WhatsApp follow-ups

Staff contacts used for WhatsApp catalog follow-ups SHALL carry project
membership as one or more Nodika project ids. Scheduled catalog sends SHALL
only target contacts whose membership includes the account’s active project id
(when active-project filtering is in effect).

#### Scenario: Multi-obra contact receives catalog for active project

- **GIVEN** an active project `proj_a`
- **AND** a staff contact assigned to catalog messages with membership including
  `proj_a` and `proj_b`
- **WHEN** the scheduled catalog dispatch runs for `proj_a`
- **THEN** the service may send the next catalog step to that contact
- **AND** MUST NOT block the contact solely because it also belongs to `proj_b`

### Requirement: Task checklist asks name the obra

Task-checklist outbound WhatsApp messages SHALL include the obra display name
from the source snapshot (`meta.projectNombre`) in both the interactive title
and the body text. When `projectNombre` is missing, the service MUST fall back
to the Nodika `projectId` so the ask remains attributable to one obra.

#### Scenario: Ask includes obra name

- **GIVEN** an active project whose source has `meta.projectNombre` `"Pier"`
- **AND** a staff contact eligible for the task checklist
- **WHEN** the next pending objective task is asked
- **THEN** the interactive title and body both include `"Pier"`

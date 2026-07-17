# Contact project membership

## Purpose

Allow a WhatsApp contact (jefe de obra) to belong to zero or more Nodika
project ids for dispatch isolation and Staff assignment.

## Requirements

### Requirement: Contacts may belong to multiple projects

A WhatsApp contact SHALL store zero or more Nodika project ids in `projectIds`.
The service MUST treat a legacy singular `projectId` as membership of that one
project when `projectIds` is empty.

#### Scenario: Membership list

- **GIVEN** a contact with `projectIds` `["proj_a", "proj_b"]`
- **WHEN** the roster is listed
- **THEN** the row includes both project ids

#### Scenario: Legacy singular field

- **GIVEN** a contact document that only has `projectId` `proj_a`
- **WHEN** dispatch checks membership for active project `proj_a`
- **THEN** the contact is treated as belonging to `proj_a`

### Requirement: Create/update merges project membership

Creating a contact with `projectId` or `projectIds`, or updating a contact with only singular `projectId`, MUST merge into the existing membership set without dropping unrelated project ids. Updating a contact with the `projectIds` array field present MUST replace membership with that list (see `staff-org-chart` replace requirement).

#### Scenario: Add second project

- **GIVEN** a contact already in `proj_a`
- **WHEN** it is updated with `projectId` `proj_b`
- **THEN** membership becomes `proj_a` and `proj_b`

#### Scenario: Explicit projectIds replaces

- **GIVEN** a contact already in `proj_a` and `proj_b`
- **WHEN** it is updated with `projectIds` `["proj_a"]`
- **THEN** membership becomes only `proj_a`

### Requirement: Active project intersection

Scheduled catalog and task-checklist dispatch SHALL include a contact when the
account’s active project id is present in the contact’s project membership.
Contacts that only belong to other projects MUST be skipped.

#### Scenario: Multi-project jefe matches active obra

- **GIVEN** active project `proj_a`
- **AND** a contact with `projectIds` `["proj_a", "proj_b"]`
- **WHEN** a notification slot is claimed
- **THEN** that contact is eligible for catalog / task-checklist sends for `proj_a`

#### Scenario: Multi-project jefe outside active obra

- **GIVEN** active project `proj_a`
- **AND** a contact with `projectIds` `["proj_b", "proj_c"]`
- **WHEN** a notification slot is claimed
- **THEN** that contact is not messaged for this slot’s active-project dispatch

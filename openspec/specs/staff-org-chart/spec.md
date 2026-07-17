# Staff org chart

## Purpose

Persist each WhatsApp contact’s direct-report org chart (`orgReports`) in MongoDB
and expose it on roster/contact APIs for the Staff frontend.

## Requirements

### Requirement: Contact org chart reports

A WhatsApp contact SHALL store zero or more direct-report entries in `orgReports`. Each entry MUST include a stable `id`, a non-empty `name`, and a `role` of `operario`, `jornalero`, or `otro`. When `role` is `otro`, an optional `roleOther` label MAY be stored.

#### Scenario: Persist reports on update

- **WHEN** an authenticated client PATCHes a contact with a valid `orgReports` array
- **THEN** Core SHALL replace that contact’s `orgReports` with the validated list
- **AND** subsequent GET contact / roster responses SHALL include those reports

#### Scenario: Empty reports

- **WHEN** a contact is created or updated with `orgReports` as an empty array
- **THEN** Core SHALL store an empty list
- **AND** roster team size consumers SHALL observe zero reports

#### Scenario: Roster includes org reports

- **WHEN** the roster is listed
- **THEN** each row SHALL include `orgReports` for that contact (empty array when none)

### Requirement: Replace project membership when projectIds is sent

Updating a contact with the `projectIds` array field present MUST replace the contact’s project membership with the normalized unique list (including the empty list). Updating with only singular `projectId` MUST merge that id into the existing membership without dropping other ids.

#### Scenario: Replace membership from editor

- **GIVEN** a contact with `projectIds` `["proj_a", "proj_b"]`
- **WHEN** it is updated with `projectIds` `["proj_c"]`
- **THEN** membership becomes only `proj_c`

#### Scenario: Clear membership

- **GIVEN** a contact with `projectIds` `["proj_a"]`
- **WHEN** it is updated with `projectIds` `[]`
- **THEN** membership is empty

#### Scenario: Singular projectId still merges

- **GIVEN** a contact already in `proj_a`
- **WHEN** it is updated with only `projectId` `proj_b` (no `projectIds` field)
- **THEN** membership becomes `proj_a` and `proj_b`

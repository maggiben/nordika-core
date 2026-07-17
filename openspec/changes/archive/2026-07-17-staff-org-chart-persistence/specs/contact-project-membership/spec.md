## MODIFIED Requirements

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

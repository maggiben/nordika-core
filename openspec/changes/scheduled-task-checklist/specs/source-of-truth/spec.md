## ADDED Requirements

### Requirement: Latest source readable for messaging

The service SHALL allow the messaging domain to read the most recently created
`SourceOfTruth` document for deriving pending `tareas_con_objetivo` tasks.
Reads MUST NOT alter stored source documents.

#### Scenario: Messaging loads latest upload

- **GIVEN** multiple source uploads exist
- **WHEN** messaging resolves pending objective tasks
- **THEN** it uses the source with the greatest `createdAt`
- **AND** the chosen source content remains unchanged

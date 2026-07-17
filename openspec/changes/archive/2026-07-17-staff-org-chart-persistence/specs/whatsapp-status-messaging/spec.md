## ADDED Requirements

### Requirement: Roster exposes org chart reports

The messaging roster response SHALL include each contact’s `orgReports` array alongside existing membership fields so clients can show team size without additional round trips.

#### Scenario: Roster row carries reports

- **WHEN** a contact has two org reports stored
- **AND** the roster is listed
- **THEN** that row’s `orgReports` length is 2

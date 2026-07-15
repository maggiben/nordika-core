# Delta for Core API

## ADDED Requirements

### Requirement: Enforced test coverage

The project MUST enforce at least 80% global statements, branches, functions,
and lines coverage when the coverage test suite runs.

#### Scenario: Coverage below threshold

- **GIVEN** the test suite reports a coverage metric below 80%
- **WHEN** `pnpm run test:cov` runs
- **THEN** the command fails

#### Scenario: Pre-commit quality check

- **WHEN** a developer creates a commit
- **THEN** the pre-commit hook runs `pnpm run test:cov`

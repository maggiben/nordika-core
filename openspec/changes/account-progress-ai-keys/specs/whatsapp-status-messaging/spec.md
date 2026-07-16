## ADDED Requirements

### Requirement: Progress parse honors account AI settings

When recording structured progress from an inbound WhatsApp reply, the messaging service SHALL resolve the active account’s `progressAi` preferences (provider, model, and API keys) and pass them to the progress parser.

#### Scenario: Parse with account Anthropic settings

- **GIVEN** the obra owner account has `progressAi.provider` `anthropic`, an allowed model, and a stored Anthropic API key
- **WHEN** a matching catalog or task reply arrives
- **THEN** progress parsing SHALL use Anthropic with that account model and key

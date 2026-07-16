## ADDED Requirements

### Requirement: Per-account progress AI keys and model

Authenticated accounts SHALL store progress-parsing preferences including provider, model, and optional OpenAI and Anthropic API keys via `GET/PATCH /account/settings`.

#### Scenario: Persist provider and model

- **WHEN** the client PATCHes `/account/settings` with `{ "progressAi": { "provider": "anthropic", "model": "claude-sonnet-4-5" } }`
- **THEN** the account stores those values
- **AND** subsequent GET responses include the same provider and model

#### Scenario: Store API keys without echoing them

- **WHEN** the client PATCHes with `progressAi.openaiApiKey` and/or `progressAi.anthropicApiKey` set to non-empty strings
- **THEN** the service stores those keys on the account
- **AND** GET `/account/settings` MUST NOT include the raw key values
- **AND** GET SHALL indicate which keys are configured (e.g. `openaiKeyConfigured` / `anthropicKeyConfigured`)

#### Scenario: Clear a stored key

- **WHEN** the client PATCHes with `progressAi.openaiApiKey: null` (or `anthropicApiKey: null`)
- **THEN** the service removes that stored key
- **AND** the corresponding configured flag becomes false

#### Scenario: Omit key leaves existing value

- **WHEN** the client PATCHes `progressAi` without an `openaiApiKey` field
- **THEN** any previously stored OpenAI key remains unchanged

### Requirement: Parse uses account keys with env fallback

Inbound WhatsApp progress parsing SHALL use the account’s selected provider/model and prefer the account API key for that provider, falling back to the process environment key when the account key is absent.

#### Scenario: Account OpenAI key used

- **GIVEN** the account `progressAi.provider` is `openai` and `openaiApiKey` is stored
- **WHEN** a catalog or task reply is parsed
- **THEN** the service SHALL call OpenAI with the account key and configured model

#### Scenario: Env fallback when account key missing

- **GIVEN** the account provider is `openai`, no account OpenAI key is stored, and `OPENAI_API_KEY` is set in the environment
- **WHEN** a reply is parsed
- **THEN** the service SHALL use the environment OpenAI key

#### Scenario: Anthropic account key

- **GIVEN** the account provider is `anthropic` and `anthropicApiKey` is stored
- **WHEN** a reply is parsed
- **THEN** the service SHALL call Anthropic with the account key and configured model

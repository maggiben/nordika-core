## Why

Progress parsing currently uses process-wide `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. Operators need to set provider, model, and their own API keys from account settings so each account can use OpenAI or Anthropic without redeploying env vars.

## What Changes

- Extend account `progressAi` to store optional OpenAI and Anthropic API keys (write-only on read: configured flags / masked hint only).
- Accept key updates on `PATCH /account/settings` alongside existing `provider` + `model`.
- Prefer account keys when parsing WhatsApp progress; fall back to env keys when the account key for the active provider is absent.
- Support clearing a stored key (explicit empty / clear flag).

## Capabilities

### New Capabilities

- `account-progress-ai`: Per-account progress AI provider, model, and API key storage used by inbound parse.

### Modified Capabilities

- `whatsapp-status-messaging`: Progress replies MUST use the active account’s progress AI settings (keys + model) when configured.

## Impact

- Account schema/DTO/service, `ProgressParseService`, messaging reply parse path
- Frontend settings BFF (sibling change `settings-progress-ai-keys`)
- Non-goal: encrypting keys with a separate KMS; store server-side only and never echo full secrets on GET

## Context

`ProgressParseService` builds OpenAI/Anthropic clients from env at construction. Account settings already store `progressAi.provider` + `model`. Operators need per-account API keys set from the frontend settings screen, used when parsing inbound WhatsApp progress replies.

## Goals / Non-Goals

**Goals:**
- Persist optional `openaiApiKey` and `anthropicApiKey` on the account (alongside provider/model).
- GET `/account/settings` returns provider/model plus configured flags (never full secrets).
- PATCH accepts key writes and explicit clears.
- At parse time: use account key for the selected provider when present; else env key; else skip parse.

**Non-Goals:**
- Per-project keys (account-level only)
- KMS / envelope encryption beyond “not returned on GET”
- Changing the progress JSON schema returned by the LLM

## Decisions

1. **Store keys on `progressAi`** — Shape becomes:
   ```ts
   {
     provider: 'openai' | 'anthropic';
     model: string;
     openaiApiKey?: string;      // stored, never returned
     anthropicApiKey?: string;   // stored, never returned
   }
   ```
   GET response adds `openaiKeyConfigured` / `anthropicKeyConfigured` booleans (derived).
   - Alternative: separate collection — rejected; account settings already owns prefs.

2. **PATCH semantics** — Omit key field → leave unchanged. Non-empty string → replace. `null` → unset/clear.
   - Alternative: empty string clears — rejected; empty is the common “don’t change” pattern for password-style fields.

3. **Per-request clients** — Pass resolved apiKey + model into `parseReply` (or build ephemeral OpenAI client / Anthropic fetch headers per call) so account keys work without restarting the process.
   - Alternative: keep ctor-only env clients — rejected; cannot honor per-account keys.

4. **Env fallback** — Account key wins; env is deployment-wide default for accounts that have not pasted a key yet.

## Risks / Trade-offs

- [Secrets in Mongo] → Never return on GET; restrict logs; prefer HTTPS BFF.
- [Wrong provider key] → Parse returns null and logs a warning; messaging still records the raw reply.
- [Model/provider mismatch] → Keep existing allow-list validation.

## Migration Plan

1. Deploy schema/DTO/service changes (keys optional; existing accounts unaffected).
2. Frontend ships settings UI.
3. Operators add keys; env keys remain valid fallback.

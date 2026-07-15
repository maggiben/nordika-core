# External APIs

## Resend

Transactional email for account verification and password reset. Configuration:
`RESEND_API_KEY`, `RESEND_FROM`. Used only from `AuthService`.

## Evolution API (WhatsApp)

Optional WhatsApp gateway for weekly ciclo status messages. Configuration:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`

All three are required together; when omitted, messaging APIs remain available
for CRUD but `POST /messaging/dispatch/run` returns 503 and the weekly cron
logs a skip.

Transport logic lives in `EvolutionClient` (not controllers). Button widgets map
to Evolution `sendButtons`; text-only / input / checkbox prompts use
`sendText` with instructions embedded in the body.

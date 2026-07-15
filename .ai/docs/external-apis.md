# External APIs

## Resend

Transactional email for account verification, password reset, and scheduled
staff follow-up digests. Configuration: `RESEND_API_KEY`, `RESEND_FROM`.
Optional `RESEND_TO` adds a CC when it is a valid email address.

## Evolution API (WhatsApp)

Optional WhatsApp gateway for weekly ciclo status messages. Configuration:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`

All three are required together; when omitted, messaging APIs remain available
for CRUD but `POST /messaging/dispatch/run` returns 503 and the scheduled job
skips WhatsApp delivery.

Transport logic lives in `EvolutionClient` (not controllers). Button widgets map
to Evolution `sendButtons`; text-only / input / checkbox prompts use
`sendText` with instructions embedded in the body.

Scheduled delivery (email digests + WhatsApp weekly) is driven by each account's
`emailNotificationSchedule` via a minute poller. `WHATSAPP_WEEKLY_CRON` and
`WHATSAPP_TIMEZONE` are deprecated and ignored.

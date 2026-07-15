# Deployment and Environment

## Runtime
`src/main.ts` listens on `process.env.PORT ?? 3000`.

- `PORT` is optional and defaults to `3000`.
- `PORT`, when configured, must be an integer from `1` through `65535`.
- `MONGO_URL` is the Railway MongoDB connection URL.
- `MONGO_URI` is an optional override that takes precedence over `MONGO_URL`.
- `REDIS_URL` is optional. It must use `redis://` or `rediss://`; caching is
  disabled when it is absent.
- `JWT_SECRET` is the required shared HS256 secret used to issue and verify
  15-minute access tokens. Configure a strong value in the deployment secret
  store.
- `APP_URL` is the BFF's public URL used for verification and reset links.
- `RESEND_API_KEY` and `RESEND_FROM` are required to deliver verification and
  password-reset email. `RESEND_FROM` must be a Resend-verified sender.
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, and `EVOLUTION_INSTANCE` are optional
  as a group. When set, weekly WhatsApp status dispatch can send through
  Evolution. `WHATSAPP_WEEKLY_CRON` (default `0 9 * * 1`) and
  `WHATSAPP_TIMEZONE` (default `America/Argentina/Buenos_Aires`) control the
  scheduler.

`MongoModule` activates Mongoose only when one of the MongoDB URL variables is configured. The value must begin with `mongodb://` or `mongodb+srv://`; the application does not log the URL. Authentication requires MongoDB plus non-empty `JWT_SECRET`, `APP_URL`, `RESEND_API_KEY`, and `RESEND_FROM`. Messaging routes register only when MongoDB is configured; WhatsApp sending additionally requires the Evolution variables. Configure these values in a secure secret store, never in committed `.env` files.

For local development, copy `.env.example` to an untracked `.env` file and
replace every placeholder with local values.

## Rate limiting

The API limits each client IP address to 60 requests per 60-second window.
`POST /sources` has a stricter limit of 10 requests per 60-second window.
The default in-memory store applies these limits per application process; use a
shared throttling store before horizontally scaling the service.

## Build and start
- `pnpm run build` produces `dist/` via `nest build`.
- `pnpm run start` and `pnpm run start:prod` run `node dist/main`; Railpack can safely use its detected `start` command.

## Not configured
The repository has no Dockerfile, Compose configuration, cloud manifest, CI pipeline, environment example, readiness/liveness endpoint, logging policy, or deployment-specific process configuration. The README deployment section is Nest starter text and is not evidence of an adopted platform.

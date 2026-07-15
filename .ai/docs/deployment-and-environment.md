# Deployment and Environment

## Runtime
`src/main.ts` listens on `process.env.PORT ?? 3000`.

- `PORT` is optional and defaults to `3000`.
- `MONGO_URL` is the Railway MongoDB connection URL.
- `MONGO_URI` is an optional override that takes precedence over `MONGO_URL`.

`MongoModule` activates Mongoose only when one of the MongoDB URL variables is configured. The value must begin with `mongodb://` or `mongodb+srv://`; the application does not log the URL. Configure these values in Railway service variables or a secure secret store, never in `.env` files committed to the repository.

## Build and start
- `pnpm run build` produces `dist/` via `nest build`.
- `pnpm run start:prod` runs `node dist/main`.

## Not configured
The repository has no Dockerfile, Compose configuration, cloud manifest, CI pipeline, environment example, readiness/liveness endpoint, logging policy, or deployment-specific process configuration. The README deployment section is Nest starter text and is not evidence of an adopted platform.

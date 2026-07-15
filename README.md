# nodika-core

NestJS BFF / API for Nodika: authentication, account settings, source uploads, and messaging (email digests + WhatsApp via Evolution API).

```text
HTTP (Express) → Nest modules → MongoDB / Redis / Resend / Evolution
```

| Area | Stack |
| --- | --- |
| Runtime | Node.js 20+ (22/24 recommended), NestJS 11, TypeScript |
| Package manager | **pnpm** (lockfile: `pnpm-lock.yaml`) |
| Data | MongoDB (Mongoose), optional Redis cache |
| Email | Resend |
| WhatsApp | Evolution API (optional) |
| Deploy | [Railway](https://railway.com) |

---

## Table of contents

- [Dependencies](#dependencies)
- [Prerequisites](#prerequisites)
- [Run locally](#run-locally)
- [Debug](#debug)
- [Deploy on Railway](#deploy-on-railway)
- [Environment variables](#environment-variables)
- [Scripts reference](#scripts-reference)
- [Project layout](#project-layout)
- [Contributing](#contributing)

---

## Dependencies

### Required to run the app

| Dependency | Purpose | Local tip |
| --- | --- | --- |
| **Node.js** ≥ 20 | Runtime | Use nvm / fnm; team often runs 22–24 |
| **pnpm** | Install & scripts | `corepack enable && corepack prepare pnpm@latest --activate` |
| **MongoDB** | Auth, account, messaging, sources | `mongodb://localhost:27017/nodika` |

Without MongoDB, the HTTP server can still boot, but auth/messaging/sources that need persistence will be unavailable or degraded.

### Required for full auth + email flows

| Dependency | Purpose |
| --- | --- |
| **Resend** API key + verified sender | Verification, password reset, scheduled follow-up emails |
| Strong **JWT_SECRET** | Sign/verify access JWTs |
| Public **APP_URL** | Links in emails and CORS origin for the frontend |

### Optional

| Dependency | Purpose | If omitted |
| --- | --- | --- |
| **Redis** (`REDIS_URL`) | HTTP response caching | Caching disabled |
| **Evolution API** (`EVOLUTION_*`) | WhatsApp dispatch | Messaging CRUD works; send/dispatch returns 503 / skips WhatsApp |

### External docs

- NestJS: https://docs.nestjs.com
- Railway CLI: https://docs.railway.com/guides/cli
- Resend: https://resend.com/docs
- Evolution API: your gateway host’s docs
- Internal notes: [`.ai/docs/`](.ai/docs/) (deployment, external APIs, testing)

---

## Prerequisites

```bash
node -v    # >= 20
pnpm -v    # any recent pnpm 9/10
```

Optional local services:

```bash
# MongoDB (example with Docker)
docker run -d --name nodika-mongo -p 27017:27017 mongo:7

# Redis (example with Docker)
docker run -d --name nodika-redis -p 6379:6379 redis:7
```

---

## Run locally

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and replace placeholders. Minimum useful set:

```bash
PORT=3000
MONGO_URI=mongodb://localhost:27017/nodika
JWT_SECRET=replace-with-a-long-random-secret
APP_URL=http://localhost:3001          # frontend / BFF public URL for CORS + email links
RESEND_API_KEY=re_...
RESEND_FROM=Nodika <auth@example.com>
```

Optional:

```bash
REDIS_URL=redis://localhost:6379
EVOLUTION_API_URL=https://your-evolution-host.example
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=...
WHATSAPP_DEFAULT_LANGUAGE=es
```

Never commit `.env`. Railway injects secrets in production; locally only `.env` / `railway run` should carry them.

### 3. Start

```bash
# watch mode (preferred for development)
pnpm run start:dev

# one-shot compile + run (no watch)
pnpm run start

# production-like: build then run dist/
pnpm run build
pnpm run start:prod
```

Default listen port: `3000` (`PORT` overrides). Sanity check:

```bash
curl http://localhost:3000/
# → Hello World!
```

### Use Railway variables against a local process

If the repo is linked to a Railway project, you can inject remote env vars into a local command:

```bash
railway link                    # once, if not already linked
railway run pnpm run start:dev  # uses Railway variables from the selected service/env
```

Prefer local Mongo/Redis for day-to-day work unless you intentionally need staging data.

---

## Debug

### Nest watch + inspector

```bash
pnpm run start:debug
```

This runs `nest start --debug --watch` and opens the Node inspector (default `9229`). Attach from:

- **VS Code / Cursor**: Run and Debug → “Attach to Node Process”, or add a launch config:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach nodika-core",
      "port": 9229,
      "restart": true,
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "${workspaceFolder}"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Jest current file",
      "program": "${workspaceFolder}/node_modules/jest/bin/jest",
      "args": ["${relativeFile}", "--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

Save as `.vscode/launch.json` if you want one-click attach.

### Debug unit tests

```bash
pnpm run test:debug
```

Then attach to the inspector; Jest waits on `--inspect-brk`.

### Request / validation issues

Global `ValidationPipe` logs failed field messages under the `ValidationPipe` logger. Check the Nest console when endpoints return `400`.

### Railway runtime debugging

```bash
railway logs                 # stream deploy logs
railway logs --build         # build-phase logs
railway logs -n 200          # last N lines
railway ssh                  # shell inside the running container
railway metrics              # CPU / memory / HTTP metrics
```

Common production failures:

| Symptom | Likely cause |
| --- | --- |
| Boot crash: `JWT_SECRET must be configured` | Missing variable on the service |
| Boot crash: auth env error | Missing `APP_URL` / `RESEND_*` |
| Messaging send 503 | Evolution trio incomplete or unreachable |
| `EVOLUTION_API_URL` points at localhost | On Railway use the **private** hostname, e.g. `http://evolution-api.railway.internal:8080` |
| Mongo connection errors | Wrong `MONGO_URL` / network / plugin not linked |

---

## Deploy on Railway

There is no Dockerfile in-repo. Railway builds with [Railpack](https://docs.railway.com) (or Nixpacks), detects Node/pnpm, runs `pnpm install` / `pnpm run build`, and starts with the package `start` / `start:prod` path as detected (`node dist/main` after build is the intended production entry).

### One-time setup

1. Install the [Railway CLI](https://docs.railway.com/guides/cli):

   ```bash
   brew install railway
   # or: npm i -g @railway/cli
   # or: bash <(curl -fsSL railway.com/install.sh)
   ```

2. Log in:

   ```bash
   railway login
   railway whoami
   ```

3. Create or link a project from this repo:

   ```bash
   # new project + first deploy from cwd
   railway up

   # or attach an existing project
   railway link
   ```

4. Provision dependencies in the same Railway project (dashboard or CLI):

   - **MongoDB** plugin/service → wire `MONGO_URL` (or set `MONGO_URI`) on the API service
   - Optional **Redis** → set `REDIS_URL`
   - Optional **Evolution API** sibling service → set the three `EVOLUTION_*` vars using the **private network** URL

5. Set application secrets on the API service (Variables tab or CLI):

   ```bash
   railway variable set JWT_SECRET="$(openssl rand -base64 48)"
   railway variable set APP_URL=https://your-frontend-or-public-api-url
   railway variable set RESEND_API_KEY=re_...
   railway variable set RESEND_FROM="Nodika <auth@your-verified-domain>"
   railway variable set WHATSAPP_DEFAULT_LANGUAGE=es
   ```

   Railway provides `PORT`; the app reads `process.env.PORT` (default `3000` locally).

6. Generate a public domain if needed:

   ```bash
   railway domain
   ```

   Point `APP_URL` at the URL your clients and email links should use (often the frontend URL, not only the API).

### Ongoing deploys

```bash
railway up                   # deploy current directory; streams logs
railway up --detach          # deploy without attaching to logs
railway redeploy             # redeploy latest
railway deployment list      # history
```

GitHub integration (if connected in the dashboard) redeploys on push without a local `railway up`.

### Useful Railway commands

```bash
railway status
railway service              # select service in linked project
railway variable list
railway open                 # open project in browser
railway logs
railway ssh
```

Docs: https://docs.railway.com — full CLI reference: https://docs.railway.com/guides/cli

---

## Environment variables

Canonical example: [`.env.example`](.env.example). Behavior details: [`.ai/docs/deployment-and-environment.md`](.ai/docs/deployment-and-environment.md).

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | No | Default `3000`; Railway injects it |
| `MONGO_URI` / `MONGO_URL` | For persistence | `MONGO_URI` wins if both set; must be `mongodb://` or `mongodb+srv://` |
| `JWT_SECRET` | Yes (auth) | HS256 secret for access tokens |
| `APP_URL` | Yes (auth) | Public URL for email links; also used for CORS |
| `RESEND_API_KEY` | Yes (auth) | Resend API key |
| `RESEND_FROM` | Yes (auth) | Verified sender, e.g. `Nodika <auth@example.com>` |
| `RESEND_TO` | No | Optional CC when valid |
| `REDIS_URL` | No | `redis://` or `rediss://` |
| `EVOLUTION_API_URL` | With other Evolution vars | Absolute `http(s)` URL |
| `EVOLUTION_API_KEY` | With other Evolution vars | |
| `EVOLUTION_INSTANCE` | With other Evolution vars | |
| `EVOLUTION_WEBHOOK_SECRET` | No | Shared secret for Evolution webhook header |
| `WHATSAPP_DEFAULT_LANGUAGE` | No | `es` (default) or `en` |
| `WHATSAPP_WEEKLY_CRON` / `WHATSAPP_TIMEZONE` | — | **Deprecated / ignored**; schedules use each account’s `emailNotificationSchedule` |

Rate limits: 60 requests / 60s per IP by default; `POST /sources` is 10 / 60s.

---

## Scripts reference

| Script | What it does |
| --- | --- |
| `pnpm run start:dev` | Nest watch mode |
| `pnpm run start:debug` | Watch + Node inspector |
| `pnpm run build` | `nest build` → `dist/` |
| `pnpm run start:prod` | `node dist/main` |
| `pnpm run lint` | ESLint with `--fix` |
| `pnpm run lint:check` | ESLint check only (used in pre-commit) |
| `pnpm run format` | Prettier write on `src/` and `test/` |
| `pnpm run test` | Unit tests (Jest, co-located `*.spec.ts`) |
| `pnpm run test:watch` | Jest watch |
| `pnpm run test:cov` | Coverage (global ≥ 80% thresholds) |
| `pnpm run test:e2e` | HTTP e2e under `test/` |
| `pnpm run test:debug` | Jest with `--inspect-brk` |
| `pnpm run spec:list` | OpenSpec change list |
| `pnpm run spec:validate` | Validate OpenSpec (`--all --strict`) |

---

## Project layout

```text
src/
  account/      Account settings (schedules, language, …)
  auth/         JWT auth, cookies, Resend flows
  cache/        Optional Redis HTTP cache
  config/       Environment parsing helpers
  messaging/    WhatsApp / email messaging + scheduler
  mongo/        Conditional Mongoose module
  sources/      JSON source uploads
  i18n/         Catalogs copied into dist
  main.ts       Bootstrap (CORS, cookies, ValidationPipe)
test/           E2E Jest specs
locales/        WhatsApp copy (es/en)
openspec/       Spec-driven proposals / tasks
.ai/            Internal AI/dev conventions and docs
scripts/        Install hooks helpers
```

New domains belong under `src/<domain>/` (module, controller, service, DTOs, specs) and are imported from `AppModule`.

---

## Contributing

### Workflow

1. **Branch** from the team’s default branch (`feat/…`, `fix/…`).
2. **Spec first** for meaningful behavior changes: use OpenSpec under `openspec/` (`pnpm run spec:list` / `pnpm run spec:validate`). Proposal → specs → design → tasks when the change warrants it.
3. **Implement** in Nest style: thin controllers, logic in services, constructor injection, co-located unit tests.
4. **Validate** before opening a PR:

   ```bash
   pnpm run lint:check
   pnpm run test:cov
   pnpm run test:e2e
   pnpm run build
   pnpm run spec:validate   # if you touched openspec/
   ```

5. Open a PR with a short “why”, test notes, and any env/migration impact.

### Pre-commit hooks

Husky runs on commit:

```text
pnpm run lint:check
pnpm run test:cov
```

Fix failures instead of skipping hooks. Do not commit secrets, `.env`, or credentials.

### Conventions

- TypeScript + Nest decorators; `PascalCase` classes; `camelCase` members.
- Prettier: single quotes, trailing commas (`.prettierrc`).
- ESLint: type-aware + Prettier (`eslint.config.mjs`).
- Prefer `src/<domain>/` modules; register in `app.module.ts`.
- Treat all input as untrusted; never log Mongo URLs or secrets.
- Deeper guidance: [`.ai/docs/coding-conventions.md`](.ai/docs/coding-conventions.md), [`.ai/docs/testing-strategy.md`](.ai/docs/testing-strategy.md), [`.ai/constitution.md`](.ai/constitution.md).

### What to test

| Layer | Where | Focus |
| --- | --- | --- |
| Unit | `src/**/*.spec.ts` | Controllers/services with `@nestjs/testing` |
| E2E | `test/*.e2e-spec.ts` | Public HTTP contracts with Supertest |
| Coverage | `pnpm run test:cov` | Global ≥ 80% (schemas/DTOs excluded from collection) |

### Questions / related docs

- Deployment & env: [`.ai/docs/deployment-and-environment.md`](.ai/docs/deployment-and-environment.md)
- External APIs: [`.ai/docs/external-apis.md`](.ai/docs/external-apis.md)
- Folder layout: [`.ai/docs/folder-organization.md`](.ai/docs/folder-organization.md)

---

## License

Private (`UNLICENSED`). Do not publish or redistribute without Nodika authorization.

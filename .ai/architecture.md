# Architecture

`nodika-core` is a single-process, server-only NestJS application.

```text
HTTP request → domain controller → domain service → response
                 registered by AppModule
bootstrap in main.ts → NestFactory.create(AppModule) → PORT or 3000
AppModule → MongoModule → Mongoose connection when MONGO_URI or MONGO_URL exists
```

Current responsibilities:
- `src/main.ts`: bootstraps the Express-backed Nest app and starts listening.
- `src/app.module.ts`: composition root for controller/provider registration.
- `src/app.controller.ts`: owns `GET /`.
- `src/app.service.ts`: returns the greeting business value.
- `src/sources/`: accepts JSON uploads and persists sources of truth through Mongoose.
- `src/mongo/mongo.module.ts`: conditionally registers the Mongoose connection.
- `src/mongo/mongo.config.ts`: resolves `MONGO_URI` or Railway `MONGO_URL` without exposing its value.

Add future features as domain modules registered in `AppModule`, not by expanding the starter classes indefinitely.

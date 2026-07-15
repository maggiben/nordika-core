# Architecture Constraints

- Keep `src/main.ts` limited to process/bootstrap configuration.
- Keep `AppModule` (`src/app.module.ts`) as composition root; add domain modules rather than accumulating unrelated providers in it.
- Controllers translate HTTP; services hold use-case logic. Do not duplicate business logic between them.
- Do not add infrastructure patterns (repository layer, CQRS, events, microservices) until a concrete dependency/workload requires them.
- Preserve the existing `GET /` greeting unless a versioned or explicitly approved contract change replaces it.
- Maintain existing HTTP paths, response bodies, statuses, and environment behavior unless a breaking change is explicitly authorized.
- Keep `PORT` optional with a default of `3000`; version or provide a migration path for published API changes.

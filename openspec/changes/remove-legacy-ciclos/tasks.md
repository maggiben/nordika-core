## 1. Strip ciclo models and HTTP surface

- [ ] 1.1 Remove `Ciclo`, `WorkStatus`, and `MessageDispatch` types/schemas/model constants from `messaging.schema.ts` and unregister them in `messaging.models.ts` / module `forFeature`
- [ ] 1.2 Remove controller routes: `/messaging/ciclos*`, `/messaging/work-status*`, `/messaging/dispatches`, `POST /messaging/dispatch/run` plus related DTOs
- [ ] 1.3 Delete service methods (`createCiclo`, `listCiclos`, `updateCiclo`, `upsertWorkStatus`, `listWorkStatuses`, `listDispatches`, `runWeeklyStatusDispatch`, dispatch recording helpers) and ciclo-only template helpers still only used by that path
- [ ] 1.4 Remove ciclo cache paths / invalidation entries and update Redis docs/comments to match `core-api` delta

## 2. Scheduler and docs

- [ ] 2.1 Stop calling `runWeeklyStatusDispatch` from `runScheduledNotifications`; keep catalog + task-checklist + email paths
- [ ] 2.2 Update README / `.ai` docs that still describe ciclo CRUD or weekly ciclo dispatch as product behavior

## 3. Tests and validation

- [ ] 3.1 Delete or rewrite unit/controller tests that assert ciclo / work-status / dispatch / weekly ciclo dispatch behavior
- [ ] 3.2 Ensure catalog, task-checklist, template, and scheduled-notification tests still pass
- [ ] 3.3 Run `pnpm run build`, `pnpm exec jest --runInBand`, and e2e suite; fix regressions
- [ ] 3.4 Sync main specs from this change (`whatsapp-status-messaging`, `core-api`) and run `openspec validate` / project `spec:validate` if present

## 4. Production cleanup

- [ ] 4.1 After Core deploy, drop empty Mongo collections `ciclos`, `workstatuses`, and `messagedispatches` on the app database

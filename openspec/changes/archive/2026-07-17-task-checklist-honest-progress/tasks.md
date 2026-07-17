## 1. Title progress arithmetic

- [x] 1.1 In `sendNextTaskChecklistAsk`, compute `answered = doneIds.size`, `remaining =` count of pending tasks not in `doneIds`, then `step = answered + 1` and `total = answered + remaining` for the outbound title
- [x] 1.2 Keep ask selection / skip / adelanto behavior unchanged; only title `step`/`total` change

## 2. Tests

- [x] 2.1 Add (or extend) messaging service coverage: after a 100% reply on the first of five pending tasks, the next outbound title is `Tarea 2/5` (not `1/4`)
- [x] 2.2 Cover a mixed sequence (100%, 100%, partial) so titles advance `1/5` → `2/5` → `3/5` with stable total
- [x] 2.3 Run targeted Jest for messaging checklist specs (`pnpm exec jest src/messaging/messaging.service.spec.ts --runInBand`)

## 3. Validation

- [x] 3.1 Run `pnpm run spec:validate` (or `openspec validate --all --strict`) for this change

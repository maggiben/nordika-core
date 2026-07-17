## 1. Date-window pending tasks

- [x] 1.1 Extend pending-objective-task extraction to read `ini`/`fin`, compute today in schedule timezone, and keep only in-window incomplete tasks before applying the safety cap
- [x] 1.2 Unit-test in-window, future, past, and missing-date cases (plus cap-after-filter)

## 2. Adelanto catch-up send

- [x] 2.1 Add StaffMessage source for obra adelanto; resolve enabled flag + body (account default and/or adelanto-tagged catalog copy)
- [x] 2.2 Exclude adelanto-tagged catalog rows from normal catalog sequential send
- [x] 2.3 After in-window checklist exhausts (or is empty) with catalog clear, send at most one adelanto ask per contact/slot and advance on reply without another adelanto
- [x] 2.4 Unit-test sequencing: catalog → in-window tasks → adelanto; no-window-tasks still gets adelanto; no duplicate adelanto

## 3. Validate

- [x] 3.1 Run targeted Jest specs for pending tasks + messaging service; fix regressions
- [x] 3.2 Run openspec validate for this change

# Performance Check

- [ ] A stated workload/symptom justifies performance work.
- [ ] No synchronous CPU-heavy request path was added without measurement.
- [ ] No redundant external/data call is made per request.
- [ ] Response contract avoids unnecessary data/serialization.
- [ ] Functional tests pass after optimization.

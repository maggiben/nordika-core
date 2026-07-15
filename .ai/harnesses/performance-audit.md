# Performance Audit Harness

## Goal
Measure and address performance issues only when the application has a concrete workload or symptom.

## Steps
1. Define endpoint, dataset, concurrency, latency/error target, and environment.
2. Capture a reproducible baseline.
3. Inspect blocking work, repeated computation, serialization, and external I/O.
4. Make one measured improvement at a time.

## Expected output
Baseline evidence, prioritized findings, and benchmarked recommendations or a focused fix.

## Validation
Repeat the same workload; run build and functional tests.

## Rollback strategy
Revert the single optimization if its measurement regresses or behavior changes.

## Checklist
- [ ] No benchmark was invented
- [ ] Correctness stays covered
- [ ] Resource usage is considered
- [ ] Optimization has measured benefit

# Penetration Test Harness

## Goal
Perform an authorized, non-destructive security assessment of Nodika's exposed HTTP behavior.

## Steps
1. Obtain written scope: target environment, permitted routes, test accounts, rate limits, data handling, and stop conditions.
2. Inventory routes, authentication, authorization, input validation, uploads, and integrations from source and running configuration.
3. Exercise safe tests for injection, validation bypass, authorization bypass, information leakage, unsafe redirects, and rate-limit behavior.
4. Capture only the minimum evidence necessary; never exfiltrate data, persist shells, degrade availability, or test outside scope.
5. Reproduce findings with deterministic requests and assign severity based on realistic impact.

## Expected output
A scope record, tested attack classes, evidence, severity, remediation, and retest plan. Report absent controls as configuration gaps, not confirmed exploits.

## Validation
Use a non-production environment with synthetic data. Confirm each finding through an authorized reproduction and add regression tests for remediated vulnerabilities.

## Rollback strategy
Stop immediately at the agreed stop condition. Revert only approved remediation changes; preserve sanitized evidence outside source control.

## Checklist
- [ ] Scope and authorization are documented
- [ ] No destructive or availability-impacting actions occurred
- [ ] Test data and tokens are synthetic
- [ ] Findings are reproducible and sanitized
- [ ] Fixes have automated regression coverage

# Dependency Audit Harness

## Goal
Evaluate direct and transitive dependencies for supply-chain, maintenance, licensing, and runtime risk.

## Steps
1. Inventory dependencies from `package.json` and resolve versions from `pnpm-lock.yaml`.
2. Separate runtime dependencies from development-only tooling.
3. Review newly introduced packages for necessity, NestJS 11 compatibility, maintenance, license, known advisories, and duplicate capability.
4. Inspect lockfile changes for unexpected package expansion.
5. Identify unused packages and distinguish scaffold defaults from active runtime requirements.

## Expected output
An evidence-backed list of findings with package, resolved version, impact, remediation, and validation steps.

## Validation
Run `pnpm audit` when registry access is available, `pnpm run build`, and the relevant tests after dependency changes.

## Rollback strategy
Revert the manifest and corresponding `pnpm-lock.yaml` changes together. Do not hand-edit lockfile resolutions.

## Checklist
- [ ] No package duplicates existing NestJS or Node capability without justification
- [ ] Runtime additions have explicit ownership and removal rationale
- [ ] Lockfile changes match the requested dependency change
- [ ] Advisories are triaged by reachable runtime impact

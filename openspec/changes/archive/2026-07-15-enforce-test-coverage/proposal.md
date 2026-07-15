# Proposal: Enforce test coverage before commits

## Why

The project needs a repeatable quality gate that prevents regressions from
lowering test coverage below an agreed baseline.

## What Changes

- Require at least 80% global statements, branches, functions, and lines.
- Run the coverage suite through a versioned pre-commit hook.
- Add tests for bootstrap, module configuration, Mongo registration, and JWT
  payload validation.

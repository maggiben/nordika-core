# Compatibility Constraints

- Maintain backward compatibility for existing HTTP paths, success bodies, statuses, and environment behavior unless the task explicitly authorizes a breaking change.
- `PORT` remains optional with default `3000` unless deployment requirements change.
- Do not change the default module/import conventions or test commands without updating documentation and validation.
- Version or provide a migration path before changing a published API contract.

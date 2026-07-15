# Folder Organization

```text
nodika/                  # workspace wrapper; no manifest or Git metadata
  nodika-core/           # Git repository and sole application package
  src/       application source and co-located unit specs
  test/      HTTP end-to-end specs and e2e Jest config
  dist/      generated build output (not source)
  .ai/       project-specific AI development framework
```

For a new domain, prefer `src/<domain>/` with module, controller, service, DTOs, and unit specs. Import its module from `src/app.module.ts`.

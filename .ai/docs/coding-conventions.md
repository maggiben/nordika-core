# Coding Conventions

- TypeScript with Nest decorators and constructor injection.
- `PascalCase` classes; `camelCase` methods/fields; conventional Nest file suffixes.
- Prettier uses single quotes and trailing commas (`.prettierrc`).
- ESLint uses type-aware recommended rules plus Prettier (`eslint.config.mjs`).
- Keep controller methods thin and delegate to injected services, as `AppController.getHello()` does.
- Await async behavior; use `void` only for intentional unawaited entrypoints such as the process bootstrap.

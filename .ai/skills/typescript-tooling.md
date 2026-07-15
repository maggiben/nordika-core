# TypeScript and Tooling Skill

## Purpose
Produce code compatible with this repository's TypeScript, ESLint, Prettier, and pnpm configuration.

## Responsibilities
- Preserve strict null checking and decorator metadata support.
- Follow Prettier formatting: single quotes and trailing commas.
- Resolve rather than hide type/lint failures.
- Use the package scripts in `package.json` as the supported validation interface.

## Inputs
Changed TypeScript source, tests, and the relevant npm scripts.

## Outputs
Formatted, type-safe TypeScript that passes the selected build/test/lint checks.

## Best practices
- Use explicit return types for exported controller/service methods when the API contract benefits from them, as `getHello(): string` does.
- Use `import type` where a dependency is type-only.
- Await promises or deliberately use `void` for intentional fire-and-forget work; `@typescript-eslint/no-floating-promises` is enabled as a warning.
- Run `pnpm run build` to type-check production code; ESLint is configured with type-aware rules.

## Common mistakes
- Treating `noImplicitAny: false` or ESLint's currently disabled `no-explicit-any` rule as permission to introduce `any`.
- Relying on `pnpm run lint` as read-only: its script uses `--fix` and may modify files.
- Changing `module`/decorator compiler settings without checking Nest runtime behavior.

## Code example
```ts
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
```

## Related files
- `tsconfig.json`
- `eslint.config.mjs`
- `.prettierrc`
- `package.json`
- `src/main.ts`

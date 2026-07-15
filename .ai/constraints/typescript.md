# TypeScript Constraints

- Do not introduce `any`, even though `noImplicitAny` is false and ESLint currently permits explicit `any`; use DTOs, interfaces, generics, `unknown`, or discriminated unions.
- Do not suppress type errors with casts unless runtime validation establishes the type.
- Await asynchronous work or intentionally prefix fire-and-forget promises with `void`, as in `src/main.ts`.
- Preserve strict null checks, decorators, metadata emission, NodeNext module settings, and ES2023 target unless a compatibility plan is included.
- Match `.prettierrc`: single quotes and trailing commas.

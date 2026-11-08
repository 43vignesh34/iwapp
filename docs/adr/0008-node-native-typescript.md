# 0008. Run TypeScript with Node's built-in type stripping

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The API is written in TypeScript and needs to run in development (with reload on save) and in production. The usual options are:

- a loader such as `tsx` or `ts-node`, which compiles on the fly
- Node 24's built-in type stripping, which runs `.ts` files directly by deleting the type annotations
- always compiling with `tsc` before running, even in development

## Decision

- **Development** runs `node --watch src/server.ts`, using Node's built-in type stripping.
- **Production** runs `tsc` to emit JavaScript into `dist/`, then `node dist/server.js`.
- Relative imports use real `.ts` extensions. `rewriteRelativeImportExtensions` turns them into `.js` when `tsc` emits.
- `erasableSyntaxOnly` in `packages/config/tsconfig/node.json` enforces the rule below.

## Consequences

- **Good:** one less dependency. Development runs on the same runtime and module loader as production, and reload is instant.
- **Bad:** TypeScript syntax that generates code can't be used: no `enum`, no `namespace`, no constructor parameter properties. We use Zod enums, string-literal unions and explicit class fields instead. The compiler flags any attempt.
- **Bad:** type stripping doesn't type-check. Type errors only surface in `pnpm typecheck`, in your editor and in CI, never at run time.
- **Rejected:** `tsx`, an esbuild-based loader that allows every TypeScript feature. It would mean another dependency, and development would run differently from production.

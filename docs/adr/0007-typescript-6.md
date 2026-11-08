# 0007. Stay on TypeScript 6.0 for now

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

`typescript@latest` is 7.0, the Go-native compiler. typescript-eslint 8.72, which provides our type-aware lint rules, declares `typescript: ">=4.8.4 <6.1.0"` as a peer dependency. It needs the compiler's JavaScript API, which the TypeScript 7 package doesn't ship.

## Decision

Pin `typescript` to `~6.0.3` in every workspace.

## Consequences

- **Good:** type-aware lint works. These rules catch unsafe `any`, floating promises and impossible conditions.
- **Bad:** we miss TypeScript 7's much faster type checking.
- **Revisit when:** typescript-eslint releases support for TypeScript 7. Watch its releases page, or let Dependabot propose the upgrade.

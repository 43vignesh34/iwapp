# 0001. Modular monolith

- **Status:** Accepted
- **Date:** 2026-11-08
- **Source:** spec §4

## Context

IWApp serves at most about 10,000 profiles and fewer than 50 concurrent staff users (assumption A1). It will be maintained by one or two volunteers. Most operations touch several domains at once. Adding a member, for example, creates the person, their memberships and an audit row.

## Decision

The backend is **one Fastify service with one database**, split internally into domain modules under `apps/api/src/modules/<domain>/`. Each module has its own `routes.ts`, `service.ts` and `repo.ts`. Modules talk to each other only through each other's `index.ts`, and an ESLint boundaries rule enforces this.

## Consequences

- **Good:** one deployment and one place to debug. A change that spans modules is a single database transaction. Running it costs nothing on Cloud Run's free tier.
- **Bad:** the whole API scales and fails as one unit. The boundaries depend on discipline plus the lint rule, not on network separation.
- **Later:** because module internals are private, a module can be split into its own service if it ever needs to be, without rewriting its callers.

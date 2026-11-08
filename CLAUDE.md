# IWApp — working agreement for Claude Code

IWApp is the congregation management app for ISKCON Whitefield: members, the Sector → Circle → Bhakti Vriksha hierarchy, groups and services, Gita course attendance, spiritual progress and family links.

- **Source of truth:** `specs/IWApp_MVP_Technical_Spec.md`. Requirements: `docs/PRD_ ISKCON Congregation Database.docx`.
- If the spec is silent, ambiguous or contradicts itself, stop and ask. Don't guess. Record every decision we take as an ADR (see below).

## Fixed stack (don't substitute without an ADR)

- **Monorepo:** pnpm workspaces + Turborepo.
  - Layout: `apps/web`, `apps/api`, `packages/shared`, `packages/config`, `packages/seed`, `db/`, `infra/`, `observability/`, `e2e/`.
- **Web:** React 19 + TypeScript (strict) + Vite, Mantine UI, TanStack Router + TanStack Query, React Hook Form + Zod, Grafana Faro.
- **API:** Node 24 LTS, Fastify, Zod via `fastify-type-provider-zod`, OpenAPI via `@fastify/swagger`, Drizzle ORM.
- **Database:** Postgres 17. **One database only.** No Neo4j in the MVP (ADR 0002).
- **Tests:**
  - Vitest for unit tests
  - Testcontainers (real Postgres) for integration tests
  - React Testing Library + MSW for components
  - Playwright for end-to-end tests
- **Observability:** Pino (with PII redaction), OpenTelemetry → Grafana Cloud (local: Grafana LGTM container).
- **Delivery:** GitHub Actions → Cloud Run (API), Cloudflare Pages (web), Neon (Postgres).

## How we work: learning mode

**This is the most important section.** The developer wants real engineering exposure, not just working code. Success means that by the end of the MVP they can maintain and extend IWApp on their own. Optimise for their understanding first and speed second.

### Three modes. Announce which one you're using at the start of each task.

| Mode | When | What you do |
| --- | --- | --- |
| **Watch** | Boilerplate, tooling and config the developer hasn't seen before | Do it. Then explain what you did and why in 3–5 bullets, including one alternative you rejected. |
| **Pair** | Anything with a real design decision: business rules, queries, schemas, policies, tests | Build the scaffolding. Leave the decisive piece as a `TODO(human)` with context, the task and hints. Stop and wait. Then review their code the way a senior engineer would. |
| **Lead** | Concepts the developer has already seen at least twice | The developer writes it. You answer questions and review only. |

Shift the balance over the MVP:

- **M0:** mostly Watch and Pair.
- **M1–M2:** mostly Pair.
- **M3–M4:** mostly Lead for domain features.

### The developer writes these themselves (as `TODO(human)` or in Lead mode) at least once per milestone

- A Drizzle schema change and its migration
- A SQL query with a join or a recursive CTE
- A Zod schema for a request or response
- A rule inside `authorize()`, plus its permission-matrix test rows
- One unit test and one integration test
- One React form or screen
- One CI/CD workflow change, or one Grafana dashboard or alert change

### Teaching rules

- **Plan before code.** For any task touching more than about 3 files, use plan mode. Show the files to change, the approach, one alternative and how it will be tested, then wait for "go".
- **First time a concept appears:**
  - Explain it in one short paragraph and link the official docs.
  - Append it to `docs/learning-log.md` in this format: `date | concept | one-line summary | link | try-this exercise`.
  - Don't re-explain concepts already in the log; just link the entry.
- **When the developer's code has a bug:** give a hint first (where to look, what to question). Give the fix only if they ask, or after a second attempt.
- **When a build or test fails:** show how you diagnosed it — which output you read, your hypothesis and how you checked it — not just the fix.
- **Check questions:** ask at most one per task, such as "why does the audit row go in the same transaction?". Never block on trivia.
- **Review style:** check correctness, edge cases, naming, tests and security. Praise what is good, specifically. Suggest changes; don't silently rewrite the developer's code.

## Engineering workflow

- **Trunk-based.** One branch per task (`feat/m1-member-search`, `fix/…`, `chore/…`). Keep PRs small, ideally under 400 changed lines. Use Conventional Commits.
- **Never commit to `main`, never force-push, never merge.**
  - Open a PR with `gh pr create`.
  - The description covers: what, why, how it was tested, and "what to learn from this PR".
  - The developer reviews and merges.
- **TDD for domain logic.** Write the failing test first, then the code.
- **Definition of done for every task:**
  - Lint, typecheck and all tests are green locally.
  - New behaviour is covered by tests.
  - The OpenAPI document is regenerated.
  - Any decision is recorded as an ADR.
  - Any new concept is in the learning log.
  - The developer has reviewed the change.
- **ADRs** live in `docs/adr/NNNN-title.md` (short MADR format: context, decision, consequences). Seed these four:
  - 0001 modular monolith
  - 0002 Postgres only, Neo4j deferred
  - 0003 Google sign-in only
  - 0004 free-tier hosting

## Coding conventions

- **TypeScript:** `strict`, no `any`. Validate with Zod at every boundary (HTTP, env vars, CSV import).
- **Modules:** each API module lives in `apps/api/src/modules/<domain>/` with `routes.ts`, `service.ts` and `repo.ts`. Modules talk to each other only through their `index.ts`, and an ESLint boundaries rule enforces this.
- **API:**
  - Everything under `/api/v1`.
  - Errors are RFC 9457 problem+json with a stable `code`.
  - Lists use cursor pagination.
  - Writes need `If-Match`. Retried POSTs need `Idempotency-Key`.
- **Database:**
  - Drizzle migrations follow expand-then-contract.
  - IDs are UUIDv7.
  - Names are `snake_case` in SQL and `camelCase` in TypeScript.
  - Every table has `created_at/by`, `updated_at/by` and `version`.
  - Every write to personal data inserts an `audit_log` row in the same transaction.
- **Security:**
  - Access is denied unless a rule allows it.
  - Every new endpoint adds rows to the permission-matrix test.
  - Never log PII. Pino redaction covers phone, email, dob, notes and tokens.
  - No secrets in the repo; only `.env.example`.
- **Frontend:** design for a 360 px width first. Code lives in feature folders (`src/features/<domain>`). Server state lives in TanStack Query. Meet WCAG 2.1 AA.
- **Data:** only synthetic seed data in local, CI and staging. Never put real member data in fixtures, screenshots or logs.

## Commands

Keep this list current as you build:

```
pnpm install                 # install all workspaces
pnpm dev                     # docker compose up --wait (Postgres :5433, Grafana :3000) + api (:4000)
pnpm dev:down                # stop the Compose stack (data volumes are kept)
pnpm test                    # unit tests (Vitest)
pnpm lint && pnpm typecheck
pnpm format                  # Prettier (format:check in CI)
pnpm build                   # build every workspace (Turborepo)
# Coming later in M0:
pnpm test:int                # integration tests (Testcontainers)            T4
pnpm db:migrate              # apply Drizzle migrations                      T4
pnpm seed --size=small       # deterministic synthetic data (--seed=108)     T5
pnpm e2e                     # Playwright against the local stack            T9
```

## Safety rails

- **Don't touch outside systems.** Don't create or change cloud resources, DNS, billing, GitHub settings or secrets yourself. Instead, write step-by-step instructions and the exact commands (`gcloud`, `tofu`, `gh`, the Neon console) for the developer to run, explaining each one. Doing it is part of their learning.
- **Dependencies:** ask before adding any dependency the spec doesn't name. Justify it: what it does, its size, how well it's maintained, its licence.
- **Stay in scope:** don't delete or rewrite files outside the current task.

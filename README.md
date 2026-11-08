# IWApp

The congregation management app for ISKCON Whitefield: members, the Sector → Circle → Bhakti Vriksha hierarchy, groups and services, Gita course attendance, spiritual progress and family links.

- **Specification:** [specs/IWApp_MVP_Technical_Spec.md](specs/IWApp_MVP_Technical_Spec.md)
- **How we work:** [CLAUDE.md](CLAUDE.md)
- **Decisions:** [docs/adr/](docs/adr/)
- **Concepts, with exercises:** [docs/learning-log.md](docs/learning-log.md)

> Only synthetic data ever lives in this repo, in local, CI or staging. Never commit real member data, `.env` files or secrets.

## Quickstart

You need **Node 24** and **Docker Desktop** (running).

```sh
corepack enable pnpm   # once per machine; installs the pnpm version pinned in package.json
pnpm install
cp .env.example .env   # optional: the defaults work locally
pnpm dev               # Postgres + Grafana in Docker, then the API with reload on save
```

## Commands

| Command          | What it does                                             |
| ---------------- | -------------------------------------------------------- |
| `pnpm install`   | Install every workspace's dependencies                   |
| `pnpm dev`       | Start Compose (`--wait` for healthy), then the API       |
| `pnpm dev:down`  | Stop the Compose stack (data volumes are kept)           |
| `pnpm test`      | Unit tests (Vitest)                                      |
| `pnpm build`     | Build all packages, in dependency order (Turborepo)      |
| `pnpm lint`      | ESLint, with type-aware rules                            |
| `pnpm typecheck` | `tsc --noEmit` in every workspace                        |
| `pnpm format`    | Rewrite files with Prettier (`format:check` only checks) |

Coming in later M0 tasks: `pnpm test:int`, `pnpm db:migrate`, `pnpm seed` and `pnpm e2e`.

## Local URLs

| URL                                           | What                           |
| --------------------------------------------- | ------------------------------ |
| http://localhost:4000/healthz                 | API liveness                   |
| http://localhost:4000/docs                    | Swagger UI (not in production) |
| http://localhost:3000                         | Grafana (admin / admin)        |
| `postgres://iwapp:iwapp@localhost:5433/iwapp` | Local Postgres                 |

## Layout

```
apps/web         React web app                    (T9)
apps/api         Fastify API                      (T2)
packages/config  shared tsconfig, ESLint, Prettier presets
packages/shared  code shared by api and web
packages/seed    synthetic data generator         (T5)
db/              Drizzle schema and migrations    (T4)
e2e/             Playwright tests                 (T9)
docs/            PRD, ADRs, learning log, runbooks
```

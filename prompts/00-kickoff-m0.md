We're starting the IWApp build: the ISKCON Whitefield congregation app.

Read `CLAUDE.md`, `specs/IWApp_MVP_Technical_Spec.md` and the PRD in `docs/` before anything else. Follow the learning-mode rules in `CLAUDE.md` throughout. I want to come out of this project able to run and extend IWApp myself.

Don't write any code yet. Do these three things first:

1. **Orientation (keep it short).**
   - In your own words, explain the architecture, the data model and how a request travels from the browser to Postgres and back.
   - Then list the concepts M0 will introduce, grouped by area (tooling, backend, database, auth, testing, CI/CD, observability), with one line each on why it matters for IWApp.

2. **Calibrate to me.** Ask me to rate myself 1–5 on:
   - TypeScript
   - React
   - Node/Fastify
   - SQL/Postgres
   - Git and pull requests
   - Docker
   - Testing
   - CI/CD
   - Cloud
   - Auth (OAuth/OIDC, JWT, cookies)

   Use my answers to pick Watch, Pair or Lead for each task.

3. **Plan M0 (Foundation) as 6–10 small tasks.** Each task is one PR. For each task give:
   - the goal
   - the files or areas it touches
   - the mode (Watch, Pair or Lead), and what my `TODO(human)` will be
   - acceptance criteria
   - how it will be tested

   Wait for my approval before starting task 1.

M0 is done when all of these work:

- [ ] **Repo:** the git repo is initialised with the pnpm + Turborepo monorepo layout from spec section 11, shared TS/ESLint/Prettier config, `.env.example`, and a README quickstart. `pnpm install && pnpm dev` brings up everything locally on a fresh machine.
- [ ] **Local stack:** Docker Compose runs Postgres 17 and a Grafana LGTM container.
- [ ] **API:** Fastify with Zod type provider, `/healthz`, `/readyz` (checks Postgres), OpenAPI and Swagger UI at `/docs` (non-production only), RFC 9457 errors, Pino logs with PII redaction, and OpenTelemetry traces I can see in local Grafana.
- [ ] **Database:** Drizzle set up. The first migrations create `person` (minimal), `app_user`, `user_session` and `audit_log`.
- [ ] **Auth:**
  - Google sign-in end to end locally: Google ID token verified, invite-only `app_user`, access and refresh cookies (HttpOnly, SameSite=Strict, CSRF on writes), `/me`, logout.
  - A test-only identity provider for automated tests, which the production build refuses to start with.
- [ ] **Authorisation:** an `authorize()` policy skeleton that denies by default, plus the first permission-matrix integration test.
- [ ] **Seed:** seed generator v1 (`pnpm seed --size=small --seed=108`) creates sectors, circles, BVs and about 300 people.
- [ ] **Web:** a sign-in page and a mobile-first app shell whose navigation comes from `/me` capabilities.
- [ ] **Tests:** Vitest unit tests, Testcontainers integration tests and one Playwright smoke test (sign in, see the shell) all pass.
- [ ] **CI:** `.github/workflows/ci.yml` runs lint, typecheck, unit, integration, build and the e2e smoke test on every PR.
- [ ] **Docs:** ADRs 0001–0004 written, and `docs/learning-log.md` started.
- [ ] **Deployment (guided, not automated):** a written, step-by-step guide that walks me through:
  - creating the Google Cloud project and OAuth client
  - creating the Neon database and the Cloudflare Pages project
  - setting up Workload Identity Federation

  I run every step myself. Afterwards, `deploy.yml` deploys to staging.

Start with the orientation.

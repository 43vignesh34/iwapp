# App Flow Notes

Started 2026-11-11. How one request ("show the Members list") travels through IWApp.

## The layers, one line each

1. **Browser** ([apps/web/src/](../apps/web/src/)): React draws the Members screen, and TanStack Query sends `GET /api/v1/members`.
2. **Cloudflare Pages proxy** ([apps/web/functions/api/[[path]].js](../apps/web/functions/api/[[path]].js)): forwards the request to Cloud Run and stamps it with the real IP.
3. **API startup and plugins** ([apps/api/src/app.ts](../apps/api/src/app.ts), [plugins/](../apps/api/src/plugins/)): adds security headers and a request id, and logs the request.
4. **Auth** ([modules/auth/hooks.ts](../apps/api/src/modules/auth/hooks.ts)): reads the session cookie and works out _who_ is asking.
5. **Routes** ([modules/members/routes.ts](../apps/api/src/modules/members/routes.ts)): Zod checks the request is well-formed and passes it to the service.
6. **Service** ([modules/members/service.ts](../apps/api/src/modules/members/service.ts)): `assertAllowed()` checks the user _may_ do this, then applies the business rules.
7. **Repo** ([modules/members/repo.ts](../apps/api/src/modules/members/repo.ts)): Drizzle turns the request into SQL and runs it.
8. **Postgres** ([db/src/schema/](../db/src/schema/)): runs the query and returns the rows.

Then the rows go back up the same path as JSON, and React redraws the list.

## Why the browser talks to the Pages proxy, not straight to the backend

The website lives on Cloudflare Pages (e.g. `iwapp.pages.dev`) and the API on Cloud Run (e.g. `iwapp-api-xyz.run.app`). These are **two different addresses** (origins). The proxy makes the API look like part of the website, at `iwapp.pages.dev/api/...`.

1. **No CORS.** By default a browser blocks a page on one origin from reading responses from another. Calling Cloud Run directly would need extra CORS configuration on the API, and a mistake there either breaks the app or opens it up too widely. Same origin = no CORS at all.
2. **The session cookie stays first-party.** After sign-in, the API sets a session cookie. Browsers increasingly **block third-party cookies**, i.e. cookies from a different site than the one you're on. Through the proxy, the cookie belongs to the website's own address, so the browser keeps sending it.
3. **The real client IP is trustworthy.** The proxy overwrites `x-forwarded-for` with the IP Cloudflare actually saw. Nobody can fake their IP to dodge the sign-in rate limit.
4. **The backend's address is hidden and swappable.** The Cloud Run URL lives only in a Cloudflare setting (`API_ORIGIN`). We can move the API, and the browser never notices.

**Restaurant analogy:** customers order only through the front of the restaurant. They never walk round to the kitchen's back door. The waiter takes the order through the one door into the kitchen, and writes the table number on the ticket themselves.

## What "the Cloudflare Pages proxy" is

It's two Cloudflare features working together:

1. **Cloudflare Pages: website hosting.** `pnpm build` turns the web app into plain files (HTML, JS, CSS in `apps/web/dist`). Pages stores copies in data centres worldwide (a **CDN**), so they load fast from nearby. It's free on our plan (ADR 0004). These files are **static**: Pages only hands them out. It can't run the API or talk to a database.
2. **Pages Functions: small code at the edge.** JavaScript files in `apps/web/functions/` run on Cloudflare's servers when a matching URL is requested. **The filename is the route:** `functions/api/[[path]].js` handles `/api/` and everything under it.

**"The proxy" is one Pages Function.** Its only job is to forward `/api/*` to Cloud Run and return the reply.

- `/members` (a page) → Pages serves the static files → React draws the screen
- `/api/v1/members` (data) → the function runs → it forwards to Cloud Run → it returns the answer

**A proxy, in general:** a go-between that receives a request on someone else's behalf, forwards it, and returns the reply.

**Restaurant analogy:** Pages is the front of house, with menus and tables ready everywhere (the static files). The function is the waiter at the kitchen door, carrying orders to and from the kitchen (Cloud Run).

Docs: [Cloudflare Pages](https://developers.cloudflare.com/pages/) · [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)

## Layer 3: API startup and plugins

**Restaurant analogy:** the kitchen must be **open for the day**, and every incoming ticket goes through the same **reception desk** routine before any cooking.

### Part A: opening the kitchen (once, at server start)

[server.ts](../apps/api/src/server.ts) is the API's starting point (like `main.tsx` for the web app):

1. `loadEnv()` reads and validates the settings with Zod. If anything is missing, it stops with a clear message.
2. `buildApp(env)` builds the app.
3. `app.listen(...)` starts accepting requests.
4. On `SIGTERM` (Cloud Run stopping it), it finishes the requests in progress, then exits (a _graceful shutdown_).

[app.ts](../apps/api/src/app.ts) → `buildApp()` sets up, in order:

| Order | What                                               | Restaurant                                |
| ----- | -------------------------------------------------- | ----------------------------------------- |
| 1     | Fastify with a logger that redacts PII             | The order log never records phone numbers |
| 2     | Zod checks requests and responses                  | Check every ticket and every plate        |
| 3     | One database connection pool (`app.db`)            | One shared line to the pantry             |
| 4     | Plugins: telemetry, error format, security headers | Reception desk routine (Part B)           |
| 5     | Authentication + actor scope                       | The ID check (Layer 4)                    |
| 6     | Rate limit: 300 requests/minute per user           | No table may order 1,000 dishes a minute  |
| 7     | Routes: health, auth, users, members               | The menu sections the kitchen can cook    |

### Part B: what every request passes through

| Plugin           | File                                                                     | One line                                                      |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Request id       | [plugins/request-id.ts](../apps/api/src/plugins/request-id.ts)           | A ticket number per request, to tie its log lines together    |
| Telemetry        | [telemetry/request-hooks.ts](../apps/api/src/telemetry/request-hooks.ts) | Timing and one log line per request, personal data scrubbed   |
| Security headers | [plugins/security.ts](../apps/api/src/plugins/security.ts)               | Helmet adds standard browser-safety headers to every response |
| Error format     | [plugins/problem.ts](../apps/api/src/plugins/problem.ts)                 | Every error becomes one standard JSON shape (RFC 9457)        |

**A plugin** hooks into every request ("on request, do X"). You write it once and it applies everywhere, so no route can forget it.

Layer 3 knows nothing about members. It's the general machinery every request goes through.

## Layer 4: Auth, "who is asking?"

**Restaurant analogy:** the reception desk checks the ticket's stamp. Is it real? Which customer? Is their membership still active? Then it notes which tables (area of the restaurant) that customer is in charge of.

Two files, and both run before **every** `/api/v1` request.

### [modules/auth/hooks.ts](../apps/api/src/modules/auth/hooks.ts): three checks in order

| Step               | What happens                                                                                                                   | If it fails                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 1. Who are you?    | Reads the access cookie (a signed JWT from sign-in), verifies it, loads the user, checks the session is live → `request.actor` | `actor` stays `null`           |
| 2. Deny by default | Route not marked `public` and no actor → stop                                                                                  | **401** "Sign in to continue." |
| 3. CSRF check      | POST/PUT/PATCH/DELETE need the `X-CSRF-Token` header to match the `iw_csrf` cookie                                             | **403** "Invalid CSRF token."  |

**Why CSRF matters:** an evil site can make my browser _send_ a request to IWApp (the cookies are attached automatically), but it can't _read_ my cookies to copy the token into the header. Our own web app can. This is a "double-submit" token.

### [plugins/actor-scope.ts](../apps/api/src/plugins/actor-scope.ts): "what are you in charge of?"

- Works out which units in the Sector → Circle → Bhakti Vriksha tree this leader looks after (one recursive CTE).
- Runs **once per request** and is stored on `request.actor`. Admins skip it, since they're allowed everything.
- The permission check (Layer 6) may run many times per request. Each run just checks this set in memory.

**In one line:** Layer 4 answers "who are you, and what's your area?" It does **not** decide whether you may see members. That's Layer 6.

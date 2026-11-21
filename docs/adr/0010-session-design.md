# 0010. Session design: stateless JWT plus a per-request session check

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Spec §6 asks for a 15-minute access JWT and a rotating 14-day refresh token, in HttpOnly, SameSite=Strict cookies, with CSRF double-submit on writes. It also says signing out, or an admin disabling a user, revokes **all** of that user's sessions. A purely stateless JWT can't be revoked: it stays valid until it expires, up to 15 minutes later.

## Decision

- **Access token:** an HS256 JWT carrying only `sub` (user ID) and `fam` (session family), with issuer and audience checked, and the algorithm pinned to HS256. It never carries roles or permissions.
- **On every authenticated request**, one indexed query loads the user and confirms that they're `active` **and** that their session family still has a live, unrevoked row. We need the user row anyway, to work out permissions, so revocation costs almost nothing extra.
- **Refresh tokens** are 256-bit random values, stored only as SHA-256 hashes. They rotate on every use (`SELECT … FOR UPDATE`, so two concurrent refreshes can't both succeed). Presenting a rotated token revokes the whole family, because it means someone kept a copy.
- **Cookies:**
  - `iw_access` (path `/api`, 15 minutes)
  - `iw_refresh` (path `/api/v1/auth` only, 14 days, sliding)
  - `iw_csrf` (path `/`, **readable by JavaScript** so the web app can echo it in `X-CSRF-Token`)

  All three are `Secure` and `SameSite=Strict`, and the two tokens are `HttpOnly`.

- **Deny by default:** every `/api/v1` route requires a session unless its route config says `public: true`. Unknown `/api/v1` routes return 401 to anonymous callers, which doesn't reveal what exists.
- **Test identity provider** (`POST /api/v1/auth/test-login`): registered only when `AUTH_TEST_MODE=true`, **and** `loadEnv()` refuses to start in production with that flag set. Two independent guards.

## Consequences

- **Good:** logout and disabling take effect on the very next request. A database leak exposes no usable refresh tokens.
- **Bad:** one extra query per request, plus one per refresh. That's well within budget at under 50 concurrent users.
- **Bad:** if two browser tabs refresh at the same moment with the same token, the second looks like reuse, and the user is signed out. The web app (S8) must run **one refresh at a time** and share its result.
- **Rejected:** opaque server-side sessions only, with no JWT. That would work just as well here, but the spec names JWTs, and they let a future service verify identity without a database lookup.

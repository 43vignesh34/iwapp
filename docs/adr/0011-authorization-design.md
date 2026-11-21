# 0011. Authorisation: a pure policy, a once-per-request scope, and a permission matrix

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Spec §6: deny by default. Admins see everything. Leaders see their own units and everything below them. Members see themselves. Every rule is enforced by **one** policy module, and every endpoint × role combination is covered by tests. Computing a leader's scope needs the hierarchy tables, but the hierarchy module itself calls `authorize()`. That's a potential dependency cycle.

## Decision

- **`policy` is pure.** `authorize(actor, action, resource)` checks in-memory data only. A table maps each action to a rule, and admins pass every check. **Anything without a rule is admin-only.**
- **Scope is computed once per request,** by a hook in `plugins/actor-scope.ts`. It calls `hierarchy.scopeUnitIds()` (a recursive CTE) and attaches the result to `request.actor`. Neither `policy` nor `auth` imports `hierarchy`; the wiring happens at the edge.
- **Capabilities** for `GET /me` come from the same rules (`capabilitiesFor`), so the menus can never disagree with what the API allows.
- **Permission matrix** (`apps/api/test/permission-matrix.int.test.ts`): five personas × every endpoint, giving exact status codes. A **coverage test** compares the matrix with the OpenAPI document and fails if any `/api/v1` endpoint has no rows.
- **Q2 is still open**, so leaders may **not** edit members' contact details. `member.update.contact` allows only the member themselves (and admins) until Q2 is answered.

## Consequences

- **Good:** rules are unit-testable in milliseconds. A forgotten endpoint fails CI, and a forgotten rule fails closed.
- **Bad:** one recursive query per authenticated non-admin request. With 39 units it takes well under a millisecond.
- **Later:** list endpoints filter by scope **in SQL**, using the same `scopeUnitIds`, so leaders never even load rows they can't see. Row-level security in Postgres remains an optional second line of defence (spec §4).

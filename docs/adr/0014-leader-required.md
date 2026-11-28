# 0014. Every level has a leader, enforced by deferred constraint triggers

- **Status:** Accepted
- **Date:** 2026-11-28

## Context

ADR 0013 requires every level to have a leader at all times: each active Circle, Sector and Bhakti Vriksha, and each leadership post once it has been filled. It left the enforcement mechanism open.

This rule spans two rows: a unit, and its leader's `membership` row. A CHECK constraint only sees one row, so it can't express the rule. Creating a unit also needs two inserts, as does a handover (end one leader, appoint the next), so any check that runs after each statement would reject the first step of every legitimate change.

## Decision

Enforce the rule in Postgres with **constraint triggers that are `DEFERRABLE INITIALLY DEFERRED`** (migration `0005_leader_required`). They run at `COMMIT`, against the final state of the transaction:

- `org_unit_requires_leader`, after insert or update on `org_unit`: an active unit must have an active `leader` membership.
- `membership_keeps_unit_leader`, after update or delete of a `leader` membership: the unit it belonged to must still have one, unless that unit was archived or deleted.
- `leadership_post_requires_holder`, after update or delete on `leadership_post`: the post must still have an active holder.

A violation raises SQLSTATE `23514` (check_violation), carrying the trigger's name as the constraint name. Callers therefore create a unit and its leader in one transaction, and hand over in one transaction.

## Alternatives rejected

- **Check in the service layer only.** It covers only code paths that remember to call it. The CSV import, the seed, scripts and future endpoints could each bypass it. Elsewhere we already rely on the database as the last line of defence (`audit_log` append-only, the tree's parent-kind rule).
- **A "vacant" status with a dashboard warning.** This contradicts the requirement.

## Consequences

- **Good:**
  - The guarantee holds for every writer.
  - Handovers are atomic, so history never shows a gap.
  - At most one leader per unit was already enforced by `membership_one_active_leader`, so together they mean **exactly one**.
- **Bad:**
  - The error surfaces at `COMMIT`, not at the statement that caused it. With autocommit, that's the same moment.
  - The API must map constraint `org_unit_requires_leader` / `leadership_post_requires_holder` to a problem+json `code` when the unit endpoints arrive (M2).
  - Tests can't simply end a leadership. They either hand over, or roll back the transaction.
- **Not covered:**
  - A post that has never been filled isn't flagged; a trigger needs a row to fire on. The seed and go-live checklist fill both posts.
  - Rows that already existed weren't re-checked. The seed has always given every unit a leader.

# 0009. Table conventions, and where they don't apply

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

`CLAUDE.md` says every table has `created_at/by`, `updated_at/by` and `version`. Two M0 tables don't fit that rule:

- **`audit_log`** is append-only, so rows are never updated.
- **`user_session`** is technical: each refresh rotates to a _new_ row.

On these tables, `updated_*` would always equal `created_*`, and `version` would always be 1.

## Decision

- **Business tables** (`person`, `app_user`, `org_unit`, `membership`, …) carry all five columns, through the `auditColumns()` helper in `db/src/schema/columns.ts`.
- **Append-only and technical tables** (`audit_log`, `user_session`) carry only the timestamps that mean something (`at`, or `created_at`/`expires_at`/`revoked_at`), and no `version`.
- `created_by` and `updated_by` have **no foreign key** to `app_user`. Records must outlive the anonymisation or removal of the user who wrote them.
- `audit_log` is append-only by **database trigger** (migration 0001): `UPDATE`, `DELETE` and `TRUNCATE` all raise an error.
- Primary keys are UUIDv7, generated in Node (`uuidv7` package), because Postgres 17 has no native `uuidv7()`.
- `phone_e164` is named explicitly, because automatic snake_case conversion turns `phoneE164` into `phone_e_164`.

## Consequences

- Optimistic locking (`If-Match`) is only available on business tables. Nothing updates the others, so nothing is lost.
- The trigger also blocks legitimate maintenance, such as purging audit rows after a retention period. That will need a deliberate, reviewed migration that drops and recreates the trigger, which is the intended level of friction.
- **Revisit when:** we move to Postgres 18. Then switch the ID default to the native `uuidv7()`.

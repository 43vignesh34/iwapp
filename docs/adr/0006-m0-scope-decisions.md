# 0006. M0 scope adjustments

- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** project owner, during M0 kickoff

## Context

The M0 checklist and the spec leave a few gaps:

- The seed must create sectors, circles and BVs, but the M0 migrations list only `person`, `app_user`, `user_session` and `audit_log`.
- The minimal `person` isn't defined.
- The spec doesn't say whether the operational endpoints sit under `/api/v1`.

## Decision

1. **`org_unit` and `membership` move into M0**, so the seed builds the real hierarchy. In M0, `membership` has `unit_id` only. `group_id`, and the "exactly one of `unit_id` and `group_id`" check, arrive with `grp` in a later expand-only migration.
2. **The minimal `person`** has `id`, `legal_name`, `display_name`, `locality`, `email`, `phone_e164` and `status`, plus the audit columns and `version`. The other spec §5 columns arrive in M1 through expand-only migrations.
3. **`/healthz`, `/readyz` and `/docs` sit at the root**, outside `/api/v1`. They are for operations, not part of the versioned API contract that the mobile app will rely on.
4. **Infrastructure in M0** is created by hand from a written guide using `gcloud` and the provider consoles, so each resource is understood. It will be codified in OpenTofu (`infra/`) in M4.
5. **Grafana Faro**, the browser telemetry SDK, is deferred from M0 to M1.

## Consequences

- M2 builds on an existing `org_unit` table instead of creating it.
- The OpenAPI document for `/api/v1` contains only business endpoints.
- Until M4, staging infrastructure exists only as the guide plus what was actually run. If the two drift apart, the guide is the reference to fix.

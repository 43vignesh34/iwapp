# 0004. Free-tier hosting

- **Status:** Accepted
- **Date:** 2026-11-08
- **Source:** spec §1 (D3), §8

## Context

The temple asked for the cheapest option across any providers. The volunteer team can't take on patching servers or running backups by hand.

## Decision

Use managed free tiers, all in or near Singapore:

- Cloudflare Pages for the web app, plus a Pages Function that proxies `/api/*` on the same origin
- Google Cloud Run for the API
- Neon Postgres Free for the database
- Grafana Cloud Free for observability
- GitHub Actions for CI/CD
- Cloudflare R2 for encrypted nightly backups

## Consequences

- **Good:** about ₹0 a month, with no servers to patch. Moving to paid plans later is a configuration change.
- **Bad:** cold starts of 2–4 s after idle periods, because Cloud Run and Neon both scale to zero. Neon Free can only restore the last 6 hours, so nightly encrypted dumps cover longer periods.
- **Rejected:** a single Oracle Cloud Always Free VM. It has no cold starts, but we would have to patch it ourselves, and idle free VMs can be reclaimed.

# 0002. Postgres only; Neo4j deferred

- **Status:** Accepted
- **Date:** 2026-11-08
- **Source:** spec §1 (D1), §4

## Context

An earlier draft kept a Neo4j graph copy alongside Postgres for the hierarchy, family and course relationships. The MVP's relationship questions are shallow, though: the hierarchy has three levels, family is one or two hops away, and course enrolment is direct. Most of the data is records: profiles, consent, attendance and audit.

## Decision

Use **one database, Postgres 17**. Hierarchy, family and filter questions are answered with joins, `EXISTS`, recursive CTEs and `pg_trgm`. `membership` and `relationship` are stored as link tables.

## Consequences

- **Good:** one store to back up, secure and erase personal data from (DPDP), and no code to keep two stores in sync. Neon Free is enough.
- **Bad:** deep or open-ended graph questions, such as "how are these two people connected?", would be awkward in SQL.
- **Later:** if those questions arrive, add Neo4j as a read-only projection fed from Postgres. The link tables already have the right shape, so nothing needs redesigning.

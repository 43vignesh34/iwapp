# 0013. Hierarchy: Circle → Sector → BV, two leadership posts, and a leader at every level

- **Status:** Accepted
- **Date:** 2026-11-28

## Context

The baseline spec described a Sector → Circle → Bhakti Vriksha tree, with an optional leader per unit. ISKCON's organisation chart, confirmed with the developer on 28 Nov, differs in three ways:

1. **Circle sits above Sector.** A Circle-Servant (Cakra-Pati) leads several sectors, and a Sector-Servant (Upacakra-Pati) leads several BVs, each led by a Servant-Leader.
2. **Two levels sit above the tree:** the Program Director and, under them, the Supervising Preacher. These are levels of leadership, not organisations. No member "belongs to" them.
3. **Every level must have a leader.**

The schema, migration `0002_hierarchy`, the seed and the tests already encode the old order.

## Decision

- **Reorder the tree** to Circle (root) → Sector → Bhakti Vriksha. The `org_unit_kind` enum values stay the same; only the parent-kind rule changes.
- **Model the two top levels as a `leadership_post` table** (person_id, post, start_date, end_date), where post is `program_director` or `supervising_preacher`. They are not `org_unit` kinds. Each post has one active holder, and holders' scope is every unit. They are not Admins (spec A10).
- **A leader is required:** a unit is created with its leader in the same transaction. A leader or post-holder is ended only by a handover that names the successor in the same transaction. The exact enforcement mechanism (service rule or a deferred constraint trigger) is decided in the implementation task.
- The UI shows titles by level (Cakra-Pati, Upacakra-Pati, Servant-Leader). The database role stays the generic `leader`.

## Alternatives rejected

- **Two extra `org_unit` kinds above Circle** (for example `program`, `supervision`). That would make the posts organisations in all but name: members could join them, and the tree would have five levels for one person each.
- **Leader optional, with a "vacant" warning.** This contradicts the requirement that every level has a leader.

## Consequences

- **Good:** the model matches how the congregation actually works. Scope logic for the top posts is trivial (every unit). No organisation-chart node can silently lose its leader.
- **Bad:** existing code must change: a new migration swaps the parent-kind CHECK (synthetic data only, so existing rows can be reseeded), and the seed, the hierarchy and scope tests, and the permission matrix all need updating. Replacing a leader who leaves suddenly needs an admin to name a successor (or a temporary one) at once.
- **Later:** if a real congregation needs several Supervising Preachers, each over some circles, `leadership_post` gains a scope column. That is an expand-only change.

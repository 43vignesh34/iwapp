# 0005. Public repository

- **Status:** Proposed
- **Date:** 2026-11-08
- **Deciders:** <!-- TODO(human): who decided this? -->

<!--
TODO(human): write this ADR yourself. It's your decision, so you can explain it best.

Context, from our conversation:
  - Spec §1 (D4) and §11 say "private GitHub repo".
  - On GitHub Free, private repos get no branch protection, so nothing technically
    stops a merge to main with red CI.
  - We chose to make the repo public instead (2026-11-08).

Hints for each section (2–5 bullets each is plenty):
  Context:      what problem forced a choice? What were the options?
                (private + GitHub Pro, a nonprofit organisation, or public)
  Decision:     one or two sentences, stated plainly.
  Consequences: be honest about both sides.
     + what do we gain? (branch protection, CodeQL, Actions minutes…)
     - what do we risk? (the spec and PRD are public; a leaked secret is
       visible to the world; commit emails, and what we did about them)
     What do we now have to do to stay safe? (gitleaks in CI,
     GitHub secret scanning with push protection, no real data ever)
  Revisit when: what would make us go private again?

Look at 0004 for the shape. Delete this comment when you're done.
-->

## Context

## Decision

## Consequences

# 0005. Public repository

- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** project owner (43vignesh34)
- **Supersedes:** the "private GitHub repo" in spec §1 (D4) and §11

## Context

- The spec assumed a private repo with branch protection on `main` and required checks.
- On GitHub Free, private repos get no branch protection or rulesets, so nothing would technically stop a merge with red CI.
- The options were:
  - a private repo with GitHub Pro, at about US$4 a month
  - a private repo in a GitHub organisation on the nonprofit plan, which needs the temple to set up the organisation first
  - a public repo on GitHub Free

## Decision

The `iwapp` repository is **public**.

## Consequences

- **Good:**
  - free branch protection and required status checks
  - free CodeQL and secret scanning with push protection
  - unlimited GitHub Actions minutes on standard runners
- **Bad:**
  - the spec, PRD and working agreement are public
  - any secret committed by mistake is visible to everyone at once, and deleting it later doesn't remove it from git history
  - commit author emails are public
- **What we do about it:**
  - commits use the GitHub noreply email
  - gitleaks scans the full history on every PR
  - GitHub secret scanning with push protection is on
  - no `.env` files are committed, only `.env.example`
  - only synthetic data, ever, in fixtures, screenshots and logs (`CLAUDE.md`)
  - a leaked secret is rotated at once; rewriting history is not enough
- **Revisit when:** the temple sets up a nonprofit GitHub organisation, or the repo has to hold anything that can't be public. A transfer to an organisation keeps the history, and visibility can be switched to private then.

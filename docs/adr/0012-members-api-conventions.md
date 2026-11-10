# 0012. Members API conventions (the first business endpoints)

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The first real business endpoints (`/api/v1/members`) set the patterns every later module copies. `CLAUDE.md` requires cursor pagination, `If-Match` on writes and an audit row for personal-data writes. The spec leaves three things open: the status for an out-of-scope read, how lists treat contact details, and the phone format users type.

## Decision

- **Keyset pagination** on `(legal_name, id)`, with an opaque base64url cursor. `limit` is 1–100 (default 50). The query fetches `limit + 1` rows to know whether there's a next page.
- **Lists contain no contact details.** Phone and email appear only on the profile, behind `member.read`. This is data minimisation (spec §6).
- **Scope is filtered in SQL** (`EXISTS` over active memberships in the actor's scope units). Leaders never load rows they can't see.
- **An out-of-scope read returns 403**, not 404. IDs are UUIDv7 with 74 random bits, so they can't practically be guessed, and a clear 403 helps leaders and support. _Revisit if enumeration ever becomes a concern._
- **Writes:**
  - `If-Match: "<version>"` is required (428 `IF_MATCH_REQUIRED` without it).
  - The update runs `UPDATE … WHERE id = ? AND version = ?`, and 0 rows means 412 `VERSION_MISMATCH`.
  - Reads return `ETag: "<version>"`.
  - A save that changes nothing writes nothing, adds no audit row, and keeps the version.
- **Phones** are normalised by a pure domain function (`members/domain/phone.ts`) into E.164, with India (+91) as the default for 10-digit mobiles.
- **Leaders can't edit members' contact details yet:** Q2 is open (ADR 0011).

## Consequences

- Every list endpoint from now on uses the same cursor shape: `{ items, nextCursor }`.
- Clients must keep the `ETag` from a read and send it back. The web form (S8) does this.
- Changing the sort order later invalidates old cursors cleanly, with 400 `INVALID_CURSOR`.

# 0003. Google sign-in only

- **Status:** Accepted
- **Date:** 2026-11-08
- **Source:** spec §1 (D2), §6

## Context

Leaders and admins need to sign in. Phone OTP is the obvious alternative, but every SMS is billed to the temple. Running our own passwords means storing credentials, handling resets and defending against brute-force attacks.

## Decision

Sign-in is **Google only**, through Google Identity Services. The API verifies the Google ID token (audience, issuer, expiry and verified email) and matches the email to an `app_user` that an admin invited. No account is ever created automatically. After that, the API issues its own session: a 15-minute access JWT and a rotating 14-day refresh token, both in `HttpOnly`, `Secure`, `SameSite=Strict` cookies, with a CSRF double-submit token on writes.

## Consequences

- **Good:** no passwords to store and no SMS cost. Google handles MFA and account recovery.
- **Bad:** members without a Google account can't sign in (assumption A4). Leaders maintain their profiles instead.
- **Tests** can't use real Google sign-in, so a test-only identity provider exists. The production build refuses to start if it is enabled.
- **Later:** phone OTP in phase 2, if the temple funds the SMS cost.

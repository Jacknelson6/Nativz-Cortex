# PRD 04: Agency-scoped modal login

## Problem

Most clients won't survive a redirect off the share link to `/login` and back. We've watched it happen: they hit login, get bounced to a generic Cortex login, get confused, close the tab. We need an in-page login modal that authenticates without leaving the share link, and that refuses to bind a user from the wrong agency.

## Goal

A modal that:

1. Accepts email + password (or magic link, if we keep that flow elsewhere).
2. Authenticates against Supabase.
3. Verifies the resulting user belongs to the share link's agency.
4. Returns the visitor to the share link as the authenticated user, without a full page redirect cycle if avoidable.

## Scope

Both share pages, via the gateway modal (PRD 02). New endpoint that wraps Supabase auth with the agency check.

## Spec

### Modal UI

- Triggered by "log in" in the gateway.
- Two-field form: email, password.
- Submit button: "log in."
- Secondary link: "forgot password" → opens recovery flow with `next` set back to the share link.
- Tertiary link: "use guest mode instead" → returns to the gateway.
- Error region shown inline for failed auth or mismatched agency.

If we keep magic-link auth in production, add a "send me a link" tab with email-only input.

### Server endpoint

New endpoint: `POST /api/share/[token]/auth/login`.

Body: `{ email, password }` or `{ email }` for magic link.

Logic:

1. Resolve the share link by `token`. Reject 404 if missing, 410 if expired or archived.
2. Resolve the share link's client and agency.
3. Call Supabase `signInWithPassword` (or `signInWithOtp` for magic link).
4. On success, read the authenticated user's `organization_id` and `role`.
5. Verify access:
   - If `role` in (`admin`, `super_admin`) and the agency matches the share link's agency: allow.
   - If `role = 'viewer'` and `organization_id` matches the share link's organization (which is the agency's view of this client): allow.
   - Otherwise: sign the session out and return 403 `{ error: 'this account doesn't have access to this link.' }`.
6. On allow, return success. The Supabase client cookie is already set by signInWithPassword.

After the modal closes on success, the page reloads. Server resolution from PRD 02 picks up the new session and auto-binds.

### Error handling

- Wrong password: standard Supabase error message, rendered inline.
- Account doesn't exist: same generic message; don't disclose membership.
- Agency mismatch: explicit copy ("this account doesn't have access to this link"). Sign the user back out before returning the response so we don't leave them in a half-bound state.
- Rate limiting: rely on Supabase defaults; surface clearly if rejected.

### Magic-link flow

If we offer magic links:

- POST `/api/share/[token]/auth/login` with just email triggers a magic link email.
- Magic link URL is `/c/[token]?auth_callback=1` (or the editing equivalent).
- On callback, the server resolves the session, performs the agency check, and either auto-binds or returns to the gateway with an error banner.

### Audit

Every login attempt (success or fail) logs a row in the existing auth audit table if one exists, or in `share_link_admin_actions` (introduced in PRD 06) keyed as `action = 'auth.login'`.

## Acceptance

- Same-agency admin can log in via the modal and lands on the page with admin chip.
- Same-agency viewer can log in and lands with viewer chip.
- Wrong-agency user gets 403 with a clear message and is not left in a half-bound session.
- Magic-link flow round-trips correctly to the share link.
- Forgot-password flow returns the user to the same share link.

## Out of scope

- Building a new password reset surface (use existing).
- SSO for clients.
- Remembering the chosen role across share links (each share link's auth is its own scope).

## Dependencies

PRD 02. Touches PRD 05 indirectly (auth chip rendering) but PRD 05 owns the comment-side identity model.

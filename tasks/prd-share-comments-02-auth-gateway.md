# PRD 02: Auth gateway modal on share link entry

## Problem

First interaction on a share link today is "What's your name?" That throws away three things we already know or could know:

1. Whether the visitor is an authenticated admin in the same agency as the share link.
2. Whether the visitor is an authenticated viewer scoped to that client.
3. Whether they want any of the above, or just want to leave a comment as a guest.

We end up with admins typing their own names into a guest box, which loses attribution and blocks us from giving them admin powers on the page.

## Goal

Replace the name-only prompt with a three-state gateway:

1. Auto-bind: visitor is already logged in to Cortex and their agency matches the share link's agency. Skip the modal entirely.
2. Log in: open an inline modal login scoped to the share link's agency (see PRD 04).
3. Continue as guest: open the name capture (see PRD 03).

## Scope

Both share pages, mirrored. Same modal component, same server check.

## Spec

### Server resolution

On request to `/c/[token]` and `/c/edit/[token]`:

1. Resolve the share link's client and agency.
2. Read Supabase session cookie.
3. Decision table:

| Session | User's agency | Action |
|---|---|---|
| absent | n/a | render gateway modal |
| present | matches share link's agency | auto-bind, skip modal |
| present | mismatches | render gateway modal; treat as logged-out for this surface |

Mismatch case is the leakage guard. We do not silently log the user out of Cortex; we only ignore their session for this share link's context.

### Gateway modal

Two CTAs, equal weight visually:

- Primary: "Log in" → opens login modal (PRD 04).
- Secondary: "Continue as guest" → opens guest name capture (PRD 03).

Below the buttons, single-line helper: "Logging in lets your team see your name and reply to you directly."

Modal cannot be dismissed without choosing. No X button, no esc handler. The page underneath is blurred but readable so the visitor can confirm they're on the right share link.

### Persistence

- Authenticated visitor: server session is enough; nothing client-side to store.
- Guest: see PRD 03.

Re-entry rules:

- Authenticated visitor returning to the same share link: server auto-binds; no modal.
- Guest returning in the same browser within session: PRD 03 covers persistence.
- Guest returning to a different share link: modal shows again (each share link is its own context).

### Edge cases

- Expired share link: never show the modal; show the existing expired state.
- Archived share link: same.
- Share link without a resolvable agency (data anomaly): show gateway but suppress the login button with a tooltip "login is unavailable for this link." Guest mode still works.

## Acceptance

- Anonymous visitor sees the modal on first visit.
- Logged-in same-agency admin lands directly on the page with admin chip visible (chip wiring is PRD 05, but binding happens here).
- Logged-in same-agency viewer lands directly on the page with viewer chip visible.
- Logged-in wrong-agency visitor sees the modal and can still continue as guest.
- Expired or archived link still renders its existing terminal state, no modal.

## Out of scope

- The login modal's internals (PRD 04).
- The guest name capture's internals (PRD 03).
- Admin controls behavior (PRD 06).

## Dependencies

PRD 03 and PRD 04 ship alongside this. PRD 02 wires the gate; 03 and 04 supply the panels behind each button.

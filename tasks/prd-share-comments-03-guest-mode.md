# PRD 03: Guest mode

## Problem

Most visitors are not logged in. They are a videographer's brand contact, a junior on the client side, or a freelancer the client looped in. We need a clean, low-friction name capture so they can comment without an account, and we need their identity to persist for the share link's session so they don't retype their name on every comment.

## Goal

A single-field "your name" capture wired to localStorage per share link token, with a clear path back to login if they change their mind.

## Scope

The "continue as guest" branch of the gateway modal (PRD 02), and any place in the share page that needs to read the guest's name when posting a comment or action.

## Spec

### Name capture form

When the visitor picks "continue as guest" in the gateway:

- Replace the gateway content with a single-field form: "Your name."
- Validate non-empty after trim, max 64 chars.
- Submit button label: "continue."
- Sub-link below: "actually, log in instead" returns to the gateway.

### Storage

On submit, write to localStorage:

```ts
localStorage.setItem(
  `share-link-guest:${token}`,
  JSON.stringify({ display_name, accepted_at: new Date().toISOString() })
);
```

Read on page load. If present and the share link is still valid, skip the gateway and treat the visitor as a returning guest.

Do not use cookies (we want this to be browser-local, not sent on every request).

### Posting comments as guest

Comment POST body includes `{ author_role: 'guest', author_name: <display_name> }`. The server (PRD 05) verifies the role and ignores any forged user id.

### Switching identity

Footer of the share page has a small "signed in as <name> · switch" control. "Switch" clears the localStorage entry and re-opens the gateway. Useful for a strategist who happened to comment as a guest and wants to re-do it as themselves.

### Edge cases

- localStorage blocked (Safari private mode, etc.): fall back to in-memory state. Page works for the session; refreshing re-prompts. No silent failure, no error.
- Display name contains only whitespace: reject with inline message "please enter your name."
- Display name longer than 64 chars: truncate with a hint, do not silently chop.

## Acceptance

- Guest can enter a name and immediately comment.
- Refresh on the same share link keeps the guest's name.
- Different share link prompts again.
- Clearing localStorage prompts again.
- "Switch" re-opens the gateway with the prior name pre-filled in case they want to fix a typo, not commit to a new identity.

## Out of scope

- Email capture for guests. We don't ask. If they want notifications they can log in.
- Linking a guest comment to a viewer account retroactively. The audit trail keeps them separate forever.

## Dependencies

PRD 02 (gateway). PRD 05 (identity model on the server).

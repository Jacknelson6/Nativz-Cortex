# PRD set: share-link comments + auth gateway

## Why this exists

Today the share-link "request changes" flow is doing three jobs at once. Clients ship revisions through it, but they also drop reactions, ask questions, and leave general feedback in the same thread. We never gave them anywhere else to put that, and we never gave admins any way to act on it in the same surface. We also greet every visitor with a name prompt, which means we lose attribution on every comment from someone who actually has a Cortex account.

This set of PRDs reframes share links as a real review surface:

1. A login-or-guest gateway replaces the name prompt.
2. Logged-in admins on a share link get full operator powers (replace, recover, delete, mark revised, respond).
3. "Request changes" becomes "comments," with explicit comment kinds so revisions stay tracked separately from reactions and questions.
4. Calendar share links (`/c/[token]`) and editing share links (`/c/edit/[token]`) reach one-to-one parity in behavior and code path.

## Non-goals (this set)

- Building a new commenting surface inside the admin dashboard. The thread shows up there as a read-through, no new product.
- Multi-level threading. One reply level only, same as today.
- Real-time presence or cursors.
- Onboarding proposals or intake forms onto the same comment model. Out of scope.
- Replacing Google Chat realtime hooks with a different transport.

## Glossary

- Revision: a comment that explicitly asks for a change. Counts toward unresolved revisions and gates publish.
- Feedback: a comment that's a reaction, question, or observation. Does not gate publish.
- Admin response: a comment authored by an authenticated admin. Never counted as a revision; always a reply or status note.
- Guest: a visitor who entered a display name without logging in.
- Viewer: an authenticated client portal user.
- Admin: an authenticated Cortex team member (admin or super_admin).

## PRDs in this set

Build in order. Each PRD is shippable in isolation behind the `share_link_comments_v2` flag until PRD 09 flips it on.

1. [prd-share-comments-01-comment-types.md](prd-share-comments-01-comment-types.md), Rename request changes to comments. Add `kind` column. Backfill.
2. [prd-share-comments-02-auth-gateway.md](prd-share-comments-02-auth-gateway.md), Replace name prompt with login-or-guest modal.
3. [prd-share-comments-03-guest-mode.md](prd-share-comments-03-guest-mode.md), Guest display name capture and session persistence.
4. [prd-share-comments-04-modal-login.md](prd-share-comments-04-modal-login.md), In-page agency-scoped login modal.
5. [prd-share-comments-05-identity-model.md](prd-share-comments-05-identity-model.md), `author_role` on comments and server-side enforcement.
6. [prd-share-comments-06-admin-controls.md](prd-share-comments-06-admin-controls.md), Admin operator controls on the share page.
7. [prd-share-comments-07-thread-parity.md](prd-share-comments-07-thread-parity.md), Shared thread component across calendar and editing share pages.
8. [prd-share-comments-08-notifications.md](prd-share-comments-08-notifications.md), Single notification dispatcher with an event matrix.
9. [prd-share-comments-09-rollout-qa.md](prd-share-comments-09-rollout-qa.md), Feature flag, migrations, soak, full acceptance matrix.

## Touchpoint inventory (current state)

Anchor files this set touches. Linked here so each PRD can reference without re-listing.

- Calendar share page: [app/c/[token]/page.tsx](app/c/[token]/page.tsx)
- Editing share page: [app/c/edit/[token]/page.tsx](app/c/edit/[token]/page.tsx)
- Calendar comment API: [app/api/calendar/share/[token]/comment/route.ts](app/api/calendar/share/[token]/comment/route.ts)
- Editing comment API: [app/api/editing/share/[token]/comment/route.ts](app/api/editing/share/[token]/comment/route.ts)
- Cover/replace endpoints: [app/api/calendar/share/[token]/cover/[postId]/route.ts](app/api/calendar/share/[token]/cover/[postId]/route.ts), [app/api/calendar/share/[token]/replace-image/[postId]/route.ts](app/api/calendar/share/[token]/replace-image/[postId]/route.ts)
- Comment tables: `post_review_comments`, `editing_project_review_comments` (migrations 011 and 215)
- Share link tables: `content_drop_share_links`, `editing_project_share_links`
- Daily digest cron: [app/api/cron/calendar-comment-digest/route.ts](app/api/cron/calendar-comment-digest/route.ts)

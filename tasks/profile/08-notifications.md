# PRD 08 — Notifications

## Goal

Per-client opt-in/out for every email we send the client, grouped by topic. Replaces `ClientNotificationsSubpage` with a Mobbin-style toggle layout.

## Data model

Existing on `clients`:
- `affiliate_weekly_digest_enabled` boolean
- `social_weekly_digest_enabled` boolean
- `drop_reminder_emails_enabled` boolean
- `revision_webhook_url` text (separate concern — moves to PRD 09)

Confirm at build time. Add booleans if missing via migration 320.

## UI spec

Grouped toggle list (Mobbin Notifications style):

| Group | Toggles |
|---|---|
| Reports | Affiliate weekly digest · Social weekly digest |
| Approvals | Drop reminder · Revision request acks |
| Onboarding | Welcome · Step nudges (already log to `onboarding_emails_log`) |

Each toggle row: label + helper text + toggle. No "save" button — toggles fire `PATCH` on change with optimistic update.

## API

- `PATCH /api/admin/clients/[slug]` — accept any of the boolean fields

## Done criteria

- [ ] All toggles persist via optimistic PATCH
- [ ] Each group renders inside a `WorkspaceSection`
- [ ] Failures revert the toggle + show a toast

## Out of scope

- Per-contact opt-out — that's a deliverability concern, not a per-client toggle
- Sender selection (which agency the email comes from) — that's resolved by `lib/email/resolve-agency-for-user.ts` automatically

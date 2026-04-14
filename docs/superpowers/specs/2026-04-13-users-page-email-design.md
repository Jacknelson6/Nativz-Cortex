# Users-Page Email Composer

**Date:** 2026-04-13
**Status:** Approved, ready for implementation plan
**Scope:** Send emails to one or many users directly from `/admin/users`, with a reusable template library

## Problem

Admins handle follow-ups, reminders, and onboarding touchpoints via their personal inboxes today. That's inconsistent (no brand layout, no log trail), slow (retyping the same follow-up copy), and silently error-prone (sends get forgotten, templates drift across admins). Cortex already has Resend wired for password resets and team invites; the admin users page is the natural surface for ad-hoc outbound, but it currently has no send action.

## Goals

- Send templated or free-form email to a single user or bulk-selected users from `/admin/users`
- A shared template library (CRUD) that all admins see, categorised (followup / reminder / calendar / welcome / general)
- Schedule individual sends for a future date/time (v1: single-shot; multi-step drip sequences are v2)
- Merge fields resolve per recipient at send/schedule time (no manual `[NAME HERE]` placeholders)
- Every send is logged to `activity_log` for auditability
- Brand-aware `from` address and HTML wrapper — matches existing `lib/email/resend.ts` pattern

## Non-goals

- `.ics` calendar attachments — flagged as a follow-up once Nango calendar write-back lands. Meeting-confirmation template body references a scheduling link today.
- Multi-step drip sequences — v1 supports single-shot scheduled sends (pick a date/time once per email). To approximate a 3-touch drip, an admin schedules three individual sends; a built-in sequence builder is v2.
- Open/click tracking — not in v1; Resend exposes webhooks we can wire later
- Email reply handling — replies go to the brand `reply-to` address; admins handle them in their personal mail client
- Rich-text / WYSIWYG editor — Markdown textarea + live preview is sufficient for v1

## Design

### 1. Provider, layout, branding

Resend (already installed at `resend@6.9.4`). Reuse the existing `lib/email/resend.ts` helpers verbatim:

- `getFromAddress()` returns the brand-aware `from` (Nativz or Anderson Collaborative) based on the authenticated admin's `brand_mode`.
- `getReplyTo()` returns the brand-aware reply-to.
- `layout()` wraps the Markdown-rendered body in the branded HTML shell already used by password-reset and team-invite emails.

No new email provider. No new layout.

### 2. Data model — `email_templates`

Single additive table. No changes to existing tables.

```sql
create table email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('followup', 'reminder', 'calendar', 'welcome', 'general')),
  subject text not null,
  body_markdown text not null,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- RLS: admins read + write; viewers no access.
alter table email_templates enable row level security;

create policy email_templates_admin_read on email_templates for select
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
create policy email_templates_admin_write on email_templates for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));

create index email_templates_category_idx on email_templates (category);
```

**Seeded on migration** (6 starter templates so the library opens non-empty):

| Name | Category | Purpose |
|---|---|---|
| Follow-up — day 3 | followup | Gentle nudge after initial meeting |
| Follow-up — day 7 | followup | Second-touch if no reply |
| Reminder — audit ready to review | reminder | Audit results ready for walkthrough |
| Welcome — new client portal access | welcome | Sent when portal invite accepted |
| Meeting confirmation | calendar | Confirms a scheduled meeting; references a scheduling link (pre-`.ics`) |
| Generic (blank) | general | Empty subject + body, starting point for one-offs |

### 3. Merge fields

Resolved at send time against `(recipient user row, sender auth user, attached client if any)`.

| Token | Source |
|---|---|
| `{{user.full_name}}` | `users.full_name` of the recipient |
| `{{user.first_name}}` | first token of `users.full_name` (split on whitespace) |
| `{{user.email}}` | `users.email` of the recipient |
| `{{sender.name}}` | `users.full_name` of the authenticated admin |
| `{{sender.email}}` | `users.email` of the authenticated admin |
| `{{client.name}}` | `clients.name` when the recipient has exactly one `user_client_access` row — empty string if zero or multiple |

Unknown placeholders render as empty string. Recipients with a missing or blank `users.email` are skipped in bulk mode and reported as failures (reason `"recipient has no email"`); in single-recipient mode the route returns 400 before calling Resend. Implementation: a pure function `resolveMergeFields(template: string, context: MergeContext): string` with a test file covering all tokens + the unknown-placeholder case + empty-context.

### 4. API routes

All routes require `users.role = 'admin'` (enforced server-side via the authenticated user row). 403 otherwise.

- `GET /api/admin/email-templates` → `{ templates: EmailTemplate[] }` sorted by category + name
- `POST /api/admin/email-templates` → create; Zod schema for `{ name, category, subject, body_markdown }`
- `PATCH /api/admin/email-templates/[id]` → update; same Zod shape, all fields optional
- `DELETE /api/admin/email-templates/[id]` → delete (soft delete not needed; admins own the library)
- `POST /api/admin/users/[id]/send-email` — single-recipient send
  - Body: `{ subject, body_markdown, template_id?: uuid }`
  - Resolves merge fields, sends via Resend with branded `from` + `layout()`
  - Inserts one row to `activity_log` with `action='user_email_sent'`, metadata `{ template_id, recipient_id, subject }`
  - Returns `{ ok: true, resend_id: string }`
- `POST /api/admin/users/bulk-email` — multi-recipient send
  - Body: `{ user_ids: string[] (min 1, max 100), subject, body_markdown, template_id?: uuid }`
  - Loops recipients, per-recipient merge resolution, per-recipient Resend call, per-recipient `activity_log` row
  - Partial failure tolerant: returns `{ sent: [{ user_id, resend_id }], failed: [{ user_id, error }] }`
  - `maxDuration = 60` (Resend rate limits apply; 100 recipients is safe in window)

### 5. UI — Users page composer

Entry points:
- **Single user** — add "Send email" to the existing per-user card kebab menu (next to Reset password / Delete)
- **Bulk** — add "Send email (N)" to the bulk-select action bar that appears when ≥1 user is checked

Composer modal layout matches the user's reference screenshot:

```
┌────────────────┬──────────────────────────────────────┐
│ Templates      │  To: [jack@nativz.io]  [+ add]       │
│                │                                      │
│ Follow-up      │  Subject: [_______________________]  │
│  · day 3       │                                      │
│  · day 7       │  Body (Markdown):                    │
│ Reminders      │  ┌──────────────────────────────┐    │
│  · audit ready │  │ Hey {{user.first_name}},      │    │
│ Calendar       │  │                               │    │
│  · meeting     │  │ ...                           │    │
│ Welcome        │  └──────────────────────────────┘    │
│  · portal      │                                      │
│                │  [ Preview ] [ Save as template ]    │
│ + New template │                                      │
│                │                             [ Send ] │
└────────────────┴──────────────────────────────────────┘
```

- **Template rail** (left): groups by category, "Blank" pinned at top. Click a template name → subject + body load into the right pane (send mode). Each rail row also has a small **pencil** icon (edit) and **trash** icon (delete) that appear on hover. "+ New template" button at the bottom of the rail opens the same modal in template-edit mode with an empty form.

**Template-edit mode** (toggled when the pencil or "+ New template" is clicked):
- Recipient chips row is replaced with two fields: `name` (text) + `category` (select: followup / reminder / calendar / welcome / general)
- Subject + body editors are unchanged
- Primary button switches to **Save template** (calls `POST` for new, `PATCH` for existing)
- Trash icon on the top-right for existing templates (calls `DELETE`, prompts confirm)
- "Back to send" link returns to send mode pre-filled with this template's content

Edits take effect immediately — the rail refetches after save/delete.
- **Recipient chips** (top of right pane): removable. In bulk mode, shows "Sending to N users" with a peek-expand list.
- **Subject**: single-line input, placeholder `"Subject"`.
- **Body**: monospace textarea, Markdown. No WYSIWYG.
- **Preview toggle** swaps the textarea for the rendered Resend-wrapped HTML with merge fields resolved against the first recipient. Toggle back to keep editing.
- **Save as template**: prompt for `name` + `category`, POSTs to the templates endpoint, refreshes the rail.
- **Send**: disabled until subject + body both non-empty. On click: calls the single or bulk endpoint, shows per-recipient toast(s), closes modal on success. On partial bulk failure, shows a summary banner inside the modal with the failed recipients.

### 6. Logging

Every successful send writes one row to the existing `activity_log` table:

```ts
{
  actor_id: sender.id,
  action: 'user_email_sent',
  entity_type: 'user',
  entity_id: recipient.id,
  metadata: { template_id: string | null, subject: string, resend_id: string },
  created_at: now()
}
```

No new logging table. Failures are NOT logged to `activity_log` (they're returned to the caller); they're left in Resend's dashboard + the server `console.warn` trail.

### 7. Scheduled sends

Admins can send-now or schedule for a future time. Single-shot only — multi-step drip sequences are v2.

**New table — `scheduled_emails`:**

```sql
create table scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references users(id) on delete cascade,
  template_id uuid references email_templates(id) on delete set null,
  subject text not null,
  body_markdown text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  resend_id text,
  failure_reason text,
  scheduled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index scheduled_emails_pending_idx on scheduled_emails (send_at) where status = 'pending';
create index scheduled_emails_recipient_idx on scheduled_emails (recipient_id);

alter table scheduled_emails enable row level security;

create policy scheduled_emails_admin_all on scheduled_emails for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
```

Subject + body are frozen at schedule time (not re-fetched from `email_templates` when the cron fires) so admin edits to a template don't silently rewrite pending sends. Merge fields are also resolved at schedule time and stored already-interpolated.

**UI change in composer:** the primary **Send** button becomes a split button. Default action is "Send now" (existing behaviour). A dropdown exposes "Schedule…" which opens a datetime picker inline. Picking a date + time + confirm creates a `scheduled_emails` row per recipient (bulk-aware) and closes the modal.

**New routes:**

- `POST /api/admin/users/[id]/schedule-email` — single-recipient scheduled send. Body: `{ subject, body_markdown, template_id?, send_at (ISO) }`. Validates `send_at > now() + 1 min` (no past or near-instant scheduling — use Send now instead). Inserts one `scheduled_emails` row.
- `POST /api/admin/users/bulk-schedule-email` — bulk variant. Body: `{ user_ids[], subject, body_markdown, template_id?, send_at }`. Inserts N rows.
- `GET /api/admin/scheduled-emails` → `{ scheduled: ScheduledEmail[] }` with recipient join (`user_id, email, full_name`).
- `DELETE /api/admin/scheduled-emails/[id]` → sets `status = 'cancelled'` (soft so the audit trail survives).
- `PATCH /api/admin/scheduled-emails/[id]` → edit `subject`, `body_markdown`, or `send_at` while `status = 'pending'`. 400 if already sent/failed/cancelled.

**Cron:**

- Endpoint: `GET /api/cron/send-scheduled-emails`
- Vercel cron schedule: `*/1 * * * *` (every minute) — piggybacks the same Vercel Cron config file already used by `weekly-affiliate-report`.
- Logic:
  1. `select * from scheduled_emails where status = 'pending' and send_at <= now() limit 50`
  2. For each row: send via Resend with branded `from` + `layout()` wrapper, using the frozen subject + body.
  3. On success: update row to `status = 'sent'`, `sent_at = now()`, `resend_id = <id>`. Insert `activity_log` row with `action = 'user_email_sent'` and metadata `{ template_id, recipient_id, subject, resend_id, scheduled_email_id }`.
  4. On failure: update row to `status = 'failed'`, `failure_reason = <error.message>`. Log to `console.warn`; do NOT retry in v1 (manual re-schedule is the recovery path).

Protect the endpoint with the `CRON_SECRET` header already used by the affiliate-report cron (`x-vercel-cron` verification or shared secret — match the existing pattern exactly).

**UI — "Scheduled" tab on `/admin/users`:**

New tab at the top of the page: `All users | Scheduled emails (N)`. The Scheduled tab renders a table: `Recipient · Subject · Send at · Status · Actions`. Actions per row: Edit, Cancel. Clicking Edit reopens the composer modal pre-filled with the row's content in "edit scheduled" mode; Save updates via `PATCH`. Rows auto-refresh when the tab is active (every 30s) so newly-sent rows flip to `sent` without a manual refresh.

## Testing

- **Unit:** `resolveMergeFields` pure function — fixtures for every token, the unknown-placeholder case, and an empty-context case.
- **Route:** one end-to-end test per route against a mocked Resend client (`resend.emails.send` returns a fake ID). Asserts auth gate rejects non-admins, Zod rejects bad bodies, success path writes to `activity_log`.
- **Cron:** unit test `send-scheduled-emails` — seed three `scheduled_emails` rows (one due, one future, one already-sent). Assert the cron sends only the due one, updates status, and leaves the others alone.
- **Manual QA:** send a templated + a blank email to a real test user from the dev server. Schedule a send 2 minutes out. Open the inbox, verify branding + merge fields + reply-to. Check the Scheduled tab flips `pending → sent` after cron fires.

## Rollout

Single branch, direct to `main` per Jack's preference. One migration file for the `email_templates` table + seed rows. No feature flag — the Send Email action appears for admins on first load after deploy.

## Open questions

None — all design decisions resolved in brainstorm.

# Revenue Hub + Proposals

Read when working on `/admin/revenue`, `/admin/proposals`, `/portal/billing`, `/proposals/[slug]`, the Stripe webhook, or per-client billing.

## Surfaces

### Admin
- `/admin/revenue` — MRR / invoices / subs / clients / ad-spend / activity
- `/admin/clients/[slug]/billing` — per-client
- `/admin/proposals` — list + editor
- `/admin/proposals/new` — draft
- `/admin/proposals/[slug]` — editor (autosaves, status-guarded to draft-only)

### Portal
- `/portal/billing` — RLS-scoped (policies on `stripe_*` + `client_ad_spend` + `client_lifecycle_events`)

### Public
- `/proposals/[slug]` — no auth, rate-limited. Reads from `proposals.sent_snapshot` once sent so the signer always sees the version they agreed to.

## Stripe

- Webhook: `/api/webhooks/stripe` (signature-verified, idempotent via `stripe_events`)
- Required events list: see `docs/superpowers/specs/2026-04-23-revenue-hub-design.md` §14 and the round-2 commit message
- Keys live in `.env.local` only; mirror to Vercel with `npm run vercel:env:mirror` once the token has full-account scope

## Lifecycle event types

Stored in `client_lifecycle_events.type`:

- `invoice.*`
- `subscription.*`
- `onboarding.advanced`
- `kickoff.*`
- `contract.*`
- `proposal.sent` | `viewed` | `signed` | `paid` | `expired`
- `ad_spend.recorded`

## Notification types (admin bells)

`payment_received`, `invoice_overdue`, `invoice_sent`, `invoice_due_soon`, `contract_signed`, `subscription_created` | `canceled` | `paused` | `resumed` | `updated`

## Meta Ads sync

- Per-client `meta_ad_account_id` on `clients`
- `META_APP_ACCESS_TOKEN` env, passed via `Authorization: Bearer`
- Daily cron at `/api/cron/meta-ads-sync`

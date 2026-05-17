# PRD 09 — Integrations & Webhooks

## Goal

One home for every external connection a client has. Mobbin-style Integrations layout: **Connected**, **Featured**, **Discover**. Webhooks live as an inline card at the bottom.

This is the last PRD before killing `/settings/*`.

## Data model

### Existing
- `clients.uppromote_api_key` (UpPromote affiliate)
- `clients.revision_webhook_url`
- Zernio connections live in `step_state.social_handles.connections[]` JSONB on `onboardings` (PRD 10 will move these to a real table)

### New (PRD 10 hard-deps this) — `client_social_accounts`

```sql
create table if not exists client_social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok','youtube','facebook','linkedin','x')),
  handle text,
  external_account_id text,
  connection_status text not null default 'pending'
    check (connection_status in ('pending','connected','disconnected','error')),
  connected_via text not null check (connected_via in ('zernio','manual','meta_business_suite')),
  metadata jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform)
);
```

The Zernio webhook handler updates this table going forward instead of `onboardings.step_state`.

## UI spec

### Connected section
Real connections with status pill (connected / pending / error / disconnected). Per row: platform icon, handle, status, "Reconnect" or "Disconnect" pill.

Includes: socials, UpPromote, any future Stripe/Linear/whatever.

### Featured section
Integrations the client *could* connect but hasn't: Zernio social connect, UpPromote, Meta Business Suite. Each is a card with an "Connect" CTA that opens the relevant flow.

### Discover section
Lower-priority / niche integrations not yet relevant to most clients (Brevo for email, custom webhooks). Collapsed by default.

### Webhooks card (separate `WorkspaceSection` below)
- Revision webhook URL (existing field)
- Future: drop status webhook, scheduler-event webhook
- Each row: name, URL input, "Test" button, "Disable" toggle

## API

- `GET /api/admin/clients/[slug]/integrations-summary` — single fetch for the page
- `POST /api/admin/clients/[slug]/integrations/[key]/connect` — kicks off the OAuth/manual flow
- `POST /api/admin/clients/[slug]/integrations/[key]/disconnect`
- `PATCH /api/admin/clients/[slug]/webhooks` — accept the webhook URL fields

## Done criteria

- [ ] Connected section reflects `client_social_accounts` rows live
- [ ] UpPromote status reads from `clients.uppromote_api_key` presence
- [ ] Disconnect flips `connection_status` to `disconnected`, does NOT delete the row
- [ ] Webhook URL validates as `https://...`
- [ ] Test-webhook button POSTs an empty `{ test: true }` and surfaces the response status

## Out of scope

- Building net-new integrations (e.g. Stripe sync) — only port existing connections to the new chrome

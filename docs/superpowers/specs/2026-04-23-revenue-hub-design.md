# Revenue Hub — design

**Date:** 2026-04-23
**Status:** Approved (Jack pre-authorized — "plans are always approved"; self-driven build)
**Owner:** Jack
**Implementer:** Claude

## 1. Problem

Nativz runs a service business: clients sign contracts, pay invoices, get onboarded, and we run services (video editing, SMM, affiliate, paid media). Today that full loop is split across Stripe, ContractKit, spreadsheets, Google Calendar, and the existing admin dashboard. There is no single page that answers:

- Who owes us money right now, and how much?
- What's our MRR / ARR? Which clients are on which plans?
- For client X: what have they paid, what are they contracted for, what's the status of onboarding, what are we spending on their ads?
- Did this invoice actually get paid, and did onboarding auto-advance when it did?

The Revenue Hub is the page that answers those questions and closes the loop between "invoice paid" and "onboarding advances / admins are notified / kickoff is scheduled."

## 2. Non-goals (for this build)

These are interesting but explicitly **out of scope** to keep the session shippable:

- **ContractKit bidirectional integration.** ContractKit has no public API, SDK, or outbound webhook — it's a self-deploy Cloudflare Pages template per agency ([research findings below](#contractkit-reality-check)). MVP stores contract URL/PDF and status manually; a future task can add polling or a shared ContractKit instance.
- **Creating Stripe invoices/subscriptions from Cortex.** MVP is read-only sync + reconciliation. Creation stays in the Stripe dashboard for now. Adding "New invoice" / "New subscription" is a fast follow.
- **Automated Meta Ads spend sync.** Clients already have `meta_access_token_encrypted`, but the boosting-spend API integration is its own project. MVP allows **manual entry** of ad spend and boost budgets; Meta Ads auto-sync is a follow-up.
- **Agency-side AP beyond ad spend.** Payroll AP already lives in `payroll_entries` (migration 116). MVP does not touch that; it reads from it for net-margin display.
- **Dunning / collection automation.** MVP surfaces overdue invoices with a "send reminder" button that uses existing Resend templates. Multi-step dunning sequences are a follow-up.
- **Client-portal billing UI.** Revenue Hub is admin-only. Portal users will get a read-only billing tab in a separate spec.

## 3. ContractKit reality check

Research summary (see `Agent` exploration result earlier in session log):

- `github.com/andersoncollab/contract-kit` is a self-deploy Cloudflare Pages template, not a SaaS.
- No public REST API, no SDK, no outbound webhook.
- `docs.andersoncollaborative.com/api/stripe-webhook` is an *inbound* endpoint Stripe calls — not something we'd consume.
- The signing record lives in Cloudflare KV inside each agency's deployment.

**Decision for MVP:** treat ContractKit as a link. Add `external_provider` and `external_url` columns to `client_contracts`, plus a manual "mark as sent / signed / paid" admin action. When the ContractKit-side Stripe webhook fires (to AC's deployment), AC already records the deposit — we just mirror the Stripe side via our own webhook (see §6). Bidirectional sync with ContractKit is a tracked follow-up.

## 4. UX

### 4.1 Navigation

- New top-level admin nav item **"Revenue"** under the **Manage** section of the sidebar (`components/layout/admin-sidebar.tsx`), next to Accounting. Title Case per the sidebar-memory rule.
- Route: `/admin/revenue`
- Client-scoped billing lives at `/admin/clients/[slug]/billing` and is linked from the client workspace subnav next to Contract.

### 4.2 `/admin/revenue` tabs

Uses the existing `SectionTabs` + `SectionPanel` + `SectionCard` pattern (matches `/admin/accounting` and new `/admin/infrastructure` style).

| Tab | Content |
| --- | --- |
| **Overview** | KPI tiles: MRR, ARR, net new MRR this month, revenue MTD/YTD, AR outstanding, AR overdue, active subscriptions, churned this month. Two charts: monthly revenue (last 12 mo) + AR aging (0–30 / 31–60 / 61–90 / 90+). Recent events feed (invoice paid, subscription created, contract signed) pulling from `client_lifecycle_events`. |
| **Invoices** | Filterable table: client, number, status (draft/open/paid/void/uncollectible), amount, due, paid date, hosted-invoice URL. Row action: "send reminder" (Resend), "view in Stripe" (deep link). |
| **Subscriptions** | Active subs: client, product/price nickname, amount, billing cycle, next invoice date, MRR contribution, started_at, status. Collapsible group per client. |
| **Clients** | Per-client billing panel: lifetime revenue, MRR, open AR, subs count, contract status, onboarding status, boosting budget vs spend MTD, net margin (revenue − payroll allocation − ad spend − refunds). Sorted by MRR desc. Click-through to `/admin/clients/[slug]/billing`. |
| **Ad spend** | Manual entry ledger: client, platform (meta/google/tiktok/other), campaign label, spend cents, period (month), boost-budget cents (monthly cap). Supports bulk CSV paste. A future Meta Ads sync populates this automatically. |
| **Activity** | Raw `client_lifecycle_events` feed across all clients. Filter by type (contract.sent, contract.signed, invoice.created, invoice.paid, invoice.overdue, subscription.created, subscription.canceled, onboarding.advanced, kickoff.scheduled). |

### 4.3 `/admin/clients/[slug]/billing`

Single page, three stacked `SectionCard`s:

1. **Summary** — MRR, lifetime revenue, open AR, next invoice, subscription count, contract status pill, onboarding status pill.
2. **Invoices** — this client's invoices only.
3. **Subscriptions** — this client's active subs + canceled history.
4. **Contracts** — existing `client_contracts` list, now with `external_url` + "Send invoice" action that jumps to Stripe dashboard with the `customer=` prefilled (no create-in-Cortex in MVP).
5. **Ad spend** — this client's ad-spend ledger + boost-budget card.
6. **Lifecycle** — filtered `client_lifecycle_events` for this client.

## 5. Data model

All amounts stored as **integer cents** (matches `payroll_entries` convention). All `stripe_*_id` columns are `text` unique. RLS admin-only by default; portal access comes in a later spec.

### 5.1 Stripe mirror tables

The goal is **denormalized mirrors** of what we need for fast UI, not a complete Stripe mirror. Anything we don't use, we don't store. Raw Stripe payloads go in a `stripe_events` table for debugging.

```sql
-- Mirror of Stripe customers
CREATE TABLE stripe_customers (
  id text PRIMARY KEY,                -- Stripe customer id (cus_…)
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  email text,
  name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz,             -- Stripe's created_at
  synced_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false
);

-- Mirror of Stripe invoices
CREATE TABLE stripe_invoices (
  id text PRIMARY KEY,
  customer_id text REFERENCES stripe_customers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,  -- denormalized from customer_id for query speed
  number text,
  status text NOT NULL,               -- draft|open|paid|uncollectible|void
  amount_due_cents int NOT NULL,
  amount_paid_cents int NOT NULL,
  amount_remaining_cents int NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  subscription_id text,               -- null for one-off
  hosted_invoice_url text,
  invoice_pdf text,
  due_date timestamptz,
  finalized_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Mirror of Stripe subscriptions
CREATE TABLE stripe_subscriptions (
  id text PRIMARY KEY,
  customer_id text REFERENCES stripe_customers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  status text NOT NULL,               -- active|past_due|canceled|incomplete|trialing|unpaid|paused
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  started_at timestamptz,
  -- flattened first-item fields (fine because ~all our subs are single-item)
  price_id text,
  product_id text,
  product_name text,
  price_nickname text,
  unit_amount_cents int,
  interval text,                      -- month|year|week|day
  interval_count int,
  quantity int,
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- full item list for edge cases
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  livemode boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Mirror of successful Stripe charges (for refund + net revenue tracking)
CREATE TABLE stripe_charges (
  id text PRIMARY KEY,
  customer_id text REFERENCES stripe_customers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  invoice_id text REFERENCES stripe_invoices(id) ON DELETE SET NULL,
  amount_cents int NOT NULL,
  amount_refunded_cents int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,               -- succeeded|pending|failed
  paid boolean NOT NULL,
  refunded boolean NOT NULL DEFAULT false,
  failure_code text,
  failure_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Raw event log (for replay + debugging)
CREATE TABLE stripe_events (
  id text PRIMARY KEY,                -- Stripe event id (evt_…)
  type text NOT NULL,                 -- invoice.paid, customer.subscription.created, etc.
  api_version text,
  livemode boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
```

### 5.2 Client link

```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'lead',
  -- lead | contracted | paid_deposit | active | churned
  ADD COLUMN IF NOT EXISTS mrr_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boosting_budget_cents int NOT NULL DEFAULT 0;
```

`mrr_cents` is a denormalized cache recomputed whenever subs change (via trigger or sync function). `lifecycle_state` is advanced by the lifecycle state machine (§6.3).

### 5.3 Client contracts — ContractKit-aware

```sql
ALTER TABLE client_contracts
  ADD COLUMN IF NOT EXISTS external_provider text,      -- 'contractkit' | 'pandadoc' | 'manual' | null
  ADD COLUMN IF NOT EXISTS external_id text,            -- ContractKit `signing id`
  ADD COLUMN IF NOT EXISTS external_url text,           -- proposal/signing URL
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_invoice_id text REFERENCES stripe_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_cents int,
  ADD COLUMN IF NOT EXISTS deposit_cents int;
```

### 5.4 Ad spend ledger

```sql
CREATE TABLE client_ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'youtube', 'other')),
  campaign_label text,
  period_month date NOT NULL,                    -- first day of month: 2026-04-01
  spend_cents int NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meta_api', 'google_api', 'tiktok_api', 'import')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform, campaign_label, period_month)
);
CREATE INDEX client_ad_spend_client_period_idx ON client_ad_spend (client_id, period_month DESC);
```

### 5.5 Lifecycle events

Event-sourced audit log for the "contract → invoice → onboarding → kickoff" loop:

```sql
CREATE TABLE client_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL,
  -- contract.sent, contract.signed, contract.voided,
  -- invoice.created, invoice.paid, invoice.overdue, invoice.voided,
  -- subscription.created, subscription.updated, subscription.canceled,
  -- onboarding.advanced, kickoff.scheduled, kickoff.completed,
  -- ad_spend.recorded
  title text NOT NULL,                    -- human-readable ("Invoice #INV-0042 paid — $1,500.00")
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_event_id text,                   -- cross-ref to stripe_events.id when applicable
  actor_user_id uuid REFERENCES auth.users(id),  -- null when system-generated
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_lifecycle_events_client_occurred_idx ON client_lifecycle_events (client_id, occurred_at DESC);
CREATE INDEX client_lifecycle_events_type_idx ON client_lifecycle_events (type);
```

### 5.6 RLS

Admin-only for every new table (matches `payroll_*` RLS). Migration sets `ENABLE ROW LEVEL SECURITY` + admin policy patterned on `116_accounting.sql`.

## 6. Stripe integration

### 6.1 Env vars

Added to `.env.local` (gitignored) and `.env.example` (names only):

```
STRIPE_SECRET_KEY                 # sk_live_…  (server-side only)
STRIPE_RESTRICTED_KEY             # rk_live_…  (reserved — not used in MVP but present for future read-only tasks)
STRIPE_PUBLISHABLE_KEY            # pk_live_…  (client-side, but unused in MVP — no checkout UI)
STRIPE_WEBHOOK_SECRET             # whsec_…
STRIPE_WEBHOOK_ENDPOINT_ID        # we_…       (optional, metadata only)
CRON_SECRET                       # existing pattern — check if already set, add if missing
```

Secret retrieval uses the existing `getSecret()` pattern in `lib/env/` (follows `RESEND_API_KEY` style) so keys can be rotated without redeploy.

### 6.2 `lib/stripe/` module

```
lib/stripe/
├── client.ts         # getStripe() — memoized Stripe client, API version pinned
├── types.ts          # InvoiceStatus, SubscriptionStatus unions + Zod schemas
├── customers.ts      # upsertCustomerFromStripe(c) — maps cus -> stripe_customers row + links clients.stripe_customer_id by matching email
├── invoices.ts       # upsertInvoiceFromStripe(i)
├── subscriptions.ts  # upsertSubscriptionFromStripe(s) + recomputeClientMrr(clientId)
├── charges.ts        # upsertChargeFromStripe(ch)
├── backfill.ts       # fullSync(livemode: boolean) — pagination + progress logging
└── mrr.ts            # computeMrr(items) helpers (annual → monthly prorate, etc.)
```

API version: pin to the latest stable at build time (`'2025-10-28.acacia'` or whatever `stripe` package ships with at `npm i`; code falls back to SDK default if pin is wrong).

### 6.3 Webhook route

`app/api/webhooks/stripe/route.ts`

- POST only. Reads raw body with `await req.text()` (signature verification needs raw).
- `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` — returns 400 on signature failure.
- Idempotency: `INSERT INTO stripe_events (id, …) ON CONFLICT (id) DO NOTHING RETURNING id` — if no row returned, event already processed, return 200 early.
- Switch on `event.type`:
  - `customer.created|updated|deleted` → `upsertCustomerFromStripe`
  - `invoice.created|updated|finalized|paid|payment_failed|voided|marked_uncollectible` → `upsertInvoiceFromStripe` + lifecycle event + (if `paid`) `onInvoicePaid()`
  - `customer.subscription.created|updated|deleted` → `upsertSubscriptionFromStripe` + `recomputeClientMrr`
  - `charge.succeeded|charge.refunded|charge.failed` → `upsertChargeFromStripe`
- Mark `stripe_events.processed_at = now()` on success, `processing_error = err.message` on failure. Always return 200 after successful verification so Stripe doesn't keep retrying — unless the handler genuinely cannot complete (DB down), in which case return 500 and Stripe retries.
- Route config: `runtime = 'nodejs'`, `maxDuration = 30` (Vercel Fluid Compute default is 300s, but webhook should be fast — 30s hard cap is safer).

### 6.4 Lifecycle state machine

`lib/lifecycle/state-machine.ts`

`onInvoicePaid(invoice)`:
1. Resolve `clientId` via `stripe_invoices.client_id` (denormalized at upsert from customer mapping).
2. If client has an `onboarding_trackers` row with `status='active'` and a first phase in `not_started` state, advance that phase to `in_progress`.
3. If the paid invoice is flagged as a deposit invoice (linked via `client_contracts.deposit_invoice_id`), advance `clients.lifecycle_state` from `contracted` → `paid_deposit`.
4. Insert `client_lifecycle_events` row `type='invoice.paid'`.
5. Create `notifications` rows for all admins (`users.role IN ('admin','super_admin') OR is_super_admin=true`) — type `'engagement_spike'` for now (existing enum; a new type `'payment_received'` in the same migration).
6. Queue a "kickoff scheduling" email via Resend using the existing `onboarding_email_templates` lookup — template name `kickoff_invitation` (seeded in migration if not present). Email goes to the client primary contact, CCs Jack. Merge fields use the existing `merge-fields.ts` system.

`onSubscriptionCreated(subscription)`:
- Set `clients.lifecycle_state = 'active'` if currently `paid_deposit`.
- Insert lifecycle event.

`onSubscriptionCanceled(subscription)`:
- If this was the client's only active sub, set `clients.lifecycle_state = 'churned'`.
- Insert lifecycle event.

`onInvoiceOverdue(invoice)`:
- Triggered by daily cron (§6.5), not a webhook — Stripe emits `invoice.payment_failed` but not a specific overdue event.

### 6.5 Backfill + daily cron

**Backfill script:** `scripts/stripe-backfill.ts` — one-shot import of all existing customers, invoices, subscriptions, charges into the mirror tables. Paginates Stripe list APIs, writes through the same `lib/stripe/*` upsert functions. Run via `npx tsx scripts/stripe-backfill.ts` (auto-invoked by `npm run revenue:backfill`).

**Daily cron:** `app/api/cron/revenue-reconcile/route.ts` — `0 9 * * *` (every day 9am UTC). Auth: `Bearer CRON_SECRET`. Does:
1. Pulls Stripe customers/invoices/subs updated in the last 48h (defense in depth — catches any missed webhooks).
2. Marks invoices past `due_date` with status `open` as `overdue` internally (doesn't change Stripe status) and fires `onInvoiceOverdue`.
3. Recomputes each client's `mrr_cents` from current `stripe_subscriptions`.

Wired in `vercel.json` under `crons`.

## 7. API routes

All follow the project auth + Zod pattern (see `/app/api/admin/active-client/route.ts` reference).

| Method + path | Purpose |
| --- | --- |
| `POST /api/webhooks/stripe` | Stripe webhook sink (public, signature-verified) |
| `GET  /api/revenue/overview` | KPI tiles + recent events for Overview tab |
| `GET  /api/revenue/invoices` | Paginated invoice list with filters (status, client, range) |
| `GET  /api/revenue/subscriptions` | Active + canceled subs grouped by client |
| `GET  /api/revenue/clients` | Per-client billing summary rows |
| `GET  /api/revenue/events` | Lifecycle event feed with filters |
| `POST /api/revenue/invoices/:id/remind` | Send Resend reminder email for an open invoice |
| `GET/POST/PATCH/DELETE /api/revenue/ad-spend` | CRUD ad-spend entries |
| `POST /api/revenue/ad-spend/bulk` | CSV paste import |
| `POST /api/revenue/clients/:id/link-stripe` | Manually link a `cus_…` to a client (when email doesn't match) |
| `POST /api/cron/revenue-reconcile` | Daily reconcile (CRON_SECRET auth) |

## 8. UI components

New:
- `components/admin/revenue/revenue-tabs.tsx` — tab config
- `components/admin/revenue/overview-tab.tsx` — KPI tiles + charts
- `components/admin/revenue/invoices-tab.tsx` — table with filters
- `components/admin/revenue/subscriptions-tab.tsx` — grouped sub list
- `components/admin/revenue/clients-tab.tsx` — per-client billing grid
- `components/admin/revenue/ad-spend-tab.tsx` — ledger table + add form + CSV paste
- `components/admin/revenue/activity-tab.tsx` — lifecycle event feed
- `components/admin/revenue/kpi-tile.tsx` — reusable tile (number + delta + sparkline)
- `components/admin/revenue/status-pill.tsx` — reuse existing `StatusPill` with new status variants
- `components/admin/revenue/cache.ts` — cache tag + TTL (5 min, matches accounting)

Client-scoped:
- `app/admin/clients/[slug]/billing/page.tsx`
- `components/admin/clients/billing/*` — per-client variants of the above

Reuses: `SectionHeader`, `SectionTabs`, `SectionPanel`, `SectionCard`, `Metric`, `Disclosure`, `StatusPill`, `RefreshButton` — all already in the codebase.

## 9. Money handling

- Every column storing money is `int` cents — no floats, no decimals.
- Display helper `formatCents(cents, currency='usd')` in `lib/format/money.ts` (new) — single source of truth.
- MRR computation: convert annual subs → monthly (`unit_amount / 12`), weekly → `unit_amount * 52 / 12`, daily → `* 30`. Edge cases in `lib/stripe/mrr.ts` with unit tests.
- All calculations happen in cents, formatting happens only at render.

## 10. Error handling

- Stripe webhook returns 400 for bad signature, 200 for duplicate (idempotent replay), 500 for genuine handler failure (so Stripe retries).
- Sync functions are idempotent: `INSERT … ON CONFLICT (id) DO UPDATE SET … , synced_at = now()`.
- Missing customer-to-client link: row is written with `client_id = null` and an admin notification fires so Jack can manually link via `/api/revenue/clients/:id/link-stripe`.
- Resend send failures are logged to `client_lifecycle_events` with type `kickoff.scheduled` and `metadata.error = "…"` — the event fires regardless, so history is preserved.
- All new API routes use the standard 401/400/403/404/500 pattern.

## 11. Security

- Live Stripe keys are stored in `.env.local` only (gitignored). `.env.example` lists names without values. Never committed, never logged. `lib/stripe/client.ts` reads via `getSecret('STRIPE_SECRET_KEY')` so keys can be rotated via the secrets store.
- Webhook secret verification is mandatory — a Stripe-signed request is the only way events enter the system.
- All `/api/revenue/*` routes require `users.role IN ('admin','super_admin') OR is_super_admin=true`.
- Public access: none. Portal billing page is a separate future spec.

## 12. Testing strategy

- `lib/stripe/mrr.test.ts` — unit tests for MRR prorate logic.
- `lib/lifecycle/state-machine.test.ts` — covers onInvoicePaid advancing onboarding + creating notification + firing email (Resend mocked).
- `scripts/stripe-backfill.ts --dry-run` — logs what would be imported without writes, sanity check before running live.
- E2E: Stripe CLI `stripe trigger invoice.paid` against local dev → verify `client_lifecycle_events`, `notifications`, and the kickoff email draft appear.
- Typecheck (`npx tsc --noEmit`) + lint (`npm run lint`) must pass before commit.

## 13. Migration order

`supabase/migrations/154_revenue_hub.sql` — single migration, idempotent (all `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`):

1. `stripe_customers`, `stripe_invoices`, `stripe_subscriptions`, `stripe_charges`, `stripe_events`
2. `client_ad_spend`
3. `client_lifecycle_events`
4. `ALTER TABLE clients` (add stripe_customer_id, lifecycle_state, mrr_cents, boosting_budget_cents)
5. `ALTER TABLE client_contracts` (ContractKit fields)
6. `ALTER TABLE notifications` (extend CHECK constraint to include `payment_received`)
7. `INSERT INTO onboarding_email_templates` — seed a `kickoff_invitation` template if not present
8. RLS + policies (admin-only)

Applied via Supabase MCP `apply_migration` during implementation (no manual dashboard step).

## 14. Sequencing for this session

1. Write spec (this file) + commit.
2. Install `stripe` package, set env vars in `.env.local` + names in `.env.example`.
3. Apply migration 154 via Supabase MCP.
4. Build `lib/stripe/*` + `lib/lifecycle/*` + `lib/format/money.ts`.
5. Build `/api/webhooks/stripe` + `/api/revenue/*` + `/api/cron/revenue-reconcile`.
6. Build `/admin/revenue/page.tsx` + all tab components.
7. Build `/admin/clients/[slug]/billing/page.tsx`.
8. Add sidebar nav entry + client subnav link.
9. Typecheck + lint + dev-server smoke test (screenshot via Playwright MCP on `/admin/revenue`).
10. Write `scripts/stripe-backfill.ts` + run it against live Stripe account (read-only).
11. Commit + push to main.

## 15. Follow-up tasks (out of scope today)

- ContractKit polling / shared instance integration
- Meta Ads spend sync
- Create-invoice / create-subscription flow from Cortex UI
- Multi-step dunning sequences
- Portal-side billing tab
- Stripe checkout flow for new-client onboarding (embedded in `/admin/onboarding`)
- Tax + Stripe Tax integration
- Refund issuance from Cortex UI
- Rev-rec accounting exports (QuickBooks / CSV)

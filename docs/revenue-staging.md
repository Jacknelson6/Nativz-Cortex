# Revenue staging + QA

This is the playbook for walking through the Revenue Hub and Proposals flow end-to-end against seeded data before shipping a change. If a feature hasn't been clicked through here, it isn't done.

## One-time setup

### 1. Stripe test-mode keys

Live keys in `.env.local` will charge real cards. For staging, use **test mode**:

1. Stripe dashboard → toggle to **Test mode** (top-right).
2. Developers → API keys → copy the secret key (`sk_test_...`).
3. Replace `STRIPE_SECRET_KEY` in `.env.local` with the test key. Back up the live key somewhere safe first — you'll swap back before pushing.

### 2. Webhook forwarding

```bash
# install once
brew install stripe/stripe-cli/stripe

# sign in
stripe login

# forward (keep this running in a terminal while testing)
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

The CLI prints a `whsec_...` secret — **temporarily** replace `STRIPE_WEBHOOK_SECRET` in `.env.local` with that value so signature verification works locally.

### 3. Seed the fixtures

```bash
npm run seed:staging
```

Seeds three clients (`fixture-a` active, `fixture-b` prospect, `fixture-c` churned), one contact each, one proposal per status (`draft`, `sent`, `signed`), and three months of ad spend rows. Idempotent — safe to re-run.

If `STRIPE_SECRET_KEY` is a test key, the script also creates a Stripe customer per fixture client and links it via `stripe_customer_id`.

## QA checklist — payment-adjacent features

Before marking any revenue/proposals/lifecycle change done, walk through:

### Revenue Hub
- [ ] `/admin/revenue` overview — KPIs render, "Recent activity" shows at least one event
- [ ] Invoices tab — filter by status works, refund button appears on paid invoices
- [ ] Subscriptions tab — active subs visible, MRR sums correctly
- [ ] Clients tab — lifetime revenue matches `SUM(paid) − SUM(refunded)` per client
- [ ] Ad spend tab — seeded rows appear, add/edit/delete work
- [ ] Anomalies tab — shows at minimum the stale-Meta-sync detector for fixtures
- [ ] QuickBooks CSV — download + open in Excel, totals row at bottom matches sum

### Proposals
- [ ] `/admin/proposals` — all three fixture proposals visible
- [ ] Click "New proposal" — create a draft, add a package, add a deliverable
- [ ] Autosave indicator flips to "Saved"; disconnect from wifi briefly → "Save failed — retry"
- [ ] Click Send — Stripe Payment Link created, status flips to `sent`
- [ ] Open incognito `/proposals/<slug>` — public page renders snapshot, not live edits
- [ ] Try to sign with a different email than invited → rejected
- [ ] Sign with matching email → status flips to `signed`, client_contracts row appears, admin notification fires
- [ ] Click deposit Payment Link → use Stripe test card `4242 4242 4242 4242` → `/proposals/<slug>/paid` lands
- [ ] Webhook hits `/api/webhooks/stripe` → proposal status flips to `paid`, lifecycle event logged

### Portal billing
- [ ] `/portal/billing` as a viewer (use `/scripts/magic-link.ts` to auth) — invoices scoped to the fixture client
- [ ] Ad spend table shows human-readable "Auto-synced (Meta)" / "Manual" labels
- [ ] Lifetime KPI respects refunds (seed a refund via Stripe dashboard → value drops)

### Webhook scenarios (use `stripe trigger`)

```bash
stripe trigger customer.created
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.deleted
stripe trigger customer.subscription.paused
stripe trigger customer.subscription.resumed
stripe trigger refund.created
stripe trigger checkout.session.completed
```

After each, confirm:
- `stripe_events` row inserted
- `processed_at` set within 5 seconds
- Correct lifecycle event logged
- Correct admin notification fired (where applicable)

### Anomalies

Force an anomaly to appear:

- Insert a Stripe invoice with `client_id = null` but `customer_id` pointing at a linked customer. Run cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/revenue-anomalies`. Check `/admin/revenue?tab=anomalies`.
- Dismiss it with a reason. Re-run cron → should not come back.

## Switching back to live

Before pushing:

1. Restore `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to live values
2. Stop `stripe listen`
3. Run `npm run lint && npx tsc --noEmit && npx vitest run -c app/vitest.config.ts` — all green before commit

## Fixture cleanup

The seed is idempotent — leaving it in your DB is harmless. To remove:

```sql
delete from clients where id in (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000002',
  '00000000-0000-4000-a000-000000000003'
);
```

Cascading FKs clean up proposals / ad spend / lifecycle events / contacts.

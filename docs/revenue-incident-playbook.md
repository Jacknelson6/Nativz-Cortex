# Revenue incident playbook

What to do, in order, when you suspect a production incident in the Revenue Hub, Proposals, or Stripe integration. Written for an on-call moment — skim the top, not the whole doc.

## First five minutes

1. **Check `/admin/revenue?tab=anomalies`** — if the detector cron caught it, the finding is already there with a rationale.
2. **Check `/admin/infrastructure`** — Vercel runtime logs, cron status, recent deployments.
3. **Check Stripe dashboard → Developers → Events** — see the last 50 events + delivery status.
4. **Check Vercel Functions logs** — filter for `/api/webhooks/stripe` and `/api/cron/revenue-*`.
5. **Check `stripe_events` table** — rows with `processed_at IS NULL` + `processing_error` set.

## Classifying the incident

| Signal | Likely cause | Jump to |
| --- | --- | --- |
| Clients emailing "I got 3 welcome emails" | Kickoff-once guard broken or migration missing | §A |
| Admin sees wrong MRR / lifetime | Refund math regressed, MRR drift detector firing | §B |
| Client paid but onboarding didn't advance | Webhook failed to process | §C |
| Runaway email loop (clients get email every minute) | Cron loop bug | §D |
| Accidental live charge in staging | Keys mixed, need refund + rotation | §E |
| Stripe key leaked | Rotate | §F |

---

## §A — Duplicate email loop

**Stop the bleeding:**

1. Disable Resend API key — Resend dashboard → API keys → pause. Cuts off every transactional email in Cortex (including onboarding, reminders, reports). Revisit within an hour.
2. Check `onboarding_email_sends` for recent dupes:
   ```sql
   select tracker_id, count(*) from onboarding_email_sends
   where sent_at > now() - interval '24 hours'
   group by tracker_id order by count(*) desc;
   ```
3. Apologize-to-client SQL query (let Jack handle the actual email):
   ```sql
   select c.id, c.name, co.email
   from onboarding_email_sends e
   join onboarding_trackers t on t.id = e.tracker_id
   join clients c on c.id = t.client_id
   left join contacts co on co.client_id = c.id and co.is_primary
   where e.sent_at > now() - interval '24 hours'
   group by c.id, c.name, co.email
   having count(*) > 1;
   ```
4. Find the root cause in `lib/lifecycle/state-machine.ts` → `queueKickoffEmail` — is `kickoff_email_sent_at` being read + set?
5. After fix deploys, re-enable Resend.

## §B — Wrong revenue numbers

1. Check the MRR drift detector in `/admin/revenue?tab=anomalies`. It lists every client with cached vs live divergence.
2. Force-recompute MRR for a specific client:
   ```sql
   select recomputeClientMrr('<client_id>'); -- (actually call via API, no RPC exists yet)
   ```
   Or hit the daily cron manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://cortex.nativz.io/api/cron/revenue-reconcile
   ```
3. If refund math is wrong, confirm `netLifetimeRevenueCents` is the helper in use at every site — grep for any remaining `SUM(amount_paid_cents)`.

## §C — Webhook didn't process

**Replay the event:**

1. Find the event in `stripe_events`:
   ```sql
   select id, type, processing_error, received_at
   from stripe_events
   where processed_at is null
   order by received_at desc
   limit 10;
   ```
2. In Stripe dashboard → Developers → Events → find the event → "Resend to endpoint". This is the safest path — fully idempotent because our webhook dedupes on `stripe_events.id`.
3. If replay also fails, check `processing_error` column for the stack, fix in code, redeploy, replay.

## §D — Runaway email loop (more than 1 email per client per minute)

1. **Immediately disable Resend API key** (as §A step 1).
2. **Find the cron or handler firing the loop.** Most likely: `/api/cron/revenue-reconcile`, `/api/cron/onboarding-notifications`, or a webhook handler.
3. **Disable the cron temporarily:** remove the entry from `vercel.json` and deploy.
4. **Find the unguarded branch** (usually a missing `if (already_sent) return;`).
5. **Re-enable Resend only after the code deploys.**

## §E — Live charge in staging

1. Refund in Stripe dashboard → Payments → click the charge → Refund.
2. Rotate both keys: Stripe dashboard → Developers → API keys → Roll.
3. Update Vercel env + `.env.local` with new keys.
4. Write a post-mortem in `docs/postmortems/<date>.md`.

## §F — Stripe secret key suspected leaked

1. Stripe dashboard → Developers → API keys → **Roll the key now.** The old key is dead within seconds.
2. Update Vercel env + `.env.local` with the new value.
3. Hit `/api/cron/revenue-reconcile` manually to confirm the new key works.
4. Stripe will email you if they see the old key still in use anywhere.

## §G — Suspect the webhook secret leaked

1. Stripe dashboard → Developers → Webhooks → your endpoint → **Roll signing secret.**
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel env + `.env.local`.
3. Send a test event from Stripe dashboard; verify 200.

---

## Quick reference — who knows what

| Thing | Location |
| --- | --- |
| Stripe live keys | `.env.local` (gitignored), Vercel prod env |
| Resend key | `.env.local` + Vercel env, Resend dashboard |
| Webhook signing secret | `.env.local` (`STRIPE_WEBHOOK_SECRET`) + Vercel env |
| Cron secret | `.env.local` (`CRON_SECRET`) + Vercel env |
| Stripe support | [support.stripe.com](https://support.stripe.com) + live chat for urgent |
| Resend support | [resend.com/support](https://resend.com/support) |
| Supabase MCP | project ref `phypsgxszrvwdaaqpxup` |

## After any incident

- [ ] Post-mortem doc written under `docs/postmortems/YYYY-MM-DD-<slug>.md`
- [ ] Scenario test added to `lib/lifecycle/scenarios.test.ts` that would have caught this
- [ ] New anomaly detector added to `lib/revenue/anomalies/detectors/` if applicable
- [ ] Relevant `CLAUDE.md` section updated if the incident exposed missing context

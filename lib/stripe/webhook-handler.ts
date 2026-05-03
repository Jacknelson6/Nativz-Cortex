/**
 * Shared Stripe webhook dispatch logic, factored out so both the legacy
 * single-endpoint `/api/webhooks/stripe` and the per-agency endpoints
 * `/api/webhooks/stripe/[agency]` call the same code path.
 *
 * Each agency's Stripe account points to its own endpoint with its own
 * signing secret; this handler verifies the signature against the secret
 * matching `agency`, deduplicates by event id, and routes to the mirror
 * upserts + lifecycle state machine.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import type { AgencyBrand } from '@/lib/agency/detect';
import {
  configuredWebhookAgencies,
  getStripe,
  getStripeWebhookSecret,
} from './client';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertCustomerFromStripe } from './customers';
import { upsertInvoiceFromStripe } from './invoices';
import { upsertSubscriptionFromStripe } from './subscriptions';
import { upsertChargeFromStripe } from './charges';
import { upsertRefundFromStripe } from './refunds';
import {
  onInvoicePaid,
  onInvoiceSent,
  onSubscriptionCreated,
  onSubscriptionCanceled,
  onSubscriptionPaused,
  onSubscriptionResumed,
  onSubscriptionUpdated,
} from '@/lib/lifecycle/state-machine';
import { onProposalCheckoutCompleted } from '@/lib/proposals/on-paid';
import {
  onCreditsCheckoutCompleted,
  onCreditsChargeRefunded,
  onCreditsChargeDisputed,
} from '@/lib/credits/webhook';
import { applyTierChange } from '@/lib/deliverables/apply-tier-change';

export async function handleStripeWebhook(
  req: NextRequest,
  agency: AgencyBrand | 'auto',
): Promise<NextResponse> {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();

  // Verify against the right secret. For the per-agency endpoints we know
  // up-front; for the legacy single endpoint ('auto') we try each configured
  // agency's secret until one matches.
  let event: Stripe.Event | null = null;
  let resolvedAgency: AgencyBrand | null = null;
  let lastError = '';
  const candidates: AgencyBrand[] =
    agency === 'auto' ? configuredWebhookAgencies() : [agency];
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: 'No Stripe webhook secrets configured' },
      { status: 500 },
    );
  }
  for (const candidate of candidates) {
    try {
      const stripe = getStripe(candidate);
      const secret = getStripeWebhookSecret(candidate);
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      resolvedAgency = candidate;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'signature verification failed';
    }
  }
  if (!event || !resolvedAgency) {
    console.error(
      `[stripe:${agency === 'auto' ? candidates.join('|') : agency}] signature failed:`,
      lastError,
    );
    return NextResponse.json({ error: lastError || 'signature verification failed' }, { status: 400 });
  }
  agency = resolvedAgency;

  const admin = createAdminClient();

  // Idempotency: insert first, dispatch only if we won the race.
  const { data: inserted, error: insertErr } = await admin
    .from('stripe_events')
    .insert({
      id: event.id,
      type: event.type,
      api_version: event.api_version,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
    })
    .select('id')
    .maybeSingle();

  if (insertErr && insertErr.code !== '23505') {
    console.error(`[stripe:${agency}] store event failed:`, insertErr);
  }
  if (!inserted) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    await dispatch(event, admin, agency);
    await admin
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[stripe:${agency}] dispatch failed:`, msg);
    await admin.from('stripe_events').update({ processing_error: msg }).eq('id', event.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

async function dispatch(
  event: Stripe.Event,
  admin: ReturnType<typeof createAdminClient>,
  agency: AgencyBrand,
): Promise<void> {
  // agency is currently just logged — when we backfill the `stripe_account_id`
  // column into the mirror tables, pass it into each upsert so rows get tagged.
  // For now Stripe IDs are globally unique per account, so no collision risk.
  void agency;

  switch (event.type) {
    case 'customer.created':
    case 'customer.updated':
    case 'customer.deleted':
      await upsertCustomerFromStripe(event.data.object as Stripe.Customer, admin);
      return;

    case 'invoice.created':
    case 'invoice.finalized':
    case 'invoice.updated':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
    case 'invoice.payment_failed':
      await upsertInvoiceFromStripe(event.data.object as Stripe.Invoice, admin);
      return;

    case 'invoice.sent': {
      const inv = event.data.object as Stripe.Invoice;
      const result = await upsertInvoiceFromStripe(inv, admin);
      if (result.client_id) {
        await onInvoiceSent(
          {
            id: inv.id,
            client_id: result.client_id,
            number: inv.number ?? null,
            amount_paid_cents: inv.amount_paid ?? 0,
            amount_due_cents: inv.amount_due ?? 0,
            currency: inv.currency ?? 'usd',
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
            status: inv.status ?? 'open',
          },
          admin,
        );
      }
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const inv = event.data.object as Stripe.Invoice;
      const result = await upsertInvoiceFromStripe(inv, admin);
      if (result.previous_status !== 'paid' && result.client_id) {
        await onInvoicePaid(
          {
            id: inv.id,
            client_id: result.client_id,
            number: inv.number ?? null,
            amount_paid_cents: inv.amount_paid ?? 0,
            amount_due_cents: inv.amount_due ?? 0,
            currency: inv.currency ?? 'usd',
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
            status: inv.status ?? 'paid',
          },
          { stripeEventId: event.id, admin },
        );
      }
      return;
    }

    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscriptionFromStripe(sub, admin);
      await onSubscriptionCreated(sub.id, result.client_id, admin);
      return;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const prev = (event.data as unknown as { previous_attributes?: Record<string, unknown> })
        .previous_attributes ?? {};
      const result = await upsertSubscriptionFromStripe(sub, admin);

      const pauseNow =
        (sub as unknown as { pause_collection?: { behavior?: string } | null }).pause_collection;
      const prevPause = prev.pause_collection as { behavior?: string } | null | undefined;
      if (pauseNow?.behavior && !prevPause?.behavior) {
        await onSubscriptionPaused(sub.id, result.client_id, admin);
        return;
      }
      if (!pauseNow && prevPause?.behavior) {
        await onSubscriptionResumed(sub.id, result.client_id, admin);
        return;
      }

      // Phase D: tier-change branch. Stripe surfaces a price_id swap on
      // `customer.subscription.updated` via items.data[].price.id; the prior
      // value lives in previous_attributes.items. We resolve the new
      // price_id to a package_tiers row and call applyTierChange. Failures
      // are logged but don't abort the webhook (the lifecycle update below
      // still needs to run for status/cancel propagation).
      try {
        const items = (sub as unknown as { items?: { data?: Array<{ price?: { id?: string } }> } }).items;
        const newPriceId = items?.data?.[0]?.price?.id ?? null;
        const prevItems = prev.items as
          | { data?: Array<{ price?: { id?: string } }> }
          | undefined;
        const prevPriceId = prevItems?.data?.[0]?.price?.id ?? null;
        const tierChanged = !!newPriceId && !!prevPriceId && newPriceId !== prevPriceId;
        if (tierChanged && newPriceId && result.client_id) {
          const { data: tierRow } = await admin
            .from('package_tiers')
            .select('id, slug, display_name')
            .eq('stripe_price_id', newPriceId)
            .eq('is_active', true)
            .maybeSingle<{ id: string; slug: string; display_name: string }>();
          if (tierRow) {
            const applied = await applyTierChange(admin, result.client_id, tierRow.id);
            console.info('[stripe webhook] tier change applied', {
              client_id: result.client_id,
              new_tier: tierRow.slug,
              rows: applied.rows.map((r) => ({
                slug: r.deliverableTypeSlug,
                delta: r.proratedDelta,
                already: r.alreadyApplied,
              })),
            });
          } else {
            console.warn('[stripe webhook] price_id not mapped to a package_tier', {
              new_price_id: newPriceId,
            });
          }
        }
      } catch (err) {
        console.error('[stripe webhook] tier-change branch failed', err);
      }

      const summaryBits: string[] = [];
      if ('status' in prev) summaryBits.push(`status: ${sub.status}`);
      if ('cancel_at_period_end' in prev) summaryBits.push(`cancel_at_period_end: ${sub.cancel_at_period_end}`);
      const summary = summaryBits.length > 0 ? summaryBits.join(', ') : `status: ${sub.status}`;
      await onSubscriptionUpdated(sub.id, result.client_id, summary, admin);
      return;
    }

    case 'customer.subscription.paused': {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscriptionFromStripe(sub, admin);
      await onSubscriptionPaused(sub.id, result.client_id, admin);
      return;
    }

    case 'customer.subscription.resumed': {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscriptionFromStripe(sub, admin);
      await onSubscriptionResumed(sub.id, result.client_id, admin);
      return;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscriptionFromStripe(sub, admin);
      await onSubscriptionCanceled(sub.id, result.client_id, admin);
      return;
    }

    case 'charge.succeeded':
    case 'charge.failed':
    case 'charge.updated':
      await upsertChargeFromStripe(event.data.object as Stripe.Charge, admin);
      return;

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      // Mirror first so the charges/refunds tables stay accurate, then
      // claw credits back if this refund was for a credits top-up. The
      // credits handler no-ops when the charge isn't a credits charge,
      // so it's safe to call unconditionally.
      await upsertChargeFromStripe(charge, admin);
      await onCreditsChargeRefunded(charge, admin);
      return;
    }

    case 'refund.created':
    case 'refund.updated':
    case 'charge.refund.updated':
      await upsertRefundFromStripe(event.data.object as Stripe.Refund, admin);
      return;

    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      await onCreditsChargeDisputed(dispute, admin, agency);
      return;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Branch on metadata.kind. Credits sessions stamp `kind: 'credits'`
      // on creation; legacy proposal checkouts don't (and we keep that
      // shape to avoid migrating outstanding proposal links).
      const kind = (session.metadata as Record<string, string> | null)?.kind;
      if (kind === 'credits') {
        await onCreditsCheckoutCompleted(session, admin, agency);
      } else {
        await onProposalCheckoutCompleted(session, admin);
      }
      return;
    }

    default:
      return;
  }
}

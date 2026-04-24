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
import { getStripe, getStripeWebhookSecret } from './client';
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

export async function handleStripeWebhook(req: NextRequest, agency: AgencyBrand): Promise<NextResponse> {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe(agency);
  const whSecret = getStripeWebhookSecret(agency);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, whSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'signature verification failed';
    console.error(`[stripe:${agency}] signature failed:`, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

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

      const summaryBits: string[] = [];
      if ('status' in prev) summaryBits.push(`status → ${sub.status}`);
      if ('cancel_at_period_end' in prev) summaryBits.push(`cancel_at_period_end → ${sub.cancel_at_period_end}`);
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
    case 'charge.refunded':
    case 'charge.updated':
      await upsertChargeFromStripe(event.data.object as Stripe.Charge, admin);
      return;

    case 'refund.created':
    case 'refund.updated':
    case 'charge.refund.updated':
      await upsertRefundFromStripe(event.data.object as Stripe.Refund, admin);
      return;

    case 'checkout.session.completed':
      await onProposalCheckoutCompleted(event.data.object as Stripe.Checkout.Session, admin);
      return;

    default:
      return;
  }
}

/**
 * Stripe webhook → credits ledger handlers.
 *
 * Three event types feed credit state, all gated by metadata
 * `{ kind: 'credits', ... }` on the originating Checkout session (which
 * Stripe propagates to the PaymentIntent and from there to refunds /
 * disputes).
 *
 *   - `checkout.session.completed` → grant_topup
 *   - `charge.refunded`            → expire (refund claw-back)
 *   - `charge.dispute.created`     → expire (chargeback claw-back)
 *
 * The dispatch table in `lib/stripe/webhook-handler.ts` calls these
 * helpers AFTER `stripe_events` insert won the idempotency race, so we
 * don't need to dedupe by event id ourselves. Inside the credits ledger
 * we still rely on the partial UNIQUE index on
 * `credit_transactions(idempotency_key) WHERE kind IN ('grant_topup',
 * 'expire')` for double-fires that hit a different `stripe_events` row
 * (e.g. one from the legacy /webhooks/stripe and another from the
 * per-agency /webhooks/stripe/[agency] endpoint mid-migration).
 *
 * All three handlers no-op silently when the originating object isn't a
 * credits flow. The legacy proposal checkout shares the same event types
 * and gets routed by the dispatch table based on metadata.kind first.
 */

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgencyBrand } from '@/lib/agency/detect';
import { getStripe } from '@/lib/stripe/client';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { grantCredit, expireCredit } from './grant';
import { isGranted, type DeliverableTypeSlug, type GrantResult } from './types';
import {
  getDeliverableTypeId,
  getDeliverableTypeSlug,
} from '@/lib/deliverables/types-cache';
import { sendCreditsTopupConfirmationEmail } from '@/lib/email/resend';

const VALID_TYPE_SLUGS: DeliverableTypeSlug[] = ['edited_video', 'ugc_video', 'static_graphic'];

function resolveSlugFromMetadata(raw: string | undefined): DeliverableTypeSlug {
  if (raw && (VALID_TYPE_SLUGS as string[]).includes(raw)) {
    return raw as DeliverableTypeSlug;
  }
  // Default keeps pre-migration top-up sessions (no metadata) flowing into
  // the edited_video bucket, which is the only type Phase A actually grants
  // through Stripe.
  return 'edited_video';
}

interface ContactRow {
  name: string;
  email: string | null;
  role: string | null;
  is_primary: boolean | null;
}

// Same exclusions as `lib/credits/email.ts` so the topup confirmation
// reaches the same audience as the low-balance / overdraft warnings.
const EXCLUDE_ROLE_PATTERNS = [/paid media only/i, /avoid bulk/i];

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).trim();
}

async function resolveTopupRecipients(
  admin: SupabaseClient,
  clientId: string,
): Promise<{ emails: string[]; pocFirstNames: string[] }> {
  const { data: contacts } = await admin
    .from('contacts')
    .select('name, email, role, is_primary')
    .eq('client_id', clientId)
    .returns<ContactRow[]>();
  const all = contacts ?? [];
  const eligible = all.filter(
    (c) => !!c.email && !EXCLUDE_ROLE_PATTERNS.some((re) => re.test(c.role ?? '')),
  );
  if (eligible.length > 0) {
    return {
      emails: eligible.map((c) => c.email!) as string[],
      pocFirstNames: eligible.map((c) => firstName(c.name)),
    };
  }
  // Fallback: any primary contact, mirrors the warning-email helper.
  const fallback = all.filter(
    (c) =>
      c.is_primary === true &&
      !!c.email &&
      !EXCLUDE_ROLE_PATTERNS.some((re) => re.test(c.role ?? '')),
  );
  return {
    emails: fallback.map((c) => c.email!) as string[],
    pocFirstNames: fallback.map((c) => firstName(c.name)),
  };
}

/**
 * `checkout.session.completed` handler. Idempotent via the
 * `topup:<session_id>` key on `credit_transactions.idempotency_key`.
 *
 * The dispatch table in `webhook-handler.ts` calls us only when
 * `session.metadata.kind === 'credits'`. Anything else (proposal
 * checkout, future kinds) is routed elsewhere.
 *
 * Best-effort confirmation email — a Resend failure is logged but does
 * NOT roll back the grant. The client got their credits; the email is
 * a courtesy.
 */
export async function onCreditsCheckoutCompleted(
  session: Stripe.Checkout.Session,
  admin: SupabaseClient,
  agency: AgencyBrand,
): Promise<void> {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const clientId = meta.client_id;
  const packSizeRaw = meta.pack_size;
  const actorUserId = meta.actor_user_id ?? null;
  const packSize = Number.parseInt(packSizeRaw ?? '', 10);

  if (!clientId || !Number.isFinite(packSize) || packSize <= 0) {
    console.error('[credits.webhook] checkout.session.completed missing metadata', {
      sessionId: session.id,
      clientId,
      packSizeRaw,
    });
    return;
  }

  // Stripe types `payment_intent` as string | PaymentIntent | null. For a
  // mode='payment' session it's always set after completion.
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const deliverableTypeSlug = resolveSlugFromMetadata(meta.deliverable_type_slug);
  const deliverableTypeId = await getDeliverableTypeId(admin, deliverableTypeSlug);

  const result: GrantResult = await grantCredit(admin, {
    clientId,
    kind: 'grant_topup',
    delta: packSize,
    idempotencyKey: `topup:${session.id}`,
    note: `stripe_topup:${session.id}`,
    actorUserId,
    stripePaymentIntent: paymentIntentId,
    deliverableTypeSlug,
  });

  if (!isGranted(result)) {
    // already_granted — webhook re-fired, nothing more to do (don't re-send
    // the confirmation email, it would surface as a duplicate to the POC).
    return;
  }

  const newBalance = result.new_balance;
  const amountPaidCents = session.amount_total ?? 0;

  // Pull the client name + agency for branding. Agency parameter is the
  // verified one from the webhook signature; we still re-read clients.agency
  // here for defence-in-depth (agency mismatch is a config bug, surface it).
  const { data: client } = await admin
    .from('clients')
    .select('name, agency')
    .eq('id', clientId)
    .maybeSingle<{ name: string | null; agency: string | null }>();
  const clientName = client?.name ?? 'Your brand';
  const resolvedAgency = getBrandFromAgency(client?.agency ?? null);
  if (resolvedAgency !== agency) {
    console.warn(
      `[credits.webhook] agency mismatch for client ${clientId}: webhook=${agency} db=${resolvedAgency}; using db value for branding`,
    );
  }

  // Build the receipt url + the portal CTA. Stripe's hosted receipt is on
  // the latest charge, which we fetch lazily — if it's not retrievable for
  // any reason we fall through to the portal link.
  let receiptUrl: string | null = null;
  if (paymentIntentId) {
    try {
      const stripe = getStripe(resolvedAgency);
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      });
      const latestCharge =
        typeof pi.latest_charge === 'string' ? null : (pi.latest_charge ?? null);
      receiptUrl = latestCharge?.receipt_url ?? null;
    } catch (err) {
      console.warn(
        `[credits.webhook] could not fetch receipt url for ${paymentIntentId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const portalUrl = `${appUrl}/credits`;

  const recipients = await resolveTopupRecipients(admin, clientId);
  if (recipients.emails.length === 0) {
    console.warn(
      `[credits.webhook] no eligible recipients for topup confirmation on client ${clientId}; skipping email`,
    );
    return;
  }

  try {
    const send = await sendCreditsTopupConfirmationEmail({
      to: recipients.emails,
      pocFirstNames: recipients.pocFirstNames,
      clientName,
      packSize,
      newBalance,
      amountPaidCents,
      receiptUrl,
      portalUrl,
      agency: resolvedAgency,
      clientId,
    });
    if (!send.ok) {
      await admin.from('failed_email_attempts').insert({
        client_id: clientId,
        deliverable_type_id: deliverableTypeId,
        template: 'credits_topup_confirmation',
        period_id: session.id, // session id is the natural per-event id
        recipients: recipients.emails,
        error_message: send.error ?? 'unknown send error',
      });
      console.error(
        `[credits.webhook] topup confirmation send failed for client ${clientId}: ${send.error}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown send error';
    await admin.from('failed_email_attempts').insert({
      client_id: clientId,
      deliverable_type_id: deliverableTypeId,
      template: 'credits_topup_confirmation',
      period_id: session.id,
      recipients: recipients.emails,
      error_message: message,
    });
    console.error(
      `[credits.webhook] topup confirmation send threw for client ${clientId}:`,
      err,
    );
  }
}

interface MatchingGrant {
  client_id: string;
  delta: number; // = pack_size
  charge_amount_cents: number; // sourced from the charge object
  /** Type the grant landed on. Expire claws back from the same bucket. */
  deliverable_type_id: string;
}

/**
 * Look up the credits `grant_topup` row that paid for this charge. Returns
 * null when the charge isn't a credits flow (most common case — proposal
 * checkouts also fire `charge.refunded`).
 *
 * We trust the grant row's `delta` as the canonical pack_size and use
 * `charge.amount / delta` as the unit price. Stashing unit_price separately
 * in metadata buys us nothing and adds a place to drift.
 *
 * Also pulls the grant's `deliverable_type_id` so refunds/disputes can claw
 * back from the same type bucket the grant landed in.
 */
async function findCreditsGrantForCharge(
  admin: SupabaseClient,
  charge: Stripe.Charge,
): Promise<MatchingGrant | null> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) return null;

  const { data: grant } = await admin
    .from('credit_transactions')
    .select('client_id, delta, deliverable_type_id')
    .eq('kind', 'grant_topup')
    .eq('stripe_payment_intent', paymentIntentId)
    .maybeSingle<{
      client_id: string;
      delta: number;
      deliverable_type_id: string;
    }>();
  if (!grant?.client_id || !grant.delta || !grant.deliverable_type_id) return null;

  return {
    client_id: grant.client_id,
    delta: grant.delta,
    charge_amount_cents: charge.amount ?? 0,
    deliverable_type_id: grant.deliverable_type_id,
  };
}

/**
 * `charge.refunded` handler. Computes credits to claw back as
 * `floor(refund.amount / unit_price)`, where unit_price is derived from
 * the original charge total (`charge.amount / pack_size`). Each Stripe
 * refund event gets its own `expire` row keyed by `refund.id` so partial
 * refunds are additive.
 *
 * Returns silently when the charge isn't a credits charge — proposal
 * checkouts share the event type.
 */
export async function onCreditsChargeRefunded(
  charge: Stripe.Charge,
  admin: SupabaseClient,
): Promise<void> {
  const match = await findCreditsGrantForCharge(admin, charge);
  if (!match) return; // not a credits charge, ignore

  // The event fires once per refund; we want the most recent refund row.
  // Stripe sorts charge.refunds.data DESC by created. Falling through to
  // the legacy `charge.amount_refunded - already_clawed` path would
  // mis-attribute multi-refund cases.
  const refunds = charge.refunds?.data ?? [];
  if (refunds.length === 0) {
    console.warn(
      `[credits.webhook] charge.refunded for ${charge.id} has empty refunds.data, skipping`,
    );
    return;
  }
  const latest = refunds[0];
  if (!latest?.id || !latest.amount || latest.amount <= 0) return;

  const unitCents = Math.floor(match.charge_amount_cents / match.delta);
  if (unitCents <= 0) {
    console.error(
      `[credits.webhook] derived non-positive unit price for charge ${charge.id}: amount=${match.charge_amount_cents} delta=${match.delta}`,
    );
    return;
  }
  const creditsToExpire = Math.floor(latest.amount / unitCents);
  if (creditsToExpire <= 0) return; // refund smaller than one credit, ignore

  const slug = await getDeliverableTypeSlug(admin, match.deliverable_type_id);
  await expireCredit(admin, {
    clientId: match.client_id,
    delta: -creditsToExpire,
    idempotencyKey: `expire:refund:${latest.id}`,
    note: `stripe_refund:${charge.id}`,
    deliverableTypeSlug: slug,
  });
}

/**
 * `charge.dispute.created` handler. A chargeback is a forced refund —
 * same credit math, different idempotency key, different note tag.
 *
 * On `charge.dispute.closed` (won/lost) we do NOT auto-restore. If we
 * win, an admin issues a manual `adjust` to restore the credits. Keeps
 * the audit trail explicit.
 */
export async function onCreditsChargeDisputed(
  dispute: Stripe.Dispute,
  admin: SupabaseClient,
  agency: AgencyBrand,
): Promise<void> {
  const chargeId =
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null;
  if (!chargeId) return;

  // Need the full charge object to find the matching grant + compute the
  // unit price. Disputes don't include the charge inline.
  let charge: Stripe.Charge;
  try {
    const stripe = getStripe(agency);
    charge = await stripe.charges.retrieve(chargeId);
  } catch (err) {
    console.error(
      `[credits.webhook] dispute ${dispute.id} could not fetch charge ${chargeId}:`,
      err instanceof Error ? err.message : err,
    );
    return;
  }

  const match = await findCreditsGrantForCharge(admin, charge);
  if (!match) return;

  const disputeAmount = dispute.amount ?? charge.amount ?? 0;
  if (disputeAmount <= 0) return;

  const unitCents = Math.floor(match.charge_amount_cents / match.delta);
  if (unitCents <= 0) {
    console.error(
      `[credits.webhook] derived non-positive unit price for dispute ${dispute.id}: amount=${match.charge_amount_cents} delta=${match.delta}`,
    );
    return;
  }
  const creditsToExpire = Math.floor(disputeAmount / unitCents);
  if (creditsToExpire <= 0) return;

  const slug = await getDeliverableTypeSlug(admin, match.deliverable_type_id);
  await expireCredit(admin, {
    clientId: match.client_id,
    delta: -creditsToExpire,
    idempotencyKey: `expire:dispute:${dispute.id}`,
    note: `stripe_dispute:${dispute.id}`,
    deliverableTypeSlug: slug,
  });
}

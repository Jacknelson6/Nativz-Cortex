import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureStripeCustomer } from '@/lib/credits/stripe-customer';
import {
  ADDON_SKUS,
  isAddonSlug,
  resolveAddonPriceId,
  type AddonSlug,
} from '@/lib/deliverables/addon-skus';
import { getStripe } from '@/lib/stripe/client';
import { rateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/credits/checkout
 *
 * Mints a Stripe Checkout session for an add-on SKU and returns `{ url }`
 * so the portal can redirect to Stripe.
 *
 * Phase B replaces the legacy 5/10/25 "credit pack" abstraction with named
 * SKUs (Extra Edited Video, UGC-Style Video, Rush Delivery). The route now
 * speaks `addon_slug` and resolves the matching Stripe price + downstream
 * grant shape from `ADDON_SKUS`.
 *
 * Auth: any authenticated user with access to the target client. Admins
 * always pass; viewers must have a `user_client_access` row for the client.
 *
 * Authorization hardening (per credits-spec § Webhook Security):
 *   - `client_id` is taken from the request body but re-verified against
 *     the user's allowed clients (admin OR `user_client_access`).
 *   - `addon_slug` validated against the closed `AddonSlug` union.
 *   - 5 sessions per 10 minutes per user (sliding window).
 *
 * Stripe price ids live in env: `<AGENCY>_<env_key>` per SKU. The metadata
 * carries the addon_slug + the resolved deliverable_type_slug + quantity so
 * the webhook can grant deliverables without re-reading the SKU table.
 *
 * @body  { clientId: uuid, addon_slug: AddonSlug }
 * @returns { url, sessionId } | { error, status }
 */

const Body = z.object({
  clientId: z.string().uuid(),
  addon_slug: z.string(),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 },
      );
    }
    const { clientId, addon_slug } = parsed.data;

    if (!isAddonSlug(addon_slug)) {
      return NextResponse.json(
        { error: 'Unknown add-on. Refresh and try again.' },
        { status: 400 },
      );
    }
    const slug: AddonSlug = addon_slug;
    const sku = ADDON_SKUS[slug];

    // Rate limit BEFORE any DB lookups so a hostile client can't exhaust the
    // db roundtrips. Keyed by user id, scoped to this endpoint.
    const rl = rateLimit(`${user.id}:credits.checkout`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Try again in a few minutes.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const admin = createAdminClient();

    // Authorization: admin OR viewer with access to this client.
    const { data: me } = await admin
      .from('users')
      .select('role, is_super_admin, email')
      .eq('id', user.id)
      .single();
    const isAdmin =
      (me as { is_super_admin?: boolean | null } | null)?.is_super_admin === true ||
      me?.role === 'admin' ||
      me?.role === 'super_admin';

    if (!isAdmin) {
      const { data: access } = await admin
        .from('user_client_access')
        .select('client_id')
        .eq('user_id', user.id)
        .eq('client_id', clientId)
        .maybeSingle();
      if (!access) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Pull the email we'll seed the Stripe customer with. Prefer the
    // requester's portal email; fall back to user.email; final fallback to
    // the auth user record's email field. Stripe requires *some* email.
    const requesterEmail = me?.email ?? user.email ?? null;
    if (!requesterEmail) {
      return NextResponse.json(
        {
          error:
            'Your account is missing a billing email. Reach out to your Nativz contact to get this set up.',
        },
        { status: 400 },
      );
    }

    // Resolve / create the Stripe customer for this client. Sets
    // `clients.stripe_customer_id` if it was null, so subsequent webhook
    // handlers can re-verify the session against this customer id.
    const customer = await ensureStripeCustomer(admin, clientId, requesterEmail);

    const priceId = resolveAddonPriceId(customer.agency, slug);
    if (!priceId) {
      // SKU not configured for this agency yet. Surface a 503 so the UI
      // shows "checkout unavailable" rather than treating it as a 5xx bug.
      return NextResponse.json(
        {
          error:
            'This add-on is not yet enabled for your account. Reach out to your Nativz contact to get one queued in the meantime.',
        },
        { status: 503 },
      );
    }

    const stripe = getStripe(customer.agency);
    const origin =
      request.headers.get('origin') ??
      `https://${request.headers.get('host') ?? 'cortex.nativz.io'}`;

    // Metadata is the routing trigger for the webhook (`metadata.kind ===
    // 'credits'`). The handler reads `addon_slug` to look up quantity +
    // deliverable_type_slug from the SKU table; we also stash them here as
    // a defence in depth so a future SKU rename doesn't strand in-flight
    // sessions.
    const sharedMeta: Record<string, string> = {
      kind: 'credits',
      client_id: clientId,
      addon_slug: slug,
      quantity: String(sku.quantity),
      actor_user_id: user.id,
    };
    if (sku.deliverable_type_slug) {
      sharedMeta.deliverable_type_slug = sku.deliverable_type_slug;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customer.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/deliverables?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/deliverables?topup=cancel`,
      metadata: sharedMeta,
      payment_intent_data: {
        metadata: sharedMeta,
      },
      allow_promotion_codes: false,
    });

    if (!session.url) {
      console.error('[credits.checkout] session created without url', {
        sessionId: session.id,
      });
      return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[credits.checkout] failed', err);
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

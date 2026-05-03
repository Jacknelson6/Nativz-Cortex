import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/credits/checkout
 *
 * Stripe Checkout entry point for portal viewers and admins on the
 * `/credits` page. Phase 4 ships a 503 stub so the "Buy more credits"
 * button surfaces a friendly message instead of a 404. Phase 5 will:
 *
 *   1. Look up / create a Stripe customer for the client
 *      (`lib/credits/stripe-customer.ts`).
 *   2. Create a Stripe Checkout Session with line_items pointing at the
 *      configured Cortex top-up price (env: `STRIPE_CREDITS_TOPUP_PRICE_ID`).
 *   3. Return `{ url }` so the client redirects to Stripe.
 *   4. The `checkout.session.completed` webhook then calls `grant_credit`
 *      with `kind='grant_topup'` and a Stripe-event idempotency key.
 *
 * Auth: any authenticated user with access to the target client. Admins
 * always pass; viewers must have a `user_client_access` row for the
 * client.
 *
 * @body clientId - UUID of the client to top up
 * @returns { url: string }  on success (Phase 5)
 * @returns { error: string } 503 until Phase 5 lands
 */

const Body = z.object({
  clientId: z.string().uuid(),
});

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
    const { clientId } = parsed.data;

    // Authorization: admin OR viewer with access to this client.
    const admin = createAdminClient();
    const { data: me } = await admin
      .from('users')
      .select('role, is_super_admin')
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

    // Phase 4 stub: Stripe wiring lands in Phase 5. Returning 503 instead
    // of 404 so the UI can surface "checkout temporarily unavailable" copy
    // rather than treating it as a missing endpoint.
    return NextResponse.json(
      {
        error:
          'Top-up checkout is coming soon. Reach out to your Nativz contact to add credits in the meantime.',
      },
      { status: 503 },
    );
  } catch (err) {
    console.error('[credits.checkout] failed', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}

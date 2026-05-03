/**
 * POST /api/deliverables/[clientId]/tier
 *
 * Admin-only manual tier assignment. Wired into the same `applyTierChange`
 * helper as the Stripe webhook so manual overrides + Stripe-driven swaps
 * share the proration + idempotency logic.
 *
 * Body: { tier_id: uuid }
 *
 * The helper is idempotent on (client, tier, period, type) so re-clicking
 * "Switch to this plan" inside the same period is a no-op and surfaces
 * `alreadyApplied: true` in the per-type rows.
 *
 * @auth Required (admin / super_admin)
 * @returns ApplyTierChangeResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCreditsAdminContext } from '@/lib/credits/admin-auth';
import { applyTierChange } from '@/lib/deliverables/apply-tier-change';

const Body = z.object({
  tier_id: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await ctx.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
      return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 });
    }

    const auth = await getCreditsAdminContext();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user } = auth.ctx;

    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Cross-agency safety: refuse to assign a tier whose `agency` doesn't
    // match the client's. Stripe's webhook handler enforces this implicitly
    // (price IDs are scoped to the agency Stripe account), but the manual
    // override route reads directly from a UUID so we re-check here.
    const [{ data: tier }, { data: client }] = await Promise.all([
      admin
        .from('package_tiers')
        .select('agency, is_active')
        .eq('id', parsed.data.tier_id)
        .maybeSingle<{ agency: string; is_active: boolean }>(),
      admin
        .from('clients')
        .select('agency')
        .eq('id', clientId)
        .maybeSingle<{ agency: string | null }>(),
    ]);

    if (!tier || !tier.is_active) {
      return NextResponse.json({ error: 'Tier not found or inactive' }, { status: 404 });
    }
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    if (tier.agency !== client.agency) {
      return NextResponse.json(
        { error: `Tier agency mismatch: tier=${tier.agency}, client=${client.agency ?? 'null'}` },
        { status: 400 },
      );
    }

    const result = await applyTierChange(admin, clientId, parsed.data.tier_id, {
      actorUserId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/deliverables/[clientId]/tier error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

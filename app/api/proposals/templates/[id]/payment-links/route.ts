import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/proposals/templates/[id]/payment-links
 *
 * Admin-only. Sets one tier's stripe_payment_link inside the template's
 * tiers_preview jsonb. Per-tier so the form can save one input at a time
 * without round-tripping the whole array.
 *
 * @auth Required (admin)
 * @body tier_id - tiers_preview[*].id (required)
 * @body stripe_payment_link - URL or null (required)
 * @returns {{ ok: true, tiers_preview: TierPreview[] }}
 */

const Body = z.object({
  tier_id: z.string().min(1).max(60),
  stripe_payment_link: z.string().url().nullable(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: templateId } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userRow } = await admin
      .from('users')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .maybeSingle();
    const isAdmin = userRow?.role === 'admin' || userRow?.is_super_admin === true;
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400 },
      );
    }
    const { tier_id, stripe_payment_link } = parsed.data;

    if (stripe_payment_link && !/^https:\/\/(buy|checkout)\.stripe\.com\//i.test(stripe_payment_link)) {
      return NextResponse.json(
        { ok: false, error: 'Must be a https://buy.stripe.com/… or https://checkout.stripe.com/… URL' },
        { status: 400 },
      );
    }

    const { data: template, error: readError } = await admin
      .from('proposal_templates')
      .select('id, tiers_preview')
      .eq('id', templateId)
      .maybeSingle();
    if (readError || !template) {
      return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 });
    }

    type Tier = { id: string; stripe_payment_link?: string | null; [k: string]: unknown };
    const tiers = (template.tiers_preview ?? []) as Tier[];
    const idx = tiers.findIndex((t) => t.id === tier_id);
    if (idx < 0) {
      return NextResponse.json({ ok: false, error: 'Tier not found in template' }, { status: 404 });
    }

    const next = tiers.map((t, i) =>
      i === idx ? { ...t, stripe_payment_link: stripe_payment_link } : t,
    );

    const { error: updateError } = await admin
      .from('proposal_templates')
      .update({ tiers_preview: next, updated_at: new Date().toISOString() })
      .eq('id', templateId);
    if (updateError) {
      console.error('[templates:payment-links] update failed', updateError);
      return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tiers_preview: next });
  } catch (err) {
    console.error('[templates:payment-links] uncaught', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

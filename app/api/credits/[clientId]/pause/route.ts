import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCreditsAdminContext } from '@/lib/credits/admin-auth';
import { getDeliverableTypeId } from '@/lib/deliverables/types-cache';

/**
 * POST /api/credits/[clientId]/pause
 *
 * Admin-only. Two pause shapes:
 *
 *   - Indefinite: { auto_grant_enabled: false, pause_reason: '...' }
 *     The monthly-reset cron skips the (client, type) until re-enabled.
 *
 *   - Time-bounded: { paused_until: ISO, pause_reason: '...' }
 *     The cron skips while now() < paused_until.
 *
 * Resume: send `{ resume: true }` to clear both flags.
 *
 * Type targeting (post-migration 221): the optional `deliverable_type_slug`
 * field targets ONE type row. When omitted, the pause/resume applies to every
 * balance row for the client — which is the right default for "this client
 * is on hold across the board" (e.g. churn, billing dispute) but lets admins
 * pause just one type if a deliverable type is temporarily off the menu
 * (e.g. UGC creator network down).
 *
 * Pause flags do NOT affect Stripe top-ups or admin-manual grants — only
 * the monthly cron.
 *
 * @auth Required (admin / super_admin)
 */

const SlugField = z
  .enum(['edited_video', 'ugc_video', 'static_graphic'])
  .optional();

const Body = z
  .union([
    z.object({
      resume: z.literal(true),
      deliverable_type_slug: SlugField,
    }),
    z.object({
      auto_grant_enabled: z.literal(false),
      pause_reason: z.string().min(1).max(500),
      paused_until: z.string().datetime().optional().nullable(),
      deliverable_type_slug: SlugField,
    }),
    z.object({
      paused_until: z.string().datetime(),
      pause_reason: z.string().min(1).max(500),
      auto_grant_enabled: z.literal(true).optional(),
      deliverable_type_slug: SlugField,
    }),
  ])
  .refine((v) => 'resume' in v || 'pause_reason' in v, {
    message: 'pause_reason is required unless resume=true',
  });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
      return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 });
    }

    const auth = await getCreditsAdminContext();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { admin } = auth.ctx;

    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let updates: Record<string, unknown>;
    if ('resume' in parsed.data) {
      updates = {
        auto_grant_enabled: true,
        paused_until: null,
        pause_reason: null,
        updated_at: new Date().toISOString(),
      };
    } else {
      const v = parsed.data;
      updates = {
        auto_grant_enabled: 'auto_grant_enabled' in v ? v.auto_grant_enabled : true,
        paused_until: 'paused_until' in v ? (v.paused_until ?? null) : null,
        pause_reason: v.pause_reason,
        updated_at: new Date().toISOString(),
      };
    }

    let query = admin
      .from('client_credit_balances')
      .update(updates)
      .eq('client_id', clientId);

    // Optional type targeting. When absent, the update sweeps every type row
    // for this client — pause is rarely a per-type concern.
    if (parsed.data.deliverable_type_slug) {
      const typeId = await getDeliverableTypeId(admin, parsed.data.deliverable_type_slug);
      query = query.eq('deliverable_type_id', typeId);
    }

    const { data, error } = await query.select(
      'client_id, deliverable_type_id, auto_grant_enabled, paused_until, pause_reason, monthly_allowance, current_balance, next_reset_at',
    );

    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No matching credit balance row for this client' },
        { status: 404 },
      );
    }

    // Return the array when sweeping all types; the single row when targeted.
    return NextResponse.json({
      balances: data,
    });
  } catch (error) {
    console.error('POST /api/credits/[clientId]/pause error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

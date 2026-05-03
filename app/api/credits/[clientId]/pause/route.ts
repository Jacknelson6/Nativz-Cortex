import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCreditsAdminContext } from '@/lib/credits/admin-auth';

/**
 * POST /api/credits/[clientId]/pause
 *
 * Admin-only. Two pause shapes:
 *
 *   - Indefinite: { auto_grant_enabled: false, pause_reason: '...' }
 *     The monthly-reset cron skips the client until re-enabled.
 *
 *   - Time-bounded: { paused_until: ISO, pause_reason: '...' }
 *     The cron skips while now() < paused_until.
 *
 * Resume: send `{ resume: true }` to clear both flags. Pause flags do NOT
 * affect Stripe top-ups or admin-manual grants — only the monthly cron.
 *
 * @auth Required (admin / super_admin)
 */

const Body = z
  .union([
    z.object({
      resume: z.literal(true),
    }),
    z.object({
      auto_grant_enabled: z.literal(false),
      pause_reason: z.string().min(1).max(500),
      paused_until: z.string().datetime().optional().nullable(),
    }),
    z.object({
      paused_until: z.string().datetime(),
      pause_reason: z.string().min(1).max(500),
      auto_grant_enabled: z.literal(true).optional(),
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

    const { data, error } = await admin
      .from('client_credit_balances')
      .update(updates)
      .eq('client_id', clientId)
      .select(
        'client_id, auto_grant_enabled, paused_until, pause_reason, monthly_allowance, current_balance, next_reset_at',
      )
      .single();

    if (error) {
      // PGRST116 = no rows returned. Means the balance row doesn't exist yet.
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'No credit balance row for this client' },
          { status: 404 },
        );
      }
      throw error;
    }

    return NextResponse.json({ balance: data });
  } catch (error) {
    console.error('POST /api/credits/[clientId]/pause error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

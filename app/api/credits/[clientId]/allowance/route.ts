import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCreditsAdminContext } from '@/lib/credits/admin-auth';

/**
 * PUT /api/credits/[clientId]/allowance
 *
 * Admin-only. Set the per-client monthly allowance + rollover policy.
 *
 *   - monthly_allowance: 0 turns the cron grant into a no-op (period dates
 *     still advance so per-period email idempotency stamps reset).
 *   - rollover_policy: 'none' | 'cap' | 'unlimited'
 *   - rollover_cap: required when rollover_policy='cap', else null
 *
 * Setting allowance does NOT immediately grant credits — the next cron run
 * after period_ends_at applies the new allowance. To grant credits now, use
 * /api/credits/[clientId]/grant.
 *
 * @auth Required (admin / super_admin)
 */

const Body = z
  .object({
    monthly_allowance: z.number().int().min(0).max(10_000),
    rollover_policy: z.enum(['none', 'cap', 'unlimited']),
    rollover_cap: z.number().int().min(0).max(100_000).optional().nullable(),
  })
  .refine(
    (v) => v.rollover_policy !== 'cap' || (v.rollover_cap != null && v.rollover_cap >= 0),
    {
      message: 'rollover_cap is required when rollover_policy=cap',
      path: ['rollover_cap'],
    },
  );

export async function PUT(
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

    const { data, error } = await admin
      .from('client_credit_balances')
      .update({
        monthly_allowance: parsed.data.monthly_allowance,
        rollover_policy: parsed.data.rollover_policy,
        rollover_cap:
          parsed.data.rollover_policy === 'cap' ? (parsed.data.rollover_cap ?? null) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('client_id', clientId)
      .select(
        'client_id, monthly_allowance, rollover_policy, rollover_cap, current_balance, next_reset_at',
      )
      .single();

    if (error) {
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
    console.error('PUT /api/credits/[clientId]/allowance error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { grantCredit } from '@/lib/credits/grant';
import { getCreditsAdminContext } from '@/lib/credits/admin-auth';

/**
 * POST /api/credits/[clientId]/grant
 *
 * Admin-only manual credit grant. Used for one-off top-ups (`grant_topup`)
 * or corrective adjustments (`adjust`). Stripe-driven top-ups go through
 * the webhook handler (Phase 5), which calls the same `grant_credit` RPC
 * with `kind = 'grant_topup'` and a Stripe-event idempotency key.
 *
 * @auth Required (admin / super_admin)
 * @body kind  - 'grant_topup' | 'adjust'
 * @body delta - non-zero integer (positive grants, negative adjusts allowed)
 * @body note  - optional human-readable reason (audit trail)
 * @returns RPC payload from `grant_credit` (granted/already_granted)
 */

const Body = z.object({
  kind: z.enum(['grant_topup', 'adjust']),
  delta: z.number().int().refine((n) => n !== 0, 'delta cannot be zero'),
  note: z.string().min(1).max(500).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
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
    const { user, admin } = auth.ctx;

    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await grantCredit(admin, {
      clientId,
      kind: parsed.data.kind,
      delta: parsed.data.delta,
      note: parsed.data.note ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      actorUserId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/credits/[clientId]/grant error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

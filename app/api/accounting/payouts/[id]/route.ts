import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  wise_url: z.string().max(500).nullable().optional(),
  status: z.enum(['pending', 'link_received', 'paid']).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * PATCH /api/accounting/payouts/[id]
 *
 * Updates the Wise URL, status, or notes on a single payout row. Marking
 * status=paid stamps paid_at; flipping back to anything else clears it so
 * the audit trail stays accurate.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.wise_url !== undefined) {
    const trimmed = parsed.data.wise_url?.trim();
    update.wise_url = trimmed ? trimmed : null;
  }
  if (parsed.data.notes !== undefined) {
    const trimmed = parsed.data.notes?.trim();
    update.notes = trimmed ? trimmed : null;
  }
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    update.paid_at = parsed.data.status === 'paid' ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.adminClient
    .from('payroll_payouts')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to update payout' }, { status: 500 });
  }

  return NextResponse.json({ payout: data });
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') return { error: 'Forbidden', status: 403 as const };
  return { user, adminClient };
}

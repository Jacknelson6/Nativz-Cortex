/**
 * GET /api/accounting/periods/[id]/over-scope
 *
 * Returns the editing clients in this payroll period that are over their
 * calendar-month capacity, with their over-count. Used by the editing tab
 * on the period detail screen to surface the out-of-scope review pill.
 *
 * Super-admin gated; mirrors the rest of the accounting routes.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEditingOverScopeForPeriod } from '@/lib/deliverables/get-period-over-scope';

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    userRow?.is_super_admin === true ||
    userRow?.role === 'admin' ||
    userRow?.role === 'super_admin';
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const clients = await getEditingOverScopeForPeriod(admin, parsed.data.id);
  return NextResponse.json({ clients });
}

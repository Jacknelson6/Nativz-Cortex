import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor } from '@/lib/accounting/periods';

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data: period, error } = await ctx.adminClient
    .from('payroll_periods')
    .select('id, start_date, end_date, half, status, notes, locked_at, paid_at')
    .eq('id', id)
    .single();

  if (error || !period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  }

  const { data: entries } = await ctx.adminClient
    .from('payroll_entries')
    .select('id, entry_type, team_member_id, payee_label, client_id, video_count, rate_cents, amount_cents, margin_cents, description, created_at')
    .eq('period_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    period: {
      ...period,
      label: labelFor(period.start_date, period.half as 'first-half' | 'second-half'),
    },
    entries: entries ?? [],
  });
}

const updateSchema = z.object({
  status: z.enum(['draft', 'locked', 'paid']).optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === 'locked') update.locked_at = new Date().toISOString();
  if (parsed.data.status === 'paid') update.paid_at = new Date().toISOString();

  const { data, error } = await ctx.adminClient
    .from('payroll_periods')
    .update(update)
    .eq('id', id)
    .select('id, status, notes, locked_at, paid_at')
    .single();

  if (error) {
    console.error('[accounting] patch period failed', error);
    return NextResponse.json({ error: 'Failed to update period' }, { status: 500 });
  }
  return NextResponse.json({ period: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data: period } = await ctx.adminClient
    .from('payroll_periods')
    .select('status')
    .eq('id', id)
    .single();
  if (period?.status === 'paid') {
    return NextResponse.json({ error: 'Cannot delete a paid period' }, { status: 400 });
  }

  const { error } = await ctx.adminClient.from('payroll_periods').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: 'Failed to delete period' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

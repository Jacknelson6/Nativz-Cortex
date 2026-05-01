import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentPeriod, nextPeriod, periodFor, labelFor } from '@/lib/accounting/periods';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();
  if (!userRow?.is_super_admin) return { error: 'Forbidden', status: 403 as const };
  return { user, adminClient };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  // Make sure the current and next periods exist so the user never lands on
  // an empty screen.
  const targets = [currentPeriod(), nextPeriod()];
  for (const p of targets) {
    await ctx.adminClient
      .from('payroll_periods')
      .upsert(
        {
          start_date: p.startDate,
          end_date: p.endDate,
          half: p.half,
          status: 'draft',
          created_by: ctx.user.id,
        },
        { onConflict: 'start_date,end_date', ignoreDuplicates: true },
      );
  }

  const { data: periods, error } = await ctx.adminClient
    .from('payroll_periods')
    .select('id, start_date, end_date, half, status, notes, locked_at, paid_at, created_at')
    .order('start_date', { ascending: false });

  if (error) {
    console.error('[accounting] list periods failed', error);
    return NextResponse.json({ error: 'Failed to list periods' }, { status: 500 });
  }

  // Attach totals per period.
  const ids = (periods ?? []).map((p) => p.id);
  const totals: Record<string, { amount_cents: number; margin_cents: number; entry_count: number }> = {};
  if (ids.length > 0) {
    const { data: entries } = await ctx.adminClient
      .from('payroll_entries')
      .select('period_id, amount_cents, margin_cents')
      .in('period_id', ids);
    for (const e of entries ?? []) {
      const row = (totals[e.period_id] ??= { amount_cents: 0, margin_cents: 0, entry_count: 0 });
      row.amount_cents += e.amount_cents ?? 0;
      row.margin_cents += e.margin_cents ?? 0;
      row.entry_count += 1;
    }
  }

  return NextResponse.json({
    periods: (periods ?? []).map((p) => ({
      ...p,
      label: labelFor(p.start_date, p.half as 'first-half' | 'second-half'),
      totals: totals[p.id] ?? { amount_cents: 0, margin_cents: 0, entry_count: 0 },
    })),
  });
}

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const p = periodFor(new Date(parsed.data.date));
  const { data, error } = await ctx.adminClient
    .from('payroll_periods')
    .upsert(
      {
        start_date: p.startDate,
        end_date: p.endDate,
        half: p.half,
        status: 'draft',
        created_by: ctx.user.id,
      },
      { onConflict: 'start_date,end_date' },
    )
    .select('id, start_date, end_date, half, status')
    .single();

  if (error) {
    console.error('[accounting] create period failed', error);
    return NextResponse.json({ error: 'Failed to create period' }, { status: 500 });
  }
  return NextResponse.json({ period: data });
}

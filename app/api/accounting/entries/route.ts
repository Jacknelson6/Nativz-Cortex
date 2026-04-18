import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const entryTypes = ['editing', 'smm', 'affiliate', 'blogging', 'override', 'misc'] as const;

const createSchema = z.object({
  period_id: z.string().uuid(),
  entry_type: z.enum(entryTypes),
  team_member_id: z.string().uuid().nullable().optional(),
  payee_label: z.string().max(200).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  video_count: z.number().int().min(0).max(10_000).optional(),
  rate_cents: z.number().int().min(0).max(10_000_000).optional(),
  amount_cents: z.number().int().min(0).max(10_000_000),
  margin_cents: z.number().int().min(0).max(10_000_000).optional(),
  description: z.string().max(2000).nullable().optional(),
});

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

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data: period } = await ctx.adminClient
    .from('payroll_periods')
    .select('status')
    .eq('id', parsed.data.period_id)
    .single();
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  if (period.status === 'paid') {
    return NextResponse.json({ error: 'Cannot add entries to a paid period' }, { status: 400 });
  }

  const { data, error } = await ctx.adminClient
    .from('payroll_entries')
    .insert({
      period_id: parsed.data.period_id,
      entry_type: parsed.data.entry_type,
      team_member_id: parsed.data.team_member_id ?? null,
      payee_label: parsed.data.payee_label ?? null,
      client_id: parsed.data.client_id ?? null,
      video_count: parsed.data.video_count ?? 0,
      rate_cents: parsed.data.rate_cents ?? 0,
      amount_cents: parsed.data.amount_cents,
      margin_cents: parsed.data.margin_cents ?? 0,
      description: parsed.data.description ?? null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[accounting] create entry failed', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const entryTypes = ['editing', 'smm', 'affiliate', 'blogging'] as const;

const entrySchema = z.object({
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

const bodySchema = z.object({
  period_id: z.string().uuid(),
  entries: z.array(entrySchema).min(1).max(200),
});

/**
 * POST /api/accounting/entries/bulk — create many entries at once. Used
 * by the import preview ("does this look right? confirm") flow.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data: period } = await adminClient
    .from('payroll_periods')
    .select('status')
    .eq('id', parsed.data.period_id)
    .single();
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  if (period.status !== 'draft') {
    return NextResponse.json(
      {
        error:
          period.status === 'paid'
            ? 'Cannot add entries to a paid period'
            : 'Cannot add entries to a locked period — unlock it first',
      },
      { status: 400 },
    );
  }

  const bloggingViolation = parsed.data.entries.findIndex(
    (e) =>
      e.entry_type === 'blogging' &&
      ((e.video_count ?? 0) > 0 || (e.rate_cents ?? 0) > 0),
  );
  if (bloggingViolation >= 0) {
    return NextResponse.json(
      {
        error:
          `Entry #${bloggingViolation + 1}: blogging entries are flat-amount only — ` +
          'video_count and rate_cents must be 0',
      },
      { status: 400 },
    );
  }

  const rows = parsed.data.entries.map((e) => ({
    period_id: parsed.data.period_id,
    entry_type: e.entry_type,
    team_member_id: e.team_member_id ?? null,
    payee_label: e.payee_label ?? null,
    client_id: e.client_id ?? null,
    video_count: e.video_count ?? 0,
    rate_cents: e.rate_cents ?? 0,
    amount_cents: e.amount_cents,
    margin_cents: e.margin_cents ?? 0,
    description: e.description ?? null,
    created_by: user.id,
  }));

  const { data, error } = await adminClient
    .from('payroll_entries')
    .insert(rows)
    .select('*');

  if (error) {
    console.error('[accounting] bulk insert failed', error);
    return NextResponse.json({ error: 'Failed to create entries' }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}

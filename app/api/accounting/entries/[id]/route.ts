import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

const updateSchema = z.object({
  team_member_id: z.string().uuid().nullable().optional(),
  payee_label: z.string().max(200).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  video_count: z.number().int().min(0).max(10_000).optional(),
  rate_cents: z.number().int().min(0).max(10_000_000).optional(),
  amount_cents: z.number().int().min(0).max(10_000_000).optional(),
  margin_cents: z.number().int().min(0).max(10_000_000).optional(),
  description: z.string().max(2000).nullable().optional(),
});

async function loadEntryWithPeriodStatus(adminClient: ReturnType<typeof createAdminClient>, id: string) {
  const { data: entry } = await adminClient
    .from('payroll_entries')
    .select('id, entry_type, period_id, video_count, rate_cents')
    .eq('id', id)
    .single();
  if (!entry) return { entry: null, periodStatus: null as string | null };
  const { data: period } = await adminClient
    .from('payroll_periods')
    .select('status')
    .eq('id', entry.period_id)
    .single();
  return { entry, periodStatus: (period?.status as string | null) ?? null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { entry, periodStatus } = await loadEntryWithPeriodStatus(ctx.adminClient, id);
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }
  if (periodStatus && periodStatus !== 'draft') {
    return NextResponse.json(
      { error: 'Cannot edit entries in a locked or paid period — unlock it first' },
      { status: 400 },
    );
  }

  // Blogging flat-amount rule — applied to the *resulting* entry shape.
  if (entry.entry_type === 'blogging') {
    const nextVideoCount = parsed.data.video_count ?? (entry.video_count as number | null) ?? 0;
    const nextRateCents = parsed.data.rate_cents ?? (entry.rate_cents as number | null) ?? 0;
    if (nextVideoCount > 0 || nextRateCents > 0) {
      return NextResponse.json(
        { error: 'Blogging entries are flat-amount only — video_count and rate_cents must be 0' },
        { status: 400 },
      );
    }
  }

  const { data, error } = await ctx.adminClient
    .from('payroll_entries')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[accounting] patch entry failed', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { entry, periodStatus } = await loadEntryWithPeriodStatus(ctx.adminClient, id);
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }
  if (periodStatus && periodStatus !== 'draft') {
    return NextResponse.json(
      { error: 'Cannot delete entries from a locked or paid period — unlock it first' },
      { status: 400 },
    );
  }

  const { error } = await ctx.adminClient.from('payroll_entries').delete().eq('id', id);
  if (error) {
    console.error('[accounting] delete entry failed', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/accounting/periods/[id]/payouts
 *
 * Aggregates every payroll_entry in the period by payee identity (either
 * team_member_id or normalised payee_label), joins to the matching
 * payroll_payouts row (Wise URL + status), and returns the controller-facing
 * roll-up. Auto-creates payout rows on first read so the UI always has a
 * stable id to PATCH against.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: periodId } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data: period } = await ctx.adminClient
    .from('payroll_periods')
    .select('id, start_date, end_date, half, status')
    .eq('id', periodId)
    .single();
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 });

  const { data: entries } = await ctx.adminClient
    .from('payroll_entries')
    .select('id, entry_type, team_member_id, payee_label, video_count, amount_cents, margin_cents, description')
    .eq('period_id', periodId);

  const memberIds = Array.from(
    new Set((entries ?? []).map((e) => e.team_member_id).filter(Boolean)),
  ) as string[];

  const { data: members } = memberIds.length
    ? await ctx.adminClient.from('team_members').select('id, full_name').in('id', memberIds)
    : { data: [] as { id: string; full_name: string | null }[] };

  const memberName = new Map((members ?? []).map((m) => [m.id, m.full_name ?? '']));

  // Group entries by payee identity. Key = `m:<id>` for team members, `l:<lower-trim>` for labels.
  const groups = new Map<string, PayoutGroup>();
  for (const e of entries ?? []) {
    const key = e.team_member_id
      ? `m:${e.team_member_id}`
      : `l:${(e.payee_label ?? '').trim().toLowerCase()}`;
    if (key === 'l:') continue;

    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(e);
      existing.total_cents += e.amount_cents ?? 0;
      existing.margin_cents += e.margin_cents ?? 0;
      existing.entry_types.add(e.entry_type);
    } else {
      groups.set(key, {
        team_member_id: e.team_member_id,
        payee_label: e.team_member_id ? null : (e.payee_label ?? '').trim(),
        display_name: e.team_member_id
          ? memberName.get(e.team_member_id) ?? 'Unknown'
          : (e.payee_label ?? '').trim(),
        total_cents: e.amount_cents ?? 0,
        margin_cents: e.margin_cents ?? 0,
        entry_types: new Set([e.entry_type]),
        entries: [e],
      });
    }
  }

  // Load existing payout rows for the period and key them the same way.
  const { data: existingPayouts } = await ctx.adminClient
    .from('payroll_payouts')
    .select('*')
    .eq('period_id', periodId);

  const payoutByKey = new Map<string, PayoutRow>();
  for (const p of existingPayouts ?? []) {
    const key = p.team_member_id
      ? `m:${p.team_member_id}`
      : `l:${(p.payee_label ?? '').trim().toLowerCase()}`;
    payoutByKey.set(key, p);
  }

  // Auto-create missing payout rows so the UI always has an id to PATCH.
  const toInsert: Array<{ period_id: string; team_member_id: string | null; payee_label: string | null }> = [];
  for (const [key, group] of groups) {
    if (!payoutByKey.has(key)) {
      toInsert.push({
        period_id: periodId,
        team_member_id: group.team_member_id,
        payee_label: group.team_member_id ? null : group.payee_label,
      });
    }
  }
  if (toInsert.length > 0) {
    const { data: inserted } = await ctx.adminClient
      .from('payroll_payouts')
      .insert(toInsert)
      .select('*');
    for (const p of inserted ?? []) {
      const key = p.team_member_id
        ? `m:${p.team_member_id}`
        : `l:${(p.payee_label ?? '').trim().toLowerCase()}`;
      payoutByKey.set(key, p);
    }
  }

  const payouts = Array.from(groups.entries())
    .map(([key, group]) => {
      const row = payoutByKey.get(key);
      return {
        id: row?.id ?? null,
        team_member_id: group.team_member_id,
        payee_label: group.payee_label,
        display_name: group.display_name,
        total_cents: group.total_cents,
        margin_cents: group.margin_cents,
        entry_types: Array.from(group.entry_types).sort(),
        entry_count: group.entries.length,
        wise_url: row?.wise_url ?? null,
        status: row?.status ?? 'pending',
        notes: row?.notes ?? null,
        paid_at: row?.paid_at ?? null,
      };
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({
    period_status: period.status,
    payouts,
  });
}

interface PayoutGroup {
  team_member_id: string | null;
  payee_label: string | null;
  display_name: string;
  total_cents: number;
  margin_cents: number;
  entry_types: Set<string>;
  entries: Array<{ id: string }>;
}

interface PayoutRow {
  id: string;
  team_member_id: string | null;
  payee_label: string | null;
  wise_url: string | null;
  status: 'pending' | 'link_received' | 'paid';
  notes: string | null;
  paid_at: string | null;
}

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

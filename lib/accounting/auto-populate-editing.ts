import type { SupabaseClient } from '@supabase/supabase-js';

export interface AutoPopulateResult {
  inserted: number;
  updated: number;
  skipped: number;
  details: string[];
}

interface PayrollPeriodRow {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface ConsumeRow {
  id: string;
  client_id: string | null;
  editor_user_id: string | null;
}

interface TeamMemberRow {
  id: string;
  user_id: string | null;
  full_name: string | null;
  cost_rate_cents_per_hour: number | null;
}

interface ExistingAutoRow {
  id: string;
  client_id: string | null;
  team_member_id: string | null;
  source: 'auto' | 'auto-edited';
}

const FALLBACK_RATE_CENTS = 4000;
const UNATTRIBUTED_TEAM_MEMBER_ID = '00000000-0000-0000-0000-0000000000ba';
const UNATTRIBUTED_KEY = '__unattributed__';

function periodEndExclusive(endDate: string): string {
  const [y, m, d] = endDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Sync editing payroll entries from approved deliverables for a single period.
 *
 * Reads `credit_transactions` consume rows for the `edited_video` deliverable
 * inside the period bounds, groups by (client, editor), and upserts one
 * `payroll_entries` row per group with `source = 'auto'`.
 *
 * Idempotent: re-running on the same period updates `video_count` and
 * `amount_cents` on existing `auto` rows, leaves `auto-edited` rows alone
 * (admin already touched them), and never touches `manual` rows.
 *
 * Editor rate falls back to FALLBACK_RATE_CENTS when
 * `team_members.cost_rate_cents_per_hour` is NULL, so a never-configured
 * editor still gets a row to fill in rather than silently dropping.
 */
export async function autoPopulateEditingForPeriod(
  supabase: SupabaseClient,
  periodId: string,
): Promise<AutoPopulateResult> {
  const result: AutoPopulateResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    details: [],
  };

  const { data: period } = await supabase
    .from('payroll_periods')
    .select('id, start_date, end_date, status')
    .eq('id', periodId)
    .maybeSingle<PayrollPeriodRow>();

  if (!period) {
    result.details.push(`Period ${periodId} not found`);
    return result;
  }
  if (period.status !== 'draft') {
    result.details.push(`Period is ${period.status}; sync only runs on draft periods`);
    return result;
  }

  const { data: editedType } = await supabase
    .from('deliverable_types')
    .select('id')
    .eq('slug', 'edited_video')
    .maybeSingle<{ id: string }>();
  if (!editedType?.id) {
    result.details.push('No deliverable_types row for edited_video; nothing to sync');
    return result;
  }

  const startIso = `${period.start_date}T00:00:00.000Z`;
  const endExclusiveIso = `${periodEndExclusive(period.end_date)}T00:00:00.000Z`;

  const [consumesRes, refundsRes] = await Promise.all([
    supabase
      .from('credit_transactions')
      .select('id, client_id, editor_user_id')
      .eq('kind', 'consume')
      .eq('deliverable_type_id', editedType.id)
      .gte('created_at', startIso)
      .lt('created_at', endExclusiveIso)
      .returns<ConsumeRow[]>(),
    supabase
      .from('credit_transactions')
      .select('id, client_id, editor_user_id')
      .eq('kind', 'refund')
      .eq('deliverable_type_id', editedType.id)
      .gte('created_at', startIso)
      .lt('created_at', endExclusiveIso)
      .returns<ConsumeRow[]>(),
  ]);

  const consumes = consumesRes.data ?? [];
  const refunds = refundsRes.data ?? [];

  const counts = new Map<string, { clientId: string; editorUserId: string; count: number }>();
  const keyOf = (clientId: string, editorUserId: string) => `${clientId}::${editorUserId}`;

  for (const row of consumes) {
    if (!row.client_id) {
      result.skipped += 1;
      continue;
    }
    const editorKey = row.editor_user_id ?? UNATTRIBUTED_KEY;
    const k = keyOf(row.client_id, editorKey);
    const existing = counts.get(k);
    if (existing) existing.count += 1;
    else counts.set(k, { clientId: row.client_id, editorUserId: editorKey, count: 1 });
  }
  for (const row of refunds) {
    if (!row.client_id) continue;
    const editorKey = row.editor_user_id ?? UNATTRIBUTED_KEY;
    const k = keyOf(row.client_id, editorKey);
    const existing = counts.get(k);
    if (existing) existing.count = Math.max(0, existing.count - 1);
  }

  const editorUserIds = Array.from(
    new Set(
      Array.from(counts.values())
        .map((g) => g.editorUserId)
        .filter((id) => id !== UNATTRIBUTED_KEY),
    ),
  );
  let editorByUserId = new Map<string, TeamMemberRow>();
  if (editorUserIds.length > 0) {
    const { data: members } = await supabase
      .from('team_members')
      .select('id, user_id, full_name, cost_rate_cents_per_hour')
      .in('user_id', editorUserIds)
      .returns<TeamMemberRow[]>();
    editorByUserId = new Map((members ?? []).map((m) => [m.user_id as string, m]));
  }

  const hasUnattributed = Array.from(counts.values()).some(
    (g) => g.editorUserId === UNATTRIBUTED_KEY && g.count > 0,
  );
  let unattributedMember: TeamMemberRow | null = null;
  if (hasUnattributed) {
    const { data: row } = await supabase
      .from('team_members')
      .select('id, user_id, full_name, cost_rate_cents_per_hour')
      .eq('id', UNATTRIBUTED_TEAM_MEMBER_ID)
      .maybeSingle<TeamMemberRow>();
    unattributedMember = row ?? null;
  }

  const { data: existingRows } = await supabase
    .from('payroll_entries')
    .select('id, client_id, team_member_id, source')
    .eq('period_id', period.id)
    .eq('entry_type', 'editing')
    .in('source', ['auto', 'auto-edited'])
    .returns<ExistingAutoRow[]>();

  const existingByKey = new Map<string, ExistingAutoRow>();
  for (const row of existingRows ?? []) {
    if (!row.client_id || !row.team_member_id) continue;
    existingByKey.set(`${row.client_id}::${row.team_member_id}`, row);
  }

  for (const group of counts.values()) {
    if (group.count <= 0) continue;
    let editor: TeamMemberRow | undefined | null;
    if (group.editorUserId === UNATTRIBUTED_KEY) {
      editor = unattributedMember;
      if (!editor) {
        result.skipped += 1;
        result.details.push(
          'Unattributed team_member seed row missing; run migration 236 then re-sync',
        );
        continue;
      }
    } else {
      editor = editorByUserId.get(group.editorUserId);
      if (!editor) {
        result.skipped += 1;
        result.details.push(
          `No team_members row for editor user ${group.editorUserId}; row not created`,
        );
        continue;
      }
    }
    const rateCents = editor.cost_rate_cents_per_hour ?? FALLBACK_RATE_CENTS;
    const amountCents = rateCents * group.count;

    const k = `${group.clientId}::${editor.id}`;
    const existing = existingByKey.get(k);

    if (!existing) {
      const { error } = await supabase.from('payroll_entries').insert({
        period_id: period.id,
        entry_type: 'editing',
        team_member_id: editor.id,
        client_id: group.clientId,
        video_count: group.count,
        rate_cents: rateCents,
        amount_cents: amountCents,
        margin_cents: 0,
        description:
          group.editorUserId === UNATTRIBUTED_KEY
            ? `Unattributed: ${group.count} edited video${group.count === 1 ? '' : 's'} need editor re-attribution`
            : `Auto-populated from approved deliverables (${group.count} edited video${group.count === 1 ? '' : 's'})`,
        source: 'auto',
      });
      if (error) {
        result.details.push(`Insert failed for editor ${editor.full_name ?? editor.id}: ${error.message}`);
        continue;
      }
      result.inserted += 1;
      continue;
    }

    if (existing.source === 'auto-edited') {
      result.skipped += 1;
      continue;
    }

    const { error } = await supabase
      .from('payroll_entries')
      .update({
        video_count: group.count,
        rate_cents: rateCents,
        amount_cents: amountCents,
        description:
          group.editorUserId === UNATTRIBUTED_KEY
            ? `Unattributed: ${group.count} edited video${group.count === 1 ? '' : 's'} need editor re-attribution`
            : `Auto-populated from approved deliverables (${group.count} edited video${group.count === 1 ? '' : 's'})`,
      })
      .eq('id', existing.id);
    if (error) {
      result.details.push(`Update failed for entry ${existing.id}: ${error.message}`);
      continue;
    }
    result.updated += 1;
  }

  return result;
}

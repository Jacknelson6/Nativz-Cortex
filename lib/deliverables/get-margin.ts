/**
 * Margin loader: per-editor breakdown for an admin period view.
 *
 * For every editor that consumed at least one deliverable in the window,
 * compute:
 *   • deliverables    - count of consume rows attributed to them
 *   • estimated_hours - Σ over their drop_videos: clamp(updated - created, 0.25, 8)
 *   • cost_cents      - hours * team_member.cost_rate_cents_per_hour
 *   • revenue_cents   - Σ deliverable_types.unit_cost_cents per consume row
 *   • margin_cents    - revenue - cost
 *
 * Editors with NULL `cost_rate_cents_per_hour` are excluded from cost/margin
 * math (no division-by-zero, no fake numbers). Their row still appears with
 * NULL cost / NULL margin so the operator can see "you forgot to set a rate
 * for this person" at a glance.
 *
 * The hours estimate is intentionally rough: we use revised_video_uploaded_at
 * minus created_at on content_drop_videos, clamped to [0.25, 8] hours per
 * row. The bounding is honest about the imprecision and keeps pathological
 * timestamps (clock skew, week-old drafts) from skewing the totals.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EditorMarginRow {
  editorUserId: string;
  fullName: string;
  avatarUrl: string | null;
  deliverables: number;
  estimatedHours: number;
  costCents: number | null;
  revenueCents: number;
  marginCents: number | null;
  /** True when team_members.cost_rate_cents_per_hour is NULL (no denominator). */
  rateMissing: boolean;
}

export interface MarginSnapshot {
  rows: EditorMarginRow[];
  totals: {
    deliverables: number;
    estimatedHours: number;
    costCents: number;
    revenueCents: number;
    marginCents: number;
  };
  /** Period bounds the loader actually used (echoes inputs after defaults). */
  periodStart: string;
  periodEnd: string;
}

const HOUR_MIN = 0.25;
const HOUR_MAX = 8;

interface ConsumeRow {
  editor_user_id: string;
  charge_unit_kind: string;
  charge_unit_id: string;
  deliverable_type_id: string;
}

interface TypeRow {
  id: string;
  unit_cost_cents: number;
}

interface DropVideoRow {
  id: string;
  created_at: string;
  revised_video_uploaded_at: string | null;
}

interface MemberRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  cost_rate_cents_per_hour: number | null;
}

export async function getEditorMargin(
  admin: SupabaseClient,
  clientId: string,
  periodStart: string,
  periodEnd: string,
): Promise<MarginSnapshot> {
  // 1. Pull every consume row for this client in the window that carries
  //    an editor attribution. NULL-attribution rows are excluded - we
  //    can't credit them to anyone.
  const { data: consumes } = await admin
    .from('credit_transactions')
    .select('editor_user_id, charge_unit_kind, charge_unit_id, deliverable_type_id')
    .eq('client_id', clientId)
    .eq('kind', 'consume')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd)
    .not('editor_user_id', 'is', null)
    .returns<ConsumeRow[]>();

  const rows = consumes ?? [];
  if (rows.length === 0) {
    return {
      rows: [],
      totals: zeroTotals(),
      periodStart,
      periodEnd,
    };
  }

  const editorIds = Array.from(new Set(rows.map((r) => r.editor_user_id)));
  const dropVideoIds = Array.from(
    new Set(
      rows.filter((r) => r.charge_unit_kind === 'drop_video').map((r) => r.charge_unit_id),
    ),
  );
  const typeIds = Array.from(new Set(rows.map((r) => r.deliverable_type_id)));

  const [{ data: types }, { data: members }, { data: videos }] = await Promise.all([
    admin
      .from('deliverable_types')
      .select('id, unit_cost_cents')
      .in('id', typeIds)
      .returns<TypeRow[]>(),
    admin
      .from('team_members')
      .select('user_id, full_name, avatar_url, cost_rate_cents_per_hour')
      .in('user_id', editorIds)
      .returns<MemberRow[]>(),
    dropVideoIds.length > 0
      ? admin
          .from('content_drop_videos')
          .select('id, created_at, revised_video_uploaded_at')
          .in('id', dropVideoIds)
          .returns<DropVideoRow[]>()
      : Promise.resolve({ data: [] as DropVideoRow[] }),
  ]);

  const costByTypeId = new Map(
    (types ?? []).map((t) => [t.id, t.unit_cost_cents] as const),
  );
  const memberByUserId = new Map(
    (members ?? []).map((m) => [m.user_id, m] as const),
  );
  const videoById = new Map(
    (videos ?? []).map((v) => [v.id, v] as const),
  );

  // 2. Aggregate per editor.
  interface Bucket {
    deliverables: number;
    revenueCents: number;
    hours: number;
  }
  const byEditor = new Map<string, Bucket>();
  for (const r of rows) {
    const b = byEditor.get(r.editor_user_id) ?? {
      deliverables: 0,
      revenueCents: 0,
      hours: 0,
    };
    b.deliverables += 1;
    b.revenueCents += costByTypeId.get(r.deliverable_type_id) ?? 0;
    if (r.charge_unit_kind === 'drop_video') {
      const v = videoById.get(r.charge_unit_id);
      if (v?.revised_video_uploaded_at) {
        const elapsedH =
          (new Date(v.revised_video_uploaded_at).getTime() -
            new Date(v.created_at).getTime()) /
          3_600_000;
        b.hours += clamp(elapsedH, HOUR_MIN, HOUR_MAX);
      } else {
        b.hours += HOUR_MIN; // no revision timestamp, assume the floor
      }
    } else {
      b.hours += HOUR_MIN;
    }
    byEditor.set(r.editor_user_id, b);
  }

  // 3. Map -> rows with full member metadata + cost/margin.
  const out: EditorMarginRow[] = [];
  for (const [editorUserId, b] of byEditor) {
    const m = memberByUserId.get(editorUserId);
    const rateMissing = !m?.cost_rate_cents_per_hour;
    const costCents = rateMissing
      ? null
      : Math.round(b.hours * (m!.cost_rate_cents_per_hour as number));
    const marginCents = costCents == null ? null : b.revenueCents - costCents;

    out.push({
      editorUserId,
      fullName: m?.full_name ?? 'Unknown editor',
      avatarUrl: m?.avatar_url ?? null,
      deliverables: b.deliverables,
      estimatedHours: round1(b.hours),
      costCents,
      revenueCents: b.revenueCents,
      marginCents,
      rateMissing,
    });
  }

  // Highest margin first; rate-missing rows sink to the bottom.
  out.sort((a, b) => {
    if (a.rateMissing !== b.rateMissing) return a.rateMissing ? 1 : -1;
    return (b.marginCents ?? -Infinity) - (a.marginCents ?? -Infinity);
  });

  const totals = out.reduce(
    (acc, r) => {
      acc.deliverables += r.deliverables;
      acc.estimatedHours += r.estimatedHours;
      acc.revenueCents += r.revenueCents;
      if (r.costCents != null) acc.costCents += r.costCents;
      if (r.marginCents != null) acc.marginCents += r.marginCents;
      return acc;
    },
    zeroTotals(),
  );
  totals.estimatedHours = round1(totals.estimatedHours);

  return { rows: out, totals, periodStart, periodEnd };
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function zeroTotals(): MarginSnapshot['totals'] {
  return {
    deliverables: 0,
    estimatedHours: 0,
    costCents: 0,
    revenueCents: 0,
    marginCents: 0,
  };
}

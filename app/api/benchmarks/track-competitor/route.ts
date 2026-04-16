import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const CompetitorSchema = z.object({
  username: z.string().min(1),
  displayName: z.string().min(1),
  platform: z.enum(['tiktok', 'instagram', 'facebook', 'youtube']),
  profileUrl: z.string().url(),
  avatarUrl: z.string().nullable().optional(),
  baselineFollowers: z.number().nullable().optional(),
  baselineAvgViews: z.number().nullable().optional(),
  baselineEngagementRate: z.number().nullable().optional(),
  baselinePostingFrequency: z.string().nullable().optional(),
});

const Schema = z.object({
  client_id: z.string().uuid(),
  audit_id: z.string().uuid(),
  competitor: CompetitorSchema,
});

type SnapshotCompetitor = z.infer<typeof CompetitorSchema>;

/**
 * POST /api/benchmarks/track-competitor
 *
 * Adds a single competitor (from an audit's competitor card) to the client's
 * benchmark snapshot for that audit. Creates the `client_benchmarks` row if
 * one doesn't exist yet — otherwise appends to its `competitors_snapshot`
 * array. Idempotent: re-tracking a competitor already in the snapshot is a
 * no-op + returns `already_tracked`.
 *
 * Admin-only — benchmark rows belong to the agency view, never the portal.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!me || !['admin', 'super_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { client_id, audit_id, competitor } = parsed.data;

  const { data: client } = await admin
    .from('clients')
    .select('id, is_active')
    .eq('id', client_id)
    .maybeSingle();
  if (!client || !client.is_active) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const { data: audit } = await admin
    .from('prospect_audits')
    .select('id, status')
    .eq('id', audit_id)
    .maybeSingle();
  if (!audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  // Find an existing active benchmark for this (client, audit). The cron
  // gates on is_active so a soft-deleted row shouldn't be re-used.
  const { data: existing } = await admin
    .from('client_benchmarks')
    .select('id, competitors_snapshot')
    .eq('client_id', client_id)
    .eq('audit_id', audit_id)
    .eq('is_active', true)
    .maybeSingle();

  // Match on (platform, username) — same identity the cron uses when
  // looking up prior snapshots.
  const isSameCompetitor = (a: SnapshotCompetitor, b: SnapshotCompetitor) =>
    a.platform === b.platform &&
    a.username.toLowerCase() === b.username.toLowerCase();

  if (existing) {
    const snapshot = (existing.competitors_snapshot ?? []) as SnapshotCompetitor[];
    if (snapshot.some((c) => isSameCompetitor(c, competitor))) {
      return NextResponse.json({
        benchmark_id: existing.id,
        action: 'already_tracked',
      });
    }
    const next = [...snapshot, competitor];
    const { error: updErr } = await admin
      .from('client_benchmarks')
      .update({ competitors_snapshot: next })
      .eq('id', existing.id);
    if (updErr) {
      console.error('[track-competitor] update failed:', updErr);
      return NextResponse.json({ error: 'Failed to track competitor' }, { status: 500 });
    }
    return NextResponse.json({
      benchmark_id: existing.id,
      action: 'appended',
      competitorsCount: next.length,
    });
  }

  // No benchmark yet — create one with this single competitor. Mirrors the
  // shape used by the post-completion auto-benchmark in process/route.ts.
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + 7);
  const { data: inserted, error: insErr } = await admin
    .from('client_benchmarks')
    .insert({
      client_id,
      audit_id,
      competitors_snapshot: [competitor],
      cadence: 'weekly',
      analytics_source: 'auto',
      next_snapshot_due_at: nextDue.toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error('[track-competitor] insert failed:', insErr);
    return NextResponse.json({ error: 'Failed to create benchmark' }, { status: 500 });
  }

  return NextResponse.json({
    benchmark_id: inserted.id,
    action: 'created',
    competitorsCount: 1,
  });
}

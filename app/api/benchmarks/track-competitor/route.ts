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
 * Appends a competitor profile (from an audit) to the brand's single active
 * baseline benchmark — the row created by /api/spying/baseline with
 * `audit_id: null`. Idempotent: re-tracking a competitor already in the
 * snapshot is a no-op + returns `already_tracked`.
 *
 * If the brand has no baseline benchmark yet, returns 412 with
 * `needs_baseline: true` so the UI can route to the Spy hub for that brand
 * to run the onboarding gate.
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
    .select('id, name, is_active')
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

  // Find the brand's single baseline benchmark (audit_id IS NULL). The
  // baseline is the only place new competitors get appended in the new
  // model — per-audit benchmarks are gone. If multiple legacy baselines
  // exist (shouldn't happen), pick the most recent.
  const { data: baseline } = await admin
    .from('client_benchmarks')
    .select('id, competitors_snapshot')
    .eq('client_id', client_id)
    .eq('is_active', true)
    .is('audit_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!baseline) {
    return NextResponse.json(
      {
        error: 'Baseline missing',
        needs_baseline: true,
        message: `Run the Spy baseline for ${client.name} before tracking competitors.`,
      },
      { status: 412 },
    );
  }

  // Match on (platform, username) — same identity the cron uses when
  // looking up prior snapshots.
  const isSameCompetitor = (a: SnapshotCompetitor, b: SnapshotCompetitor) =>
    a.platform === b.platform &&
    a.username.toLowerCase() === b.username.toLowerCase();

  const snapshot = (baseline.competitors_snapshot ?? []) as SnapshotCompetitor[];
  if (snapshot.some((c) => isSameCompetitor(c, competitor))) {
    return NextResponse.json({
      benchmark_id: baseline.id,
      action: 'already_tracked',
    });
  }
  const next = [...snapshot, competitor];
  const { error: updErr } = await admin
    .from('client_benchmarks')
    .update({ competitors_snapshot: next })
    .eq('id', baseline.id);
  if (updErr) {
    console.error('[track-competitor] update failed:', updErr);
    return NextResponse.json({ error: 'Failed to track competitor' }, { status: 500 });
  }
  return NextResponse.json({
    benchmark_id: baseline.id,
    action: 'appended',
    competitorsCount: next.length,
  });
}

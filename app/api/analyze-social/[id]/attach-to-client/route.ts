import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CompetitorProfile } from '@/lib/audit/types';

export const maxDuration = 30;

const Schema = z.object({
  clientId: z.string().uuid(),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']).optional().default('weekly'),
  analyticsSource: z
    .enum(['auto', 'scrape', 'client_analytics'])
    .optional()
    .default('auto'),
  dateRangeStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional()
    .nullable(),
  dateRangeEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
});

/**
 * POST /api/analyze-social/[id]/attach-to-client
 *
 * Phase 1 of competitor benchmarking. An admin attaches a completed audit to
 * a client so Phase 2's weekly cron can track the audit's competitor list
 * on an ongoing basis.
 *
 * Admin-only — portal viewers see a "contact your team" placeholder on the
 * report page and never reach this route. We still enforce the role check
 * server-side as defense-in-depth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Role gate — benchmark rows are admin-only per product requirements.
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin') {
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

  const { clientId, cadence, analyticsSource, dateRangeStart, dateRangeEnd, notes } =
    parsed.data;

  // Load the audit + verify it completed. Attaching an in-flight or failed
  // audit wouldn't give the cron a stable baseline to track against.
  const { data: audit, error: auditErr } = await admin
    .from('prospect_audits')
    .select('id, status, competitors_data')
    .eq('id', id)
    .single();
  if (auditErr || !audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }
  if (audit.status !== 'completed') {
    return NextResponse.json(
      { error: 'Audit must be completed before attaching to a client' },
      { status: 400 },
    );
  }

  // Verify the target client exists + is active.
  const { data: client } = await admin
    .from('clients')
    .select('id, is_active')
    .eq('id', clientId)
    .maybeSingle();
  if (!client || !client.is_active) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  // Freeze a slim copy of the competitor list. We only keep the fields the
  // Phase 2 cron needs to re-scrape (username, platform, profileUrl) + the
  // baseline metrics we'll diff against. Big payload bits (recentVideos)
  // live on the audit row itself and can be fetched when needed.
  const competitorsSnapshot = (audit.competitors_data as CompetitorProfile[] | null ?? [])
    .map((c) => ({
      username: c.username,
      displayName: c.displayName,
      platform: c.platform,
      profileUrl: c.profileUrl,
      avatarUrl: c.avatarUrl,
      baselineFollowers: c.followers,
      baselineAvgViews: c.avgViews,
      baselineEngagementRate: c.engagementRate,
      baselinePostingFrequency: c.postingFrequency,
    }));

  // Compute the initial `next_snapshot_due_at` so Phase 2's cron has a
  // ready-to-go queue without needing a second mutation after insert.
  const cadenceDays: Record<typeof cadence, number> = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
  };
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + cadenceDays[cadence]);

  const { data: inserted, error: insertErr } = await admin
    .from('client_benchmarks')
    .insert({
      client_id: clientId,
      audit_id: id,
      competitors_snapshot: competitorsSnapshot,
      cadence,
      analytics_source: analyticsSource,
      date_range_start: dateRangeStart ?? null,
      date_range_end: dateRangeEnd ?? null,
      notes: notes ?? null,
      next_snapshot_due_at: nextDue.toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[attach-to-client] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to attach audit' }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    clientId,
    competitorsCount: competitorsSnapshot.length,
  });
}

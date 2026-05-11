// ZNA-01 T12: POST /api/admin/analytics/backfill
//
// Hydrates historical platform_snapshots rows for a client newly
// converted from prospect → client. Uses the source router + adapters
// shipped in ZNA-01 so attribution is correct for the backfilled days.
//
// For v1, runs inline when (days * platforms) <= 50; larger ranges
// return a "scheduled" stub the caller can re-poll once an async
// queue lands (ZNA-01 follow-up).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAnalyticsSource } from '@/lib/analytics/source-router';
import { fetchZernioPlatformSnapshot } from '@/lib/analytics/zernio-adapter';
import { fetchScrapePlatformSnapshot } from '@/lib/analytics/scrape-adapter';
import type {
  AnalyticsPlatform,
  AnalyticsSource,
  PlatformSnapshotInsert,
} from '@/lib/analytics/types';

export const dynamic = 'force-dynamic';

const PlatformEnum = z.enum(['tiktok', 'instagram', 'facebook', 'youtube']);

const RequestSchema = z.object({
  client_id: z.string().uuid(),
  days: z.number().int().min(1).max(180).default(90),
  platforms: z.array(PlatformEnum).optional(),
  source_override: z.enum(['zernio', 'scrape', 'apify']).optional(),
});

const ADMIN_ROLES = ['admin', 'super_admin'];
const INLINE_THRESHOLD = 50;

async function requireAdmin(): Promise<
  | { ok: true; userId: string; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const allowed =
    me &&
    (ADMIN_ROLES.includes((me as { role: string }).role) ||
      (me as { is_super_admin?: boolean }).is_super_admin);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, admin };
}

function daysAgoIso(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { client_id, days, platforms, source_override } = parsed.data;

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id')
    .eq('client_id', client_id);
  const rows = (profiles ?? []) as Array<{
    id: string;
    platform: AnalyticsPlatform;
    late_account_id: string | null;
  }>;
  const targetPlatforms: AnalyticsPlatform[] = platforms
    ? rows.filter((r) => platforms.includes(r.platform)).map((r) => r.platform)
    : rows.map((r) => r.platform);

  const totalRuns = days * targetPlatforms.length;
  if (totalRuns === 0) {
    return NextResponse.json({
      job_id: crypto.randomUUID(),
      scheduled_runs: 0,
      message: 'No connected platforms for client; nothing to backfill.',
    });
  }

  if (totalRuns > INLINE_THRESHOLD) {
    // v1: indicate the work needs an async queue (follow-up). Return a
    // job id so callers can fail fast without partial inline writes.
    return NextResponse.json({
      job_id: crypto.randomUUID(),
      scheduled_runs: totalRuns,
      message: `Backfill of ${totalRuns} runs exceeds inline threshold (${INLINE_THRESHOLD}). Queue not yet implemented; reduce --days or rerun per platform.`,
    });
  }

  let inserted = 0;
  const errors: Array<{ platform: AnalyticsPlatform; date: string; error: string }> = [];

  for (const profile of rows) {
    if (!targetPlatforms.includes(profile.platform)) continue;

    for (let dayOffset = 1; dayOffset <= days; dayOffset++) {
      const date = daysAgoIso(dayOffset);
      try {
        const resolution = source_override
          ? { source: source_override as AnalyticsSource, source_version: `${source_override}-override`, reason: 'zernio_connected' as const }
          : await resolveAnalyticsSource(client_id, profile.platform);
        if (!resolution) continue;

        let snapshot: PlatformSnapshotInsert;
        if (resolution.source === 'zernio' && profile.late_account_id) {
          snapshot = await fetchZernioPlatformSnapshot({
            clientId: client_id,
            socialProfileId: profile.id,
            platform: profile.platform,
            lateAccountId: profile.late_account_id,
            date,
          });
        } else {
          snapshot = await fetchScrapePlatformSnapshot({
            clientId: client_id,
            socialProfileId: profile.id,
            platform: profile.platform,
            date,
          });
        }

        const { error: upsertErr } = await admin
          .from('platform_snapshots')
          .upsert(snapshot, { onConflict: 'social_profile_id,snapshot_date' });
        if (upsertErr) throw upsertErr;
        inserted += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown';
        errors.push({ platform: profile.platform, date, error: msg });
        await admin.from('platform_snapshot_errors').insert({
          client_id,
          social_profile_id: profile.id,
          platform: profile.platform,
          attempted_source: source_override ?? 'scrape',
          error_code: 'backfill_failure',
          error_message: msg,
        });
      }
    }
  }

  return NextResponse.json({
    job_id: crypto.randomUUID(),
    scheduled_runs: totalRuns,
    inserted,
    errors,
    message: `Backfill complete: ${inserted}/${totalRuns} rows.`,
  });
}

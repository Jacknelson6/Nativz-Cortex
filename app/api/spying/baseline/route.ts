import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const Schema = z.object({
  client_id: z.string().uuid(),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']).default('weekly'),
});

interface BaselineProfile {
  platform: 'instagram' | 'tiktok';
  username: string;
  profileUrl: string;
  displayName: string;
}

function buildProfileUrl(platform: 'instagram' | 'tiktok', username: string): string {
  const handle = username.replace(/^@/, '');
  if (platform === 'tiktok') return `https://www.tiktok.com/@${handle}`;
  return `https://www.instagram.com/${handle}/`;
}

/**
 * POST /api/spying/baseline — create the per-brand baseline benchmark.
 *
 * Pulls the brand's connected IG + TikTok handles from `social_profiles`,
 * creates a fresh `client_benchmarks` row whose `competitors_snapshot` is
 * the brand itself, and stamps `next_snapshot_due_at = now()` so the daily
 * cron picks it up and writes the first scored snapshot on its next run.
 *
 * The brand's own scoring lives in the same table the leaderboard reads from
 * — no parallel "self vs. competitors" split. The brand is just the first
 * profile in the list; competitor profiles are appended as audits get
 * attached.
 *
 * Returns 422 with `missing_handles: true` when the brand has neither IG nor
 * TikTok wired up, so the UI can route to settings instead of failing
 * silently.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!(me?.role === 'admin' || me?.role === 'super_admin' || me?.is_super_admin)) {
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

  const { client_id, cadence } = parsed.data;

  const { data: client } = await admin
    .from('clients')
    .select('id, name, is_active')
    .eq('id', client_id)
    .maybeSingle();
  if (!client || !client.is_active) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  // One baseline per brand. If something already exists, return it idempotently
  // so the gate's CTA is safe to re-click.
  const { data: existing } = await admin
    .from('client_benchmarks')
    .select('id')
    .eq('client_id', client_id)
    .eq('is_active', true)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ benchmark_id: existing.id, created: false });
  }

  const { data: socials } = await admin
    .from('social_profiles')
    .select('platform, username, avatar_url, no_account')
    .eq('client_id', client_id)
    .in('platform', ['instagram', 'tiktok'])
    .neq('no_account', true);

  const profiles: BaselineProfile[] = (socials ?? [])
    .filter((s): s is { platform: 'instagram' | 'tiktok'; username: string; avatar_url: string | null; no_account: boolean | null } => {
      return (
        (s.platform === 'instagram' || s.platform === 'tiktok') &&
        typeof s.username === 'string' &&
        s.username.trim().length > 0
      );
    })
    .map((s) => ({
      platform: s.platform,
      username: s.username,
      profileUrl: buildProfileUrl(s.platform, s.username),
      displayName: client.name,
    }));

  if (profiles.length === 0) {
    return NextResponse.json(
      {
        error: 'Missing handles',
        missing_handles: true,
        message: 'Connect Instagram or TikTok in brand settings before running the Spy baseline.',
      },
      { status: 422 },
    );
  }

  const { data: inserted, error } = await admin
    .from('client_benchmarks')
    .insert({
      client_id,
      audit_id: null,
      competitors_snapshot: profiles,
      cadence,
      analytics_source: 'scrape',
      // Due immediately — cron picks it up on its next run (within 24h).
      next_snapshot_due_at: new Date().toISOString(),
      created_by: user.id,
      notes: 'Spy baseline (auto-created from brand social_profiles)',
    })
    .select('id')
    .single();

  if (error || !inserted) {
    console.error('[spying/baseline] insert failed:', error);
    return NextResponse.json({ error: 'Failed to create baseline' }, { status: 500 });
  }

  return NextResponse.json({
    benchmark_id: inserted.id,
    created: true,
    profiles_count: profiles.length,
    profiles: profiles.map((p) => ({ platform: p.platform, username: p.username })),
  });
}

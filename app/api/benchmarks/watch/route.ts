import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

type PlatformSlug = 'tiktok' | 'instagram' | 'facebook' | 'youtube';

interface ParsedProfile {
  platform: PlatformSlug;
  username: string;
  profileUrl: string;
  displayName: string;
}

const Schema = z.object({
  client_id: z.string().uuid(),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']),
  urls: z.array(z.string().url()).min(1).max(5),
});

function parseProfile(raw: string): ParsedProfile | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const segs = url.pathname.split('/').filter(Boolean);

  if (host === 'tiktok.com') {
    const handle = segs[0]?.replace(/^@/, '');
    if (!handle) return null;
    return {
      platform: 'tiktok',
      username: handle,
      profileUrl: `https://www.tiktok.com/@${handle}`,
      displayName: handle,
    };
  }
  if (host === 'instagram.com') {
    const handle = segs[0];
    if (!handle) return null;
    return {
      platform: 'instagram',
      username: handle,
      profileUrl: `https://www.instagram.com/${handle}/`,
      displayName: handle,
    };
  }
  if (host === 'youtube.com' || host === 'youtu.be') {
    const handle = segs[0]?.replace(/^@/, '');
    if (!handle) return null;
    return {
      platform: 'youtube',
      username: handle,
      profileUrl: `https://www.youtube.com/@${handle}`,
      displayName: handle,
    };
  }
  if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.com') {
    const handle = segs[0];
    if (!handle) return null;
    return {
      platform: 'facebook',
      username: handle,
      profileUrl: `https://www.facebook.com/${handle}/`,
      displayName: handle,
    };
  }
  return null;
}

const CADENCE_DAYS = { weekly: 7, biweekly: 14, monthly: 30 } as const;

/**
 * POST /api/benchmarks/watch — bulk-enrol multiple competitor URLs under
 * a single client_benchmarks row, created fresh (no audit origin).
 * Used by the /admin/competitor-intelligence/watch wizard.
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

  const { client_id, cadence, urls } = parsed.data;
  const profiles = urls.map(parseProfile).filter((p): p is ParsedProfile => p !== null);
  if (profiles.length === 0) {
    return NextResponse.json({ error: 'No valid URLs provided' }, { status: 400 });
  }

  const { data: client } = await admin
    .from('clients')
    .select('id, is_active')
    .eq('id', client_id)
    .maybeSingle();
  if (!client || !client.is_active) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + CADENCE_DAYS[cadence]);

  const { data: inserted, error } = await admin
    .from('client_benchmarks')
    .insert({
      client_id,
      audit_id: null,
      competitors_snapshot: profiles,
      cadence,
      analytics_source: 'watch',
      next_snapshot_due_at: nextDue.toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    console.error('[benchmarks/watch] insert failed:', error);
    return NextResponse.json({ error: 'Failed to create benchmark' }, { status: 500 });
  }

  return NextResponse.json({
    benchmark_id: inserted.id,
    competitors_count: profiles.length,
    cadence,
  });
}

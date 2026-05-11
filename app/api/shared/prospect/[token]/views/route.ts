// SPY-04 T18: public analytics ping. Records a view of a prospect
// share link. No auth. IP-hash rate-limit: 1 view per minute per
// (link, hashed_ip) tuple so the public page's beacon can fire on every
// load without inflating the count.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Schema = z.object({
  referrer: z.string().max(500).optional(),
  duration_ms: z.number().int().min(0).max(86_400_000).optional(),
});

function hashIp(ip: string): string {
  const salt = process.env.PROSPECT_VIEW_IP_SALT ?? 'cortex-prospect-share';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: link } = await admin
      .from('prospect_share_links')
      .select('id, archived_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (!link || link.archived_at) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Share link expired' }, { status: 404 });
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const ua = request.headers.get('user-agent') ?? null;
    const ipHash = hashIp(ip);

    // Rate limit: skip if same (link, ip) was recorded within the last 60s.
    const sinceIso = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await admin
      .from('prospect_share_link_views')
      .select('id')
      .eq('share_link_id', link.id)
      .eq('viewer_ip_hash', ipHash)
      .gte('viewed_at', sinceIso)
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await admin.from('prospect_share_link_views').insert({
      share_link_id: link.id,
      viewer_ip_hash: ipHash,
      viewer_ua: ua,
      referrer: parsed.data.referrer ?? null,
      duration_ms: parsed.data.duration_ms ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/shared/prospect/[token]/views error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

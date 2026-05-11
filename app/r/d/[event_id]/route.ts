// SPY-10 T18: digest click-tracker.
//
// /r/d/<event_id>?to=<encoded_url> — public route. 302s to the decoded
// target after inserting a digest_event(kind='clicked') row tagged with
// the event_id-resolved draft + prospect, plus ip_hash + UA. Rejects
// non-http(s) destinations to neutralize JS / data URL abuse.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface RouteCtx {
  params: Promise<{ event_id: string }>;
}

function safeDestination(raw: string | null): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  try {
    const url = new URL(decoded);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hashIp(ip: string | null): string {
  const salt = process.env.PROSPECT_LEAD_IP_SALT ?? 'cortex-prospect-lead';
  return crypto
    .createHash('sha256')
    .update(`${salt}:${ip ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32);
}

export async function GET(req: Request, { params }: RouteCtx) {
  const { event_id } = await params;
  const url = new URL(req.url);
  const dest = safeDestination(url.searchParams.get('to'));
  if (!dest) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  }

  // Best-effort log; never block the redirect on a write error.
  try {
    const admin = createAdminClient();
    const { data: tracker } = await admin
      .from('prospect_digest_events')
      .select('draft_id, prospect_id')
      .eq('id', event_id)
      .maybeSingle();
    if (tracker) {
      const h = await headers();
      const fwd = h.get('x-forwarded-for');
      const ip = fwd ? (fwd.split(',')[0]?.trim() ?? null) : h.get('x-real-ip');
      await admin.from('prospect_digest_events').insert({
        draft_id: tracker.draft_id,
        prospect_id: tracker.prospect_id,
        kind: 'clicked',
        target_url: dest,
        user_agent: h.get('user-agent'),
        ip_hash: hashIp(ip),
      });
    }
  } catch (err) {
    console.error('[r/d] tracker write failed (non-blocking):', err);
  }

  return NextResponse.redirect(dest, 302);
}

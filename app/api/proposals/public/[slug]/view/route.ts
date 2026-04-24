import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, ipFromRequest } from '@/lib/rate-limit/in-memory';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ip = ipFromRequest(req.headers);
  const rl = checkRateLimit(`view:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from('proposals')
    .select('id, status, viewed_at, expires_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ua = req.headers.get('user-agent') ?? null;

  await admin.from('proposal_events').insert({
    proposal_id: proposal.id,
    type: 'viewed',
    ip,
    user_agent: ua,
  });

  if (!proposal.viewed_at && proposal.status === 'sent') {
    await admin
      .from('proposals')
      .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('id', proposal.id);
  }

  return NextResponse.json({ ok: true });
}

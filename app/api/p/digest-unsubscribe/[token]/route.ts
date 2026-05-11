// SPY-10 T19 (server side): per-token unsubscribe POST handler.
//
// Body: { mode: 'per_type' | 'all_stop', kind?: DigestKind }
// - per_type: deactivates only the subscription whose unsubscribe_token matches.
// - all_stop: deactivates every subscription for the prospect attached to the
//   matched subscription.
// Always logs a digest_event(kind='unsubscribed') for the matched subscription.
// Graceful when the token is unknown or already deactivated.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  mode: z.enum(['per_type', 'all_stop']),
});

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: RouteCtx) {
  const { token } = await params;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from('prospect_digest_subscriptions')
    .select('id, prospect_id, kind, active')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (!sub) {
    // Token unknown: still acknowledge so the recipient gets a clean
    // confirmation page rather than a 404.
    return NextResponse.json({ ok: true, note: 'token not found' });
  }

  const nowIso = new Date().toISOString();

  if (parsed.data.mode === 'per_type') {
    await admin
      .from('prospect_digest_subscriptions')
      .update({
        active: false,
        unsubscribed_at: nowIso,
        unsubscribed_via: 'per_type',
      })
      .eq('id', sub.id);
  } else {
    await admin
      .from('prospect_digest_subscriptions')
      .update({
        active: false,
        unsubscribed_at: nowIso,
        unsubscribed_via: 'all_stop',
      })
      .eq('prospect_id', sub.prospect_id);
  }

  // Log an unsubscribed event on the most recent draft for this subscription.
  const { data: latestDraft } = await admin
    .from('prospect_digest_drafts')
    .select('id')
    .eq('subscription_id', sub.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestDraft) {
    await admin.from('prospect_digest_events').insert({
      draft_id: latestDraft.id,
      prospect_id: sub.prospect_id,
      kind: 'unsubscribed',
      target_url: parsed.data.mode === 'all_stop' ? 'all_stop' : 'per_type',
    });
  }

  return NextResponse.json({ ok: true });
}

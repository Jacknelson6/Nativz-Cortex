// SPY-10 T20: daily cron that builds drafts for due digest subscriptions.
//
// Auth: CRON_SECRET via Authorization: Bearer or ?secret=... query string.
// Walks every active subscription, determines due-ness, calls buildDraft.
// Reports per-subscription outcomes for observability.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildDraft } from '@/lib/prospects/digest-builder';
import type { DigestSubscription } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unguarded in dev when CRON_SECRET is unset
  const url = new URL(req.url);
  const q = url.searchParams.get('secret');
  if (q && q === secret) return true;
  const h = req.headers.get('authorization');
  if (h && h === `Bearer ${secret}`) return true;
  return false;
}

function isDue(sub: DigestSubscription, now: number): boolean {
  const start = new Date(sub.start_date).getTime();
  if (Number.isFinite(start) && start > now) return false;
  if (!sub.last_built_at) return true;
  const since = now - new Date(sub.last_built_at).getTime();
  return sub.kind === 'weekly_competitor' ? since >= WEEK_MS : since >= MONTH_MS;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return run();
}

async function run() {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: subs } = await admin
    .from('prospect_digest_subscriptions')
    .select(
      'id, prospect_id, kind, active, start_date, last_built_at, last_sent_at, unsubscribed_at, unsubscribed_via, unsubscribe_token',
    )
    .eq('active', true);

  const results: Array<{ subscription_id: string; outcome: string; draft_id: string | null }> = [];
  const readyDraftIds: string[] = [];

  for (const sub of (subs ?? []) as DigestSubscription[]) {
    if (!isDue(sub, now)) {
      results.push({ subscription_id: sub.id, outcome: 'not_due', draft_id: null });
      continue;
    }
    try {
      const result = await buildDraft(sub);
      const outcome = result.ok
        ? 'built'
        : (result.skipped ?? (result.error ? 'error' : 'unknown'));
      results.push({ subscription_id: sub.id, outcome, draft_id: result.draftId });
      if (result.draftId) readyDraftIds.push(result.draftId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      results.push({ subscription_id: sub.id, outcome: `crash:${message}`, draft_id: null });
    }
  }

  // Best-effort push notification: post to PUSH_NOTIFY_URL if set.
  if (readyDraftIds.length > 0 && process.env.PUSH_NOTIFY_URL) {
    try {
      await fetch(process.env.PUSH_NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Digests ready for review',
          body: `${readyDraftIds.length} prospect digest${readyDraftIds.length === 1 ? '' : 's'} drafted.`,
        }),
      });
    } catch {
      // swallow
    }
  }

  // Also expire any drafts past their expires_at.
  await admin
    .from('prospect_digest_drafts')
    .update({ status: 'expired' })
    .eq('status', 'drafted')
    .lt('expires_at', new Date().toISOString());

  return NextResponse.json({ ok: true, built: readyDraftIds.length, results });
}

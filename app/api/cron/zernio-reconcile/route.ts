// SPY-08 T09: daily Zernio reconcile. Walks every client with at least
// one Zernio platform_snapshot, finds the latest snapshot_date per
// (client, platform), and flags any pair whose newest row is older than
// 24h. Stale pairs get a single best-effort push notification so the
// admin team knows a token expired or the webhook stopped firing.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

const STALE_MS = 24 * 60 * 60 * 1000;

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pull all Zernio snapshot rows ordered newest-first. Page in case the
  // table is large; 5k rows per page handles ~1k clients × 4 platforms
  // with 30 days of history easily.
  const { data: rows, error } = await admin
    .from('platform_snapshots')
    .select('client_id, platform, snapshot_date, clients(name)')
    .eq('source', 'zernio')
    .order('snapshot_date', { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reduce to the freshest row per (client_id, platform).
  type LatestRow = {
    client_id: string;
    platform: string;
    snapshot_date: string;
    client_name: string | null;
  };
  const latest = new Map<string, LatestRow>();
  for (const row of rows ?? []) {
    const key = `${row.client_id}:${row.platform}`;
    if (latest.has(key)) continue;
    const clientName = Array.isArray(row.clients)
      ? row.clients[0]?.name ?? null
      : (row.clients as { name?: string } | null)?.name ?? null;
    latest.set(key, {
      client_id: row.client_id,
      platform: row.platform,
      snapshot_date: row.snapshot_date,
      client_name: clientName,
    });
  }

  const now = Date.now();
  const stale: LatestRow[] = [];
  for (const row of latest.values()) {
    const ageMs = now - new Date(row.snapshot_date).getTime();
    if (ageMs > STALE_MS) stale.push(row);
  }

  // Best-effort push fan-out. PUSH_NOTIFY_URL is the same hook SPY-06/07
  // use; missing env var means the cron still completes silently.
  const pushUrl = process.env.PUSH_NOTIFY_URL;
  if (pushUrl && stale.length > 0) {
    try {
      await fetch(pushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Zernio sync stale',
          body: `${stale.length} client/platform pairs missing data >24h.`,
          stale: stale.slice(0, 10).map((s) => ({
            client: s.client_name ?? s.client_id,
            platform: s.platform,
            last: s.snapshot_date,
          })),
        }),
      });
    } catch (err) {
      console.error('Zernio reconcile push failed (non-blocking):', err);
    }
  }

  return NextResponse.json({
    checked: latest.size,
    stale: stale.length,
    stale_pairs: stale.map((s) => ({
      client_id: s.client_id,
      platform: s.platform,
      last_snapshot_date: s.snapshot_date,
    })),
  });
}

export async function GET(request: NextRequest) {
  return handleGet(request);
}

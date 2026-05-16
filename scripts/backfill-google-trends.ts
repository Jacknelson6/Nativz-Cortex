/**
 * Backfill Google Trends data for the N most recent topic searches.
 *
 * Usage:
 *   tsx scripts/backfill-google-trends.ts          # 5 most recent
 *   tsx scripts/backfill-google-trends.ts 20       # 20 most recent
 *   tsx scripts/backfill-google-trends.ts 5 force  # ignore cached rows
 *
 * Calls Google Trends interestOverTime per search, smooths with a 7-day
 * rolling window, writes to topic_searches.trends_data. Sleeps 3s between
 * calls to avoid the unofficial endpoint's rate limit.
 */

import googleTrends from 'google-trends-api';
import { loadEnvLocal } from './load-env-local';
import { createClient } from '@supabase/supabase-js';

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const limit = parseInt(process.argv[2] ?? '5', 10);
const force = process.argv[3] === 'force';
const SMOOTHING_WINDOW = 7;
const SLEEP_MS = 12000;
const MAX_ATTEMPTS = 4;

interface TrendsPoint {
  date: string;
  value: number;
  smoothed: number;
}

function smooth(points: { date: string; value: number }[]): TrendsPoint[] {
  return points.map((p, i) => {
    const start = Math.max(0, i - Math.floor(SMOOTHING_WINDOW / 2));
    const end = Math.min(points.length, i + Math.ceil(SMOOTHING_WINDOW / 2));
    const window = points.slice(start, end);
    const avg = window.reduce((sum, w) => sum + w.value, 0) / window.length;
    return { date: p.date, value: p.value, smoothed: Math.round(avg * 10) / 10 };
  });
}

function parseTrendsResponse(raw: string): { date: string; value: number }[] {
  const parsed = JSON.parse(raw);
  const timelineData = parsed?.default?.timelineData ?? [];
  return timelineData
    .map((point: { time?: string; value?: number[] }) => {
      const ts = point.time ? Number(point.time) * 1000 : null;
      if (!ts || !Array.isArray(point.value) || point.value.length === 0) return null;
      const date = new Date(ts).toISOString().slice(0, 10);
      return { date, value: point.value[0] ?? 0 };
    })
    .filter((p: { date: string; value: number } | null): p is { date: string; value: number } => p !== null);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[backfill] limit=${limit} force=${force}`);

  let query = supabase
    .from('topic_searches')
    .select('id, query, created_at, trends_data')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!force) {
    query = query.is('trends_data', null);
  }

  const { data: searches, error } = await query;
  if (error) {
    console.error('[backfill] fetch searches failed:', error);
    process.exit(1);
  }

  if (!searches || searches.length === 0) {
    console.log('[backfill] no searches to process (use `force` to re-fetch cached rows).');
    return;
  }

  console.log(`[backfill] processing ${searches.length} searches`);

  let ok = 0;
  let empty = 0;
  let failed = 0;

  for (const row of searches) {
    const q = (row.query ?? '').trim();
    if (!q) {
      console.log(`  - ${row.id.slice(0, 8)}  SKIP (no query)`);
      failed++;
      continue;
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 1000 * 60 * 60 * 24 * 90);

    let raw: string | null = null;
    let lastErr: string | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const candidate = await googleTrends.interestOverTime({
          keyword: q,
          startTime,
          endTime,
          geo: '',
        });
        // Sanity-check: rate-limit responses come back as an HTML page.
        if (candidate.trim().startsWith('<')) {
          throw new Error('rate-limited (HTML response)');
        }
        raw = candidate;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        if (attempt < MAX_ATTEMPTS) {
          const backoff = SLEEP_MS * Math.pow(2, attempt - 1);
          console.log(`    retry ${attempt}/${MAX_ATTEMPTS} after ${backoff}ms (${lastErr})`);
          await sleep(backoff);
        }
      }
    }

    if (!raw) {
      console.log(`  - ${row.id.slice(0, 8)}  "${q}"  FAILED after ${MAX_ATTEMPTS} attempts: ${lastErr}`);
      failed++;
      await sleep(SLEEP_MS);
      continue;
    }

    try {
      const rawPoints = parseTrendsResponse(raw);
      const smoothed = smooth(rawPoints);
      const payload = {
        fetched_at: new Date().toISOString(),
        geo: '',
        timeframe: 'now 90-d',
        points: smoothed,
      };
      const { error: updateErr } = await supabase
        .from('topic_searches')
        .update({ trends_data: payload })
        .eq('id', row.id);
      if (updateErr) {
        console.log(`  - ${row.id.slice(0, 8)}  "${q}"  UPDATE FAILED: ${updateErr.message}`);
        failed++;
      } else if (smoothed.length === 0) {
        console.log(`  - ${row.id.slice(0, 8)}  "${q}"  empty (no Trends data for query)`);
        empty++;
      } else {
        const peak = Math.max(...smoothed.map((p) => p.smoothed));
        const avg = smoothed.reduce((s, p) => s + p.smoothed, 0) / smoothed.length;
        console.log(
          `  - ${row.id.slice(0, 8)}  "${q}"  ${smoothed.length} points  peak=${peak}  avg=${avg.toFixed(1)}`,
        );
        ok++;
      }
    } catch (err) {
      console.log(`  - ${row.id.slice(0, 8)}  "${q}"  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    await sleep(SLEEP_MS);
  }

  console.log(`\n[backfill] done. ok=${ok} empty=${empty} failed=${failed}`);
}

void main();

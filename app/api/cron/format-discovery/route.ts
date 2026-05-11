// VFF-03 T11: cron — every 6h, run discoverForBrand for every active,
// non-paused client. Concurrency capped to 5 to bound Apify wall time.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  discoverForBrand,
  type DiscoverForBrandResult,
} from '@/lib/analytics/format-sourcing';
import type { DiscoveryPlatform } from '@/lib/analytics/discovery-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CONCURRENCY = 5;

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const admin = createAdminClient();

  const { data: clients, error } = await admin
    .from('clients')
    .select('id, is_paused, is_active')
    .or('is_paused.is.null,is_paused.eq.false')
    .or('is_active.is.null,is_active.eq.true');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const targets = (clients ?? []).filter(
    (r: { is_paused: boolean | null; is_active: boolean | null }) =>
      r.is_paused !== true && r.is_active !== false,
  ) as Array<{ id: string }>;

  const perBrand = await runWithConcurrency<{ id: string }, DiscoverForBrandResult>(
    targets,
    CONCURRENCY,
    (row) => discoverForBrand(row.id),
  );

  const per_platform = {
    tiktok: { inserted: 0, deduped: 0, failed: 0 },
    instagram: { inserted: 0, deduped: 0, failed: 0 },
    youtube: { inserted: 0, deduped: 0, failed: 0 },
  };
  let total_apify_cost_usd = 0;
  let videos_attempted = 0;
  let videos_inserted = 0;
  let videos_deduped = 0;
  const errors: Array<{ client_id: string; platform: string; message: string }> = [];

  for (const r of perBrand) {
    videos_attempted += r.videos_attempted;
    videos_inserted += r.videos_inserted;
    videos_deduped += r.videos_deduped;
    total_apify_cost_usd += r.total_apify_cost_usd;
    errors.push(...r.errors);
    for (const p of ['tiktok', 'instagram', 'youtube'] as DiscoveryPlatform[]) {
      per_platform[p].inserted += r.per_platform[p].inserted;
      per_platform[p].deduped += r.per_platform[p].deduped;
      per_platform[p].failed += r.per_platform[p].failed;
    }
  }

  return NextResponse.json({
    brands_processed: targets.length,
    videos_attempted,
    videos_inserted,
    videos_deduped,
    total_apify_cost_usd: Number(total_apify_cost_usd.toFixed(4)),
    duration_ms: Date.now() - start,
    per_platform,
    errors,
  });
}

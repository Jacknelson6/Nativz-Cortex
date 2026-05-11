// VFF-04 T08: format-gate cron. Drains analysis_status='pending' rows
// through gateVideo() in batches; updates analysis_status/reject_reason/
// gate_metadata/gated_at on each row.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gateVideo } from '@/lib/analytics/junk-filter';
import { getBrandFormatSeeds } from '@/lib/analytics/brand-format-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_LIMIT = 100;
const CONCURRENCY = 10;

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

  const { data: pending, error } = await admin
    .from('viral_videos')
    .select(
      'id, platform, source_url, creator_handle, thumbnail_storage_url, thumbnail_source_url, title, duration_seconds, views_count, likes_count, comments_count, shares_count, raw_payload, gate_metadata',
    )
    .eq('analysis_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (pending ?? []) as Array<{
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    source_url: string | null;
    creator_handle: string | null;
    thumbnail_storage_url: string | null;
    thumbnail_source_url: string | null;
    title: string | null;
    duration_seconds: number | null;
    views_count: number | null;
    likes_count: number | null;
    comments_count: number | null;
    shares_count: number | null;
    raw_payload: Record<string, unknown> | null;
    gate_metadata: Record<string, unknown> | null;
  }>;

  // Cheap seed lookup: take seeds from any brand that's active. Gate uses an
  // OR-match across the union of seeds (D-01: one combined call).
  const { data: ctxRows } = await admin
    .from('brand_format_context')
    .select('client_id, seed_terms')
    .limit(50);
  const seedUnion = new Set<string>();
  for (const r of (ctxRows ?? []) as Array<{ seed_terms: string[] | null }>) {
    for (const s of r.seed_terms ?? []) seedUnion.add(s);
  }
  // Limit to 60 seeds total so the prompt stays cheap.
  const seedTerms = Array.from(seedUnion).slice(0, 60);

  let passed = 0;
  let rejected = 0;
  let failed = 0;
  const byReason: Record<string, number> = {};

  await runWithConcurrency(rows, CONCURRENCY, async (row) => {
    try {
      const caption = (row.raw_payload?.text ?? row.title ?? '') as string;
      const verdict = await gateVideo(
        {
          id: row.id,
          platform: row.platform,
          source_url: row.source_url,
          caption,
          thumbnail_storage_url: row.thumbnail_storage_url,
          thumbnail_source_url: row.thumbnail_source_url,
          duration_seconds: row.duration_seconds,
          views_count: row.views_count,
          likes_count: row.likes_count,
          comments_count: row.comments_count,
          shares_count: row.shares_count,
          raw_payload: row.raw_payload ?? null,
        },
        seedTerms,
        row.gate_metadata ?? {},
      );

      if (verdict.pass) {
        await admin
          .from('viral_videos')
          .update({
            analysis_status: 'analyzing',
            gate_metadata: verdict.metadata,
            gated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        passed += 1;
        return;
      }

      // Soft-fail (LLM retry path) — leave pending, only persist metadata.
      if (!verdict.reason) {
        await admin
          .from('viral_videos')
          .update({ gate_metadata: verdict.metadata })
          .eq('id', row.id);
        return;
      }

      await admin
        .from('viral_videos')
        .update({
          analysis_status: verdict.reason === 'gate_error' ? 'failed' : 'rejected',
          reject_reason: verdict.reason,
          gate_metadata: verdict.metadata,
          gated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      rejected += 1;
      byReason[verdict.reason] = (byReason[verdict.reason] ?? 0) + 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : 'gate failure';
      await admin
        .from('viral_videos')
        .update({
          analysis_status: 'failed',
          reject_reason: 'gate_error',
          gate_metadata: { error: msg },
          gated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
  });

  return NextResponse.json({
    processed: rows.length,
    passed,
    rejected,
    failed,
    by_reason: byReason,
    duration_ms: Date.now() - start,
  });
}

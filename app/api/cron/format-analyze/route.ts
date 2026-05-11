// VFF-05 T09 + T11: format-analyze cron.
// Drains analysis_status='analyzing' rows through analyzeViralVideo(); also
// backfills embeddings for 'analyzed' rows where embedding IS NULL (no
// Gemini-flash call, just the embedding endpoint).

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeViralVideo, embedAnalysisText } from '@/lib/analytics/analyze-viral-video';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ANALYZE_BATCH = 20;
const EMBED_BATCH = 20;
const CONCURRENCY = 3;

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
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

  const t0 = Date.now();
  const admin = createAdminClient();

  // Claim up to ANALYZE_BATCH rows in 'analyzing' state. We don't transition
  // here (the rows are already 'analyzing' because VFF-04 promotes pass-gate
  // rows to that state). The analyzer itself flips to 'analyzed' or 'failed'.
  const { data: pending } = await admin
    .from('viral_videos')
    .select('id')
    .eq('analysis_status', 'analyzing')
    .order('created_at', { ascending: true })
    .limit(ANALYZE_BATCH);

  const ids = (pending ?? []).map((r) => (r as { id: string }).id);
  const errors: Array<{ video_id: string; message: string }> = [];
  let succeeded = 0;
  let failed = 0;
  let proposalsEmitted = 0;

  const results = await runWithConcurrency(ids, CONCURRENCY, async (videoId) => {
    try {
      const out = await analyzeViralVideo(videoId);
      return { videoId, out };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ video_id: videoId, message: msg.slice(0, 280) });
      return null;
    }
  });

  for (const r of results) {
    if (!r) {
      failed++;
      continue;
    }
    if (r.out.status === 'analyzed') succeeded++;
    else failed++;
    proposalsEmitted += r.out.proposals.length;
  }

  // T11: backfill embeddings on analyzed rows where embedding IS NULL.
  // viral_videos.embedding stays empty when the embed endpoint failed mid-
  // analysis; this catches them on a later pass.
  const { data: needEmbed } = await admin
    .from('viral_videos')
    .select('id, why_it_works, engagement_hook_descriptor, retention_pattern')
    .eq('analysis_status', 'analyzed')
    .is('embedding', null)
    .limit(EMBED_BATCH);

  let embedded = 0;
  for (const row of (needEmbed ?? []) as Array<{
    id: string;
    why_it_works: string | null;
    engagement_hook_descriptor: string | null;
    retention_pattern: string | null;
  }>) {
    const text = [row.why_it_works, row.engagement_hook_descriptor, row.retention_pattern]
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000);
    if (!text) continue;
    try {
      const vec = await embedAnalysisText(text);
      if (vec) {
        await admin.from('viral_videos').update({ embedding: vec }).eq('id', row.id);
        embedded++;
      }
    } catch {
      // swallow; will retry next tick.
    }
  }

  return NextResponse.json({
    processed: ids.length,
    succeeded,
    failed,
    proposals_emitted: proposalsEmitted,
    embeddings_backfilled: embedded,
    duration_ms: Date.now() - t0,
    errors,
  });
}

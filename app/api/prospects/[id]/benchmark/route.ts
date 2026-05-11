// SPY-05 T13: POST runs a benchmark, GET returns latest (or by id).
//
// Rate limit: 1 run per prospect per 24h, bypassable with force=true.
// The orchestrator does the heavy work; this route's main responsibility
// is auth + validation + the rate-limit gate.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  runCompetitorBenchmark,
  getBenchmarkById,
  getLatestBenchmark,
} from '@/lib/prospects/benchmark-orchestrator';
import type { PickedCompetitor } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PostSchema = z.object({
  competitors: z
    .array(
      z.object({
        platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook']),
        handle: z.string().min(1).max(120),
        profile_url: z.string().url().nullable().optional(),
        display_name: z.string().max(200).nullable().optional(),
        source: z.enum(['discovered', 'manual']).default('manual'),
        rationale: z.string().max(280).nullable().optional(),
      }),
    )
    .min(1)
    .max(3),
  force: z.boolean().default(false),
});

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!data || !['admin', 'super_admin'].includes(data.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: prospect } = await admin
      .from('prospects')
      .select('id, primary_handle')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

    // Reject self-as-competitor.
    const selfHandle = (prospect.primary_handle ?? '').toLowerCase().replace(/^@+/, '');
    if (selfHandle) {
      for (const c of parsed.data.competitors) {
        if (c.handle.toLowerCase().replace(/^@+/, '') === selfHandle) {
          return NextResponse.json(
            { error: `Cannot benchmark a prospect against themselves (@${selfHandle}).` },
            { status: 400 },
          );
        }
      }
    }

    // 24h rate limit (bypass with force=true).
    if (!parsed.data.force) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { data: recent } = await admin
        .from('prospect_competitor_benchmarks')
        .select('id, created_at')
        .eq('prospect_id', id)
        .gte('created_at', since)
        .in('status', ['succeeded', 'partial', 'scraping', 'grading', 'discovering'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent) {
        const retrySec = Math.max(
          0,
          Math.ceil((new Date(recent.created_at).getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000),
        );
        return NextResponse.json(
          {
            error: 'Rate limited',
            retry_after_seconds: retrySec,
            existing_benchmark_id: recent.id,
          },
          { status: 429 },
        );
      }
    }

    const picks: PickedCompetitor[] = parsed.data.competitors.map((c) => ({
      platform: c.platform,
      handle: c.handle,
      profile_url: c.profile_url ?? null,
      display_name: c.display_name ?? null,
      source: c.source,
      rationale: c.rationale ?? null,
    }));

    const result = await runCompetitorBenchmark({
      prospectId: id,
      picks,
      createdBy: auth.userId,
    });

    if (!result.ok || !result.benchmarkId) {
      return NextResponse.json(
        { error: result.message ?? 'Benchmark failed' },
        { status: 500 },
      );
    }

    const benchmark = await getBenchmarkById(result.benchmarkId);
    return NextResponse.json({ benchmark });
  } catch (err) {
    console.error('POST /api/prospects/[id]/benchmark error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const benchmarkId = request.nextUrl.searchParams.get('id');

    const benchmark = benchmarkId
      ? await getBenchmarkById(benchmarkId)
      : await getLatestBenchmark(id);

    if (benchmarkId && benchmark && benchmark.prospect_id !== id) {
      return NextResponse.json({ error: 'Benchmark not for this prospect' }, { status: 404 });
    }

    return NextResponse.json({ benchmark: benchmark ?? null });
  } catch (err) {
    console.error('GET /api/prospects/[id]/benchmark error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

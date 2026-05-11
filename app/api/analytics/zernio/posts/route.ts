// ZNA-04: admin post-grid endpoint. Returns a cursor-paginated page of
// post_metrics rows for the requested brand, with engagement_rate computed
// at read time and thumbnails resolved to the storage URL when available.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadPostsForGrid,
  type PostGridPlatform,
  type PostGridSort,
  type PostGridOrder,
} from '@/lib/analytics/posts-query';
import {
  resolvePostSignals,
  type SignalFilter,
} from '@/lib/analytics/resolve-post-signals';
import {
  resolvePostTrajectories,
  type StatusFilter,
} from '@/lib/analytics/resolve-post-trajectories';

export const dynamic = 'force-dynamic';

const PlatformEnum = z.enum(['tiktok', 'instagram', 'facebook', 'youtube']);

const QuerySchema = z.object({
  client_id: z.string().uuid(),
  platforms: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(PlatformEnum).min(1).optional()),
  sort: z.enum(['published_at', 'views_count', 'engagement_rate']).default('published_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
  since_days: z.coerce.number().int().min(1).max(180).default(90),
  signal: z.enum(['above_avg', 'avg', 'below_avg', 'too_fresh', 'any']).default('any'),
  status: z.enum(['still_climbing', 'peaked', 'declining', 'dead', 'too_fresh', 'any']).default('any'),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    client_id: url.searchParams.get('client_id'),
    platforms: url.searchParams.get('platforms') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    order: url.searchParams.get('order') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
    since_days: url.searchParams.get('since_days') ?? undefined,
    signal: url.searchParams.get('signal') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', issues: parsed.error.format() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('id', parsed.data.client_id)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const result = await loadPostsForGrid({
    supabase: admin,
    clientId: parsed.data.client_id,
    platforms: parsed.data.platforms as PostGridPlatform[] | undefined,
    sort: parsed.data.sort as PostGridSort,
    order: parsed.data.order as PostGridOrder,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
    sinceDays: parsed.data.since_days,
  });

  const withSignals = await resolvePostSignals({
    supabase: admin,
    organizationId: (client as { organization_id: string }).organization_id,
    posts: result.posts,
    signalFilter: parsed.data.signal as SignalFilter,
  });
  const enriched = await resolvePostTrajectories({
    supabase: admin,
    posts: withSignals,
    audience: 'admin',
    statusFilter: parsed.data.status as StatusFilter,
  });

  return NextResponse.json(
    {
      client_id: parsed.data.client_id,
      range_since_days: parsed.data.since_days,
      sort: parsed.data.sort,
      order: parsed.data.order,
      signal: parsed.data.signal,
      status: parsed.data.status,
      posts: enriched,
      next_cursor: result.nextCursor,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=60' },
    },
  );
}

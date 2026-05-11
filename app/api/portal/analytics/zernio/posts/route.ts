// ZNA-04: portal post-grid endpoint. Same shape as the admin route but
// scoped via getPortalClient() and defended in depth with an organization_id
// check (CLAUDE.md portal security hard rule). client_id query param is
// ignored on purpose: portal users always operate on their resolved client.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPortalClient } from '@/lib/portal/get-portal-client';
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

export const dynamic = 'force-dynamic';

const PlatformEnum = z.enum(['tiktok', 'instagram', 'facebook', 'youtube']);

const QuerySchema = z.object({
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
});

export async function GET(req: Request) {
  const portal = await getPortalClient();
  if (!portal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    platforms: url.searchParams.get('platforms') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    order: url.searchParams.get('order') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
    since_days: url.searchParams.get('since_days') ?? undefined,
    signal: url.searchParams.get('signal') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', issues: parsed.error.format() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Defense in depth: confirm the resolved client still belongs to the
  // portal session's org before reading any post data.
  const { data: clientRow } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('id', portal.client.id)
    .maybeSingle();
  if (!clientRow || clientRow.organization_id !== portal.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await loadPostsForGrid({
    supabase: admin,
    clientId: portal.client.id,
    platforms: parsed.data.platforms as PostGridPlatform[] | undefined,
    sort: parsed.data.sort as PostGridSort,
    order: parsed.data.order as PostGridOrder,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
    sinceDays: parsed.data.since_days,
  });

  const enriched = await resolvePostSignals({
    supabase: admin,
    organizationId: portal.organizationId,
    posts: result.posts,
    signalFilter: parsed.data.signal as SignalFilter,
  });

  return NextResponse.json(
    {
      client_id: portal.client.id,
      range_since_days: parsed.data.since_days,
      sort: parsed.data.sort,
      order: parsed.data.order,
      signal: parsed.data.signal,
      posts: enriched,
      next_cursor: result.nextCursor,
    },
    {
      headers: { 'Cache-Control': 'private, max-age=60' },
    },
  );
}

// SPY-08 T08: GET /api/clients/[id]/analytics/source — exposes the
// range-aware resolver so client-side analytics pages can surface the
// data-source pill without re-implementing the decision tree.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/require-admin';
import { resolveAnalyticsSource } from '@/lib/analytics/range/source-router';
import type { RangePlatform } from '@/lib/analytics/range/types';

export const maxDuration = 30;

const QuerySchema = z.object({
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'x']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function handleGet(request: NextRequest, clientId: string) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    platform: url.searchParams.get('platform') ?? '',
    from: url.searchParams.get('from') ?? '',
    to: url.searchParams.get('to') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await resolveAnalyticsSource({
    clientId,
    platform: parsed.data.platform as RangePlatform,
    range: { from: parsed.data.from, to: parsed.data.to },
  });
  return NextResponse.json(result);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleGet(request, id);
}

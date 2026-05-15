import { NextRequest, NextResponse } from 'next/server';
import googleTrends from 'google-trends-api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

export const maxDuration = 30;

interface TrendsPoint {
  date: string;
  value: number;
  smoothed: number;
}

interface CachedTrends {
  fetched_at: string;
  geo: string;
  timeframe: string;
  points: TrendsPoint[];
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const SMOOTHING_WINDOW = 7;

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
    .map((point: { time?: string; formattedAxisTime?: string; value?: number[] }) => {
      const ts = point.time ? Number(point.time) * 1000 : null;
      if (!ts || !Array.isArray(point.value) || point.value.length === 0) return null;
      const date = new Date(ts).toISOString().slice(0, 10);
      return { date, value: point.value[0] ?? 0 };
    })
    .filter((p: { date: string; value: number } | null): p is { date: string; value: number } => p !== null);
}

/**
 * GET /api/search/[id]/google-trends
 * Returns Google Trends interest-over-time for the search's query.
 * Cached on the topic_searches row for 12h.
 * Query params: token=<share_token> for unauthenticated shared views
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const shareToken = searchParams.get('token');
  const refresh = searchParams.get('refresh') === '1';
  const adminClient = createAdminClient();

  if (shareToken) {
    const { data: link } = await adminClient
      .from('search_share_links')
      .select('search_id, expires_at')
      .eq('token', shareToken)
      .single();

    if (!link || link.search_id !== id) {
      return NextResponse.json({ error: 'Invalid share link' }, { status: 403 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Share link expired' }, { status: 403 });
    }
  } else {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
  }

  const { data: searchRow, error: searchErr } = await adminClient
    .from('topic_searches')
    .select('id, query, trends_data')
    .eq('id', id)
    .single();

  if (searchErr || !searchRow) {
    return NextResponse.json({ error: 'Search not found' }, { status: 404 });
  }

  const cached = searchRow.trends_data as CachedTrends | null;
  if (!refresh && cached?.fetched_at) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < CACHE_TTL_MS && Array.isArray(cached.points) && cached.points.length > 0) {
      return NextResponse.json({ trends: cached, cached: true });
    }
  }

  const query = (searchRow.query ?? '').trim();
  if (!query) {
    return NextResponse.json({ error: 'Search has no query to look up' }, { status: 400 });
  }

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 1000 * 60 * 60 * 24 * 90);
  const geo = '';
  const timeframe = 'now 90-d';

  let rawResponse: string;
  try {
    rawResponse = await googleTrends.interestOverTime({
      keyword: query,
      startTime,
      endTime,
      geo,
    });
  } catch (err) {
    console.error('[google-trends] fetch failed', { id, query, err });
    if (cached?.points && cached.points.length > 0) {
      return NextResponse.json({ trends: cached, cached: true, stale: true });
    }
    return NextResponse.json(
      { error: 'Failed to fetch Google Trends data', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  let rawPoints: { date: string; value: number }[];
  try {
    rawPoints = parseTrendsResponse(rawResponse);
  } catch (err) {
    console.error('[google-trends] parse failed', { id, query, err });
    return NextResponse.json({ error: 'Invalid Trends response' }, { status: 502 });
  }

  if (rawPoints.length === 0) {
    const empty: CachedTrends = {
      fetched_at: new Date().toISOString(),
      geo,
      timeframe,
      points: [],
    };
    await adminClient.from('topic_searches').update({ trends_data: empty }).eq('id', id);
    return NextResponse.json({ trends: empty, cached: false });
  }

  const smoothed = smooth(rawPoints);
  const result: CachedTrends = {
    fetched_at: new Date().toISOString(),
    geo,
    timeframe,
    points: smoothed,
  };

  await adminClient.from('topic_searches').update({ trends_data: result }).eq('id', id);

  return NextResponse.json({ trends: result, cached: false });
}

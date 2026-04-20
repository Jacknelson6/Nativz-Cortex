import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/reporting/cadence
 *
 * Posting activity heatmap — array of { day: YYYY-MM-DD, count } rows
 * computed from post_metrics.published_at. The UI renders a day-by-week
 * grid (GitHub-style) so you can see when posts actually went out.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    clientId: searchParams.get('clientId'),
    start: searchParams.get('start'),
    end: searchParams.get('end'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
  }

  const { clientId, start, end } = parsed.data;

  const { data, error } = await supabase
    .from('post_metrics')
    .select('platform, published_at')
    .eq('client_id', clientId)
    .gte('published_at', `${start}T00:00:00`)
    .lte('published_at', `${end}T23:59:59`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, { total: number; byPlatform: Record<string, number> }>();
  for (const row of data ?? []) {
    if (!row.published_at) continue;
    const day = String(row.published_at).split('T')[0];
    const entry = counts.get(day) ?? { total: 0, byPlatform: {} };
    entry.total += 1;
    entry.byPlatform[row.platform] = (entry.byPlatform[row.platform] ?? 0) + 1;
    counts.set(day, entry);
  }

  const cadence = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, count: v.total, byPlatform: v.byPlatform }));

  return NextResponse.json({ cadence });
}

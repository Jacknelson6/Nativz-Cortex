import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUsageSummary } from '@/lib/ai/usage';

/**
 * GET /api/usage
 *
 * Fetch AI token usage and cost summary for a given date range.
 * Defaults to the last 30 days if no range is specified.
 *
 * @auth Required (any authenticated user)
 * @query from - Start of date range (ISO datetime, default: 30 days ago)
 * @query to - End of date range (ISO datetime, default: now)
 * @returns {UsageSummary} Aggregated usage data (tokens, cost, by feature, etc.)
 */
export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = searchParams.get('to') ?? new Date().toISOString();

  const summary = await getUsageSummary(from, to);
  return NextResponse.json(summary);
}

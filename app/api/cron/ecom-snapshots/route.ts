import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeEcomCompetitor } from '@/lib/ecom/apify-ecom-scrape';

export const maxDuration = 300;

const STALE_DAYS = 7;
const PER_RUN_LIMIT = 15; // Apify ecom is slower than TikTok scrapes

/**
 * GET /api/cron/ecom-snapshots — daily refresher for `ecom_competitors`
 * (NAT-21). Runs the Apify e-commerce actor for any competitor whose latest
 * `ecom_snapshots` row is missing or older than 7 days. Rate-limited to 15
 * per run so a slow Apify queue can't consume the full 300s budget.
 *
 * @auth Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: competitors, error: compErr } = await admin
    .from('ecom_competitors')
    .select('id, client_id, domain, platform');
  if (compErr) {
    console.error('[cron:ecom-snapshots] load competitors failed', compErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!competitors || competitors.length === 0) {
    return NextResponse.json({ refreshed: 0, reason: 'no competitors' });
  }

  // Rank by latest snapshot age — stale-first
  const { data: snapshots } = await admin
    .from('ecom_snapshots')
    .select('ecom_competitor_id, scraped_at')
    .in('ecom_competitor_id', competitors.map((c) => c.id))
    .order('scraped_at', { ascending: false });

  const latestById = new Map<string, string>();
  for (const s of snapshots ?? []) {
    if (!latestById.has(s.ecom_competitor_id)) {
      latestById.set(s.ecom_competitor_id, s.scraped_at);
    }
  }

  const needsRefresh = competitors
    .map((c) => ({ c, latest: latestById.get(c.id) ?? null }))
    .filter(({ latest }) => latest === null || latest < staleCutoff)
    .slice(0, PER_RUN_LIMIT);

  const results: Array<{ id: string; domain: string; ok: boolean; error?: string }> = [];
  for (const { c } of needsRefresh) {
    try {
      const snapshot = await scrapeEcomCompetitor({ domain: c.domain });
      if (!snapshot) {
        results.push({ id: c.id, domain: c.domain, ok: false, error: 'Scrape returned null' });
        continue;
      }
      const { error } = await admin.from('ecom_snapshots').insert({
        ecom_competitor_id: c.id,
        scraped_at: snapshot.scrapedAt,
        product_count: snapshot.productCount,
        top_products: snapshot.topProducts,
        signals: snapshot.signals,
        source: snapshot.source,
      });
      if (error) {
        results.push({ id: c.id, domain: c.domain, ok: false, error: error.message });
      } else {
        results.push({ id: c.id, domain: c.domain, ok: true });
      }
    } catch (err) {
      results.push({
        id: c.id,
        domain: c.domain,
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    success: true,
    queued: needsRefresh.length,
    refreshed: results.filter((r) => r.ok).length,
    results,
  });
}

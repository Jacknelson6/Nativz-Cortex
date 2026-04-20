import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeMetaAdLibrary } from '@/lib/meta-ads/apify-meta-ads-scrape';

export const maxDuration = 300;

const STALE_HOURS = 24;
const PER_RUN_LIMIT = 10;

/**
 * GET /api/cron/meta-ad-snapshots — daily refresher for `meta_ad_tracked_pages`
 * (NAT-22). Re-runs the Apify Facebook Ad Library scraper for any tracked page
 * whose most recent creative scrape is older than 24h. Capped at 10 pages per
 * run to stay inside the 300s budget.
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
  const staleCutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: pages, error: pagesErr } = await admin
    .from('meta_ad_tracked_pages')
    .select('id, client_id, library_url');
  if (pagesErr) {
    console.error('[cron:meta-ad-snapshots] load pages failed', pagesErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!pages || pages.length === 0) {
    return NextResponse.json({ refreshed: 0, reason: 'no tracked pages' });
  }

  const { data: latestRows } = await admin
    .from('meta_ad_creatives')
    .select('tracked_page_id, scraped_at')
    .in(
      'tracked_page_id',
      pages.map((p) => p.id),
    )
    .order('scraped_at', { ascending: false });

  const latestById = new Map<string, string>();
  for (const r of latestRows ?? []) {
    if (!latestById.has(r.tracked_page_id)) {
      latestById.set(r.tracked_page_id, r.scraped_at);
    }
  }

  const needsRefresh = pages
    .map((p) => ({ p, latest: latestById.get(p.id) ?? null }))
    .filter(({ latest }) => latest === null || latest < staleCutoff)
    .slice(0, PER_RUN_LIMIT);

  const now = new Date().toISOString();
  const results: Array<{ id: string; inserted: number; updated: number; ok: boolean; error?: string }> = [];

  for (const { p } of needsRefresh) {
    try {
      const creatives = await scrapeMetaAdLibrary({ libraryUrl: p.library_url });
      if (!creatives) {
        results.push({ id: p.id, inserted: 0, updated: 0, ok: false, error: 'Scrape returned null' });
        continue;
      }
      let inserted = 0;
      let updated = 0;
      for (const c of creatives) {
        if (!c.adArchiveId) continue;
        const { data: existing } = await admin
          .from('meta_ad_creatives')
          .select('id, first_seen_at')
          .eq('tracked_page_id', p.id)
          .eq('ad_archive_id', c.adArchiveId)
          .maybeSingle();
        const patch = {
          tracked_page_id: p.id,
          ad_archive_id: c.adArchiveId,
          scraped_at: now,
          first_seen_at: existing?.first_seen_at ?? now,
          last_seen_at: now,
          is_active: c.isActive,
          started_on: c.startedOn,
          ended_on: c.endedOn,
          image_urls: c.imageUrls,
          video_urls: c.videoUrls,
          thumbnail_url: c.thumbnailUrl,
          body_text: c.bodyText,
          headline: c.headline,
          cta_text: c.ctaText,
          landing_url: c.landingUrl,
          platforms: c.platforms,
          raw: c.raw,
        };
        if (existing) {
          const { error } = await admin.from('meta_ad_creatives').update(patch).eq('id', existing.id);
          if (!error) updated++;
        } else {
          const { error } = await admin.from('meta_ad_creatives').insert(patch);
          if (!error) inserted++;
        }
      }
      results.push({ id: p.id, inserted, updated, ok: true });
    } catch (err) {
      results.push({
        id: p.id,
        inserted: 0,
        updated: 0,
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

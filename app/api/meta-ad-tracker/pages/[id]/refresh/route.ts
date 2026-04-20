import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeMetaAdLibrary } from '@/lib/meta-ads/apify-meta-ads-scrape';

export const maxDuration = 300;

/**
 * POST /api/meta-ad-tracker/pages/[id]/refresh — scrape the tracked page's
 * library URL via Apify now and upsert each creative on (tracked_page_id,
 * ad_archive_id) so we keep one row per ad and move `last_seen_at` forward
 * on repeat scrapes.
 *
 * @auth Required (admin)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userRow || (userRow.role !== 'admin' && userRow.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: page, error: fetchErr } = await admin
      .from('meta_ad_tracked_pages')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr || !page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const creatives = await scrapeMetaAdLibrary({ libraryUrl: page.library_url });
    if (!creatives) {
      return NextResponse.json(
        { error: 'Scrape failed — Apify run did not complete. Check APIFY_API_KEY and actor status.' },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;

    for (const c of creatives) {
      if (!c.adArchiveId) continue;

      // Upsert on (tracked_page_id, ad_archive_id) — move last_seen_at forward
      // on repeat scrapes, keep first_seen_at from the initial discovery.
      const { data: existing } = await admin
        .from('meta_ad_creatives')
        .select('id, first_seen_at')
        .eq('tracked_page_id', id)
        .eq('ad_archive_id', c.adArchiveId)
        .maybeSingle();

      const patch = {
        tracked_page_id: id,
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
        const { error } = await admin
          .from('meta_ad_creatives')
          .update(patch)
          .eq('id', existing.id);
        if (!error) updated++;
      } else {
        const { error } = await admin.from('meta_ad_creatives').insert(patch);
        if (!error) inserted++;
      }
    }

    return NextResponse.json({
      success: true,
      scraped: creatives.length,
      inserted,
      updated,
    });
  } catch (error) {
    console.error('POST /api/meta-ad-tracker/pages/[id]/refresh error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

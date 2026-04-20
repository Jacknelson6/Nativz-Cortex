import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeEcomCompetitor } from '@/lib/ecom/apify-ecom-scrape';

export const maxDuration = 300;

/**
 * POST /api/ecom-competitors/[id]/refresh — run the Apify e-commerce actor
 * for a single competitor now and persist a new snapshot.
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userRow || (userRow.role !== 'admin' && userRow.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: competitor, error: fetchErr } = await admin
      .from('ecom_competitors')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr || !competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    const snapshot = await scrapeEcomCompetitor({ domain: competitor.domain });
    if (!snapshot) {
      return NextResponse.json(
        { error: 'Scrape failed — Apify run did not complete. Check APIFY_API_KEY and actor status.' },
        { status: 502 },
      );
    }

    const { data: inserted, error: insertErr } = await admin
      .from('ecom_snapshots')
      .insert({
        ecom_competitor_id: id,
        scraped_at: snapshot.scrapedAt,
        product_count: snapshot.productCount,
        top_products: snapshot.topProducts,
        signals: snapshot.signals,
        source: snapshot.source,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('ecom_snapshots insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to persist snapshot' }, { status: 500 });
    }

    return NextResponse.json({ snapshot: inserted });
  } catch (error) {
    console.error('POST /api/ecom-competitors/[id]/refresh error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

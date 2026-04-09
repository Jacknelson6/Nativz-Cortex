import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { scrapeWebsite } from '@/lib/audit/scrape-website';
import {
  buildProspectData,
  discoverCompetitors,
  buildCompetitorProfile,
  generateScorecard,
  extractWebsiteContext,
} from '@/lib/audit/analyze';
import type { CompetitorProfile, WebsiteContext } from '@/lib/audit/types';

export const maxDuration = 300;

/**
 * POST /api/audit/[id]/process — Run the full audit pipeline
 *
 * Steps:
 * 1. Scrape prospect's TikTok profile
 * 2. Scrape prospect's website (if provided)
 * 3. AI discovers competitors
 * 4. Scrape competitor profiles
 * 5. AI generates scorecard
 * 6. Store results
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Fetch audit record
    const { data: audit, error: fetchError } = await adminClient
      .from('prospect_audits')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.status === 'processing') {
      return NextResponse.json({ error: 'Audit is already processing' }, { status: 409 });
    }

    // Mark as processing
    await adminClient
      .from('prospect_audits')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', id);

    try {
      // Step 1: Scrape prospect's TikTok profile
      console.log(`[audit:${id}] Step 1: Scraping TikTok profile...`);
      const profileResult = await scrapeTikTokProfile(audit.tiktok_url);

      // Step 2: Scrape website (if provided)
      let websiteResult = null;
      let websiteContext: WebsiteContext | null = null;
      if (audit.website_url) {
        console.log(`[audit:${id}] Step 2: Scraping website...`);
        try {
          websiteResult = await scrapeWebsite(audit.website_url);
          websiteContext = await extractWebsiteContext(websiteResult);
        } catch (err) {
          console.error(`[audit:${id}] Website scrape failed (non-blocking):`, err);
        }
      }

      // Build prospect data
      const prospectData = buildProspectData(profileResult, websiteResult, websiteContext);

      // Step 3: AI discovers competitors
      console.log(`[audit:${id}] Step 3: Discovering competitors...`);
      const competitorUsernames = await discoverCompetitors(prospectData, websiteResult);
      console.log(`[audit:${id}] Found ${competitorUsernames.length} competitors: ${competitorUsernames.join(', ')}`);

      // Step 4: Scrape competitor profiles
      console.log(`[audit:${id}] Step 4: Scraping competitor profiles...`);
      const competitors: CompetitorProfile[] = [];
      for (const username of competitorUsernames) {
        try {
          const competitorResult = await scrapeTikTokProfile(`https://www.tiktok.com/@${username}`);
          competitors.push(buildCompetitorProfile(competitorResult));
        } catch (err) {
          console.error(`[audit:${id}] Failed to scrape competitor @${username}:`, err);
        }
      }

      // Step 5: Generate scorecard
      console.log(`[audit:${id}] Step 5: Generating scorecard...`);
      const scorecard = await generateScorecard(prospectData, competitors, websiteContext);

      // Step 6: Store results
      await adminClient
        .from('prospect_audits')
        .update({
          status: 'completed',
          prospect_data: prospectData,
          competitors_data: competitors,
          scorecard,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      console.log(`[audit:${id}] Audit completed successfully`);
      return NextResponse.json({ status: 'completed' });
    } catch (processError) {
      const msg = processError instanceof Error ? processError.message : 'Unknown error';
      console.error(`[audit:${id}] Processing failed:`, msg);

      await adminClient
        .from('prospect_audits')
        .update({
          status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (error) {
    console.error('POST /api/audit/[id]/process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

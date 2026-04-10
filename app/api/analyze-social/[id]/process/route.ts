import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeWebsite } from '@/lib/audit/scrape-website';
import { scrapeTikTokProfile } from '@/lib/audit/scrape-tiktok-profile';
import { scrapeInstagramProfile } from '@/lib/audit/scrape-instagram-profile';
import { scrapeFacebookProfile } from '@/lib/audit/scrape-facebook-profile';
import { scrapeYouTubeProfile } from '@/lib/audit/scrape-youtube-profile';
import {
  extractWebsiteContext,
  buildPlatformReport,
  discoverCompetitors,
  buildCompetitorProfile,
  generateScorecard,
} from '@/lib/audit/analyze';
import type { PlatformReport, CompetitorProfile, WebsiteContext, SocialLink, AuditPlatform, FailedPlatform } from '@/lib/audit/types';
import { persistAllScrapedImages } from '@/lib/audit/persist-scraped-images';

export const maxDuration = 300;

/**
 * POST /api/analyze-social/[id]/process — Run the full audit pipeline
 *
 * Flow:
 * 1. Scrape the prospect's website → extract business context + social links
 * 2. Scrape each social platform in parallel (TikTok, Instagram, etc.)
 * 3. AI discovers competitors based on gathered data
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

    await adminClient
      .from('prospect_audits')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', id);

    try {
      // Step 1: Scrape website and extract context + social links
      console.log(`[audit:${id}] Step 1: Scraping website...`);
      let websiteContext: WebsiteContext | null = null;
      let detectedLinks: SocialLink[] = [];

      if (audit.website_url) {
        try {
          const websiteResult = await scrapeWebsite(audit.website_url);
          websiteContext = await extractWebsiteContext(websiteResult);
          detectedLinks = websiteContext.socialLinks;
          console.log(`[audit:${id}] Found ${detectedLinks.length} social links: ${detectedLinks.map(l => `${l.platform}:@${l.username}`).join(', ')}`);
        } catch (err) {
          console.error(`[audit:${id}] Website scrape failed (non-blocking):`, err);
        }
      }

      // Merge manually-provided social URLs with detected ones
      const manualPlatforms = (audit.social_urls as Record<string, string> | null) ?? {};
      const platformsToScrape: { platform: AuditPlatform; url: string }[] = [];

      // Add detected social links for all supported platforms
      for (const link of detectedLinks) {
        if (['tiktok', 'instagram', 'facebook', 'youtube'].includes(link.platform)) {
          platformsToScrape.push({ platform: link.platform, url: link.url });
        }
      }

      // Add manual overrides (take priority)
      for (const [platform, url] of Object.entries(manualPlatforms)) {
        if (!url) continue;
        const existing = platformsToScrape.findIndex(p => p.platform === platform);
        if (existing >= 0) platformsToScrape[existing].url = url;
        else platformsToScrape.push({ platform: platform as AuditPlatform, url });
      }

      // Also check if tiktok_url was provided directly (legacy field)
      if (audit.tiktok_url && !platformsToScrape.some(p => p.platform === 'tiktok')) {
        platformsToScrape.push({ platform: 'tiktok', url: audit.tiktok_url });
      }

      // If no social profiles found anywhere, pause and ask user for input
      if (platformsToScrape.length === 0) {
        console.log(`[audit:${id}] No social profiles found — requesting manual input`);
        await adminClient
          .from('prospect_audits')
          .update({
            status: 'needs_social_input',
            prospect_data: {
              websiteContext,
              platforms: [],
              detectedSocialLinks: detectedLinks,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        return NextResponse.json({ status: 'needs_social_input' });
      }

      // Step 2: Scrape each platform in parallel. Capture per-platform errors
      // so the report surfaces exactly which platforms failed and why —
      // before this, failures went to console.error and the UI silently
      // rendered a scorecard missing entire platforms.
      console.log(`[audit:${id}] Step 2: Scraping ${platformsToScrape.length} platform(s) in parallel...`);
      const platformReports: PlatformReport[] = [];
      const failedPlatforms: FailedPlatform[] = [];

      const scrapeResults = await Promise.allSettled(
        platformsToScrape.map(async ({ platform, url }) => {
          switch (platform) {
            case 'tiktok': {
              const result = await scrapeTikTokProfile(url);
              return buildPlatformReport(result.profile, result.videos);
            }
            case 'instagram': {
              const result = await scrapeInstagramProfile(url);
              return buildPlatformReport(result.profile, result.videos);
            }
            case 'facebook': {
              const result = await scrapeFacebookProfile(url);
              return buildPlatformReport(result.profile, result.videos);
            }
            case 'youtube': {
              const result = await scrapeYouTubeProfile(url);
              return buildPlatformReport(result.profile, result.videos);
            }
            default:
              console.log(`[audit:${id}] Skipping ${platform} (no scraper)`);
              return null;
          }
        })
      );

      for (let i = 0; i < scrapeResults.length; i++) {
        const result = scrapeResults[i];
        const { platform, url } = platformsToScrape[i];
        if (result.status === 'fulfilled' && result.value) {
          platformReports.push(result.value);
        } else if (result.status === 'rejected') {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[audit:${id}] ${platform} scrape failed:`, msg);
          failedPlatforms.push({ platform, url, error: msg });
        }
      }

      // Step 2b: Persist thumbnails + avatars to Supabase storage so the
      // report survives TikTok/IG CDN URL expiration (~24-48h). Non-blocking
      // — if upload fails, the report still renders with CDN URLs.
      if (platformReports.length > 0) {
        console.log(`[audit:${id}] Step 2b: Persisting scraped images to storage...`);
        try {
          await persistAllScrapedImages(adminClient, id, platformReports);
        } catch (err) {
          console.warn(`[audit:${id}] Image persistence failed (non-blocking):`, err);
        }
      }

      // Step 3: AI discovers competitors
      console.log(`[audit:${id}] Step 3: Discovering competitors...`);
      const competitorUsernames = await discoverCompetitors(platformReports, websiteContext);
      console.log(`[audit:${id}] Found ${competitorUsernames.length} competitors: ${competitorUsernames.join(', ')}`);

      // Step 4: Scrape competitor profiles
      console.log(`[audit:${id}] Step 4: Scraping competitor profiles...`);
      const competitors: CompetitorProfile[] = [];
      for (const username of competitorUsernames) {
        try {
          const result = await scrapeTikTokProfile(`https://www.tiktok.com/@${username}`);
          competitors.push(buildCompetitorProfile(result.profile, result.videos));
        } catch (err) {
          console.error(`[audit:${id}] Failed to scrape competitor @${username}:`, err);
        }
      }

      // Step 5: Generate scorecard
      console.log(`[audit:${id}] Step 5: Generating scorecard...`);
      const scorecard = await generateScorecard(platformReports, competitors, websiteContext);

      // Step 6: Store results
      // Convert videos to TopicSearchVideoRow format for the video grid
      const allVideos = platformReports.flatMap(p => p.videos.map(v => ({
        id: v.id,
        search_id: id,
        platform: v.platform,
        platform_id: v.id,
        url: v.url,
        thumbnail_url: v.thumbnailUrl,
        title: null,
        description: v.description,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        bookmarks: v.bookmarks,
        author_username: v.authorUsername,
        author_display_name: v.authorDisplayName,
        author_avatar: v.authorAvatar,
        author_followers: v.authorFollowers,
        outlier_score: null,
        hook_text: null,
        hashtags: v.hashtags,
        duration_seconds: v.duration,
        publish_date: v.publishDate,
        scraped_at: new Date().toISOString(),
      })));

      await adminClient
        .from('prospect_audits')
        .update({
          status: 'completed',
          prospect_data: {
            websiteContext,
            platforms: platformReports,
            detectedSocialLinks: detectedLinks,
            failedPlatforms,
          },
          competitors_data: competitors,
          scorecard,
          videos_data: allVideos,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      console.log(`[audit:${id}] Audit completed: ${platformReports.length} platforms (${failedPlatforms.length} failed), ${competitors.length} competitors, ${allVideos.length} videos`);
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
    console.error('POST /api/analyze-social/[id]/process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

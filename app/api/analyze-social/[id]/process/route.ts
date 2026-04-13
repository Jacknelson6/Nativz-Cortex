import { NextRequest, NextResponse, after } from 'next/server';
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
  generateScorecard,
} from '@/lib/audit/analyze';
import { discoverCompetitorsByWebsite } from '@/lib/audit/discover-competitors';
import { analyzeVideosForBrand } from '@/lib/audit/analyze-videos';
import type { PlatformReport, CompetitorProfile, WebsiteContext, SocialLink, AuditPlatform, FailedPlatform } from '@/lib/audit/types';
import type { BrandVideoAudits } from '@/lib/audit/analyze';
import { persistAllScrapedImages, persistAllCompetitorImages } from '@/lib/audit/persist-scraped-images';
import {
  aggregateHookConsistency,
  aggregateContentVariety,
  aggregateContentQuality,
} from '@/lib/audit/scorecard-helpers';

export const maxDuration = 300;

/**
 * POST /api/analyze-social/[id]/process — Run the full audit pipeline
 *
 * Flow:
 * 1. Scrape the prospect's website → extract business context + social links
 * 2a. Scrape each social platform in parallel (TikTok, Instagram, etc.)
 * 2b. Competitor discovery + scraping — runs in parallel with 2a
 * 3. Gemini per-video grading for prospect + competitors (concurrency 3)
 * 4. AI generates scorecard (consumes Gemini grades)
 * 5. Store results; image persistence fires via after() off critical path
 */

/** Run `tasks` with at most `limit` concurrent workers. */
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

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

    // Allow retry on stale processing rows (updated_at > 7min ago means the
    // previous Vercel function was killed mid-flight and the row will never
    // self-transition). Fresh processing rows still 409 so we don't double
    // up live runs.
    if (audit.status === 'processing') {
      const ageMs = audit.updated_at
        ? Date.now() - new Date(audit.updated_at).getTime()
        : Infinity;
      if (ageMs <= 7 * 60 * 1000) {
        return NextResponse.json({ error: 'Audit is already processing' }, { status: 409 });
      }
      console.warn(`[audit:${id}] retrying stale processing audit (${Math.round(ageMs / 1000)}s old)`);
    }

    await adminClient
      .from('prospect_audits')
      .update({ status: 'processing', error_message: null, updated_at: new Date().toISOString() })
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

      // Steps 2a + 2b: Run prospect-platform scraping in parallel with
      // competitor discovery + scraping. Competitor discovery uses websiteContext
      // alone (targetPlatforms=[]) since prospect scrape hasn't finished yet —
      // this sacrifices top-hashtag seeding for ~50-60s wall-clock savings.
      console.log(`[audit:${id}] Steps 2a+2b: Scraping ${platformsToScrape.length} platform(s) + discovering competitors in parallel...`);

      const [prospectScrapeResults, competitorDiscoveryResult] = await Promise.all([
        // 2a: Prospect platform scrapes
        Promise.allSettled(
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
        ),
        // 2b: Competitor discovery + scraping (no prospect hashtag signals yet)
        discoverCompetitorsByWebsite(websiteContext, []).catch((err) => {
          console.error(`[audit:${id}] Competitor discovery failed (non-blocking):`, err);
          return { competitors: [] as CompetitorProfile[], failures: [] as { name: string; website: string; reason: string }[] };
        }),
      ]);

      // Collate prospect platform results
      const platformReports: PlatformReport[] = [];
      const failedPlatforms: FailedPlatform[] = [];

      for (let i = 0; i < prospectScrapeResults.length; i++) {
        const result = prospectScrapeResults[i];
        const { platform, url } = platformsToScrape[i];
        if (result.status === 'fulfilled' && result.value) {
          platformReports.push(result.value);
        } else if (result.status === 'rejected') {
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[audit:${id}] ${platform} scrape failed:`, msg);
          failedPlatforms.push({ platform, url, error: msg });
        }
      }

      const { competitors, failures: competitorFailures } = competitorDiscoveryResult;
      console.log(
        `[audit:${id}] Competitors: ${competitors.length} kept, ${competitorFailures.length} dropped`,
      );
      if (competitorFailures.length > 0) {
        for (const f of competitorFailures) {
          console.log(`[audit:${id}]   dropped "${f.name}" (${f.website}): ${f.reason}`);
        }
      }

      // Step 2b image persistence: move to after() so it doesn't block scorecard
      after(async () => {
        if (platformReports.length > 0) {
          console.log(`[audit:${id}] after(): persisting prospect images...`);
          try {
            await persistAllScrapedImages(adminClient, id, platformReports);
          } catch (err) {
            console.warn(`[audit:${id}] after(): prospect image persistence failed:`, err);
          }
        }
        if (competitors.length > 0) {
          console.log(`[audit:${id}] after(): persisting competitor images...`);
          try {
            await persistAllCompetitorImages(adminClient, id, competitors);
          } catch (err) {
            console.warn(`[audit:${id}] after(): competitor image persistence failed:`, err);
          }
        }
      });

      // Step 3: Gemini per-video grading — prospect + competitors (concurrency 3)
      console.log(`[audit:${id}] Step 3: Gemini video grading...`);

      // Build per-platform video map for prospect
      const prospectVideosByPlatform = Object.fromEntries(
        platformReports.map((p) => [p.platform, p.videos])
      ) as Parameters<typeof analyzeVideosForBrand>[0];

      // Grade prospect + each competitor concurrently (up to 3 competitors in parallel)
      const [prospectVideoAudits, ...competitorAuditResults] = await Promise.all([
        analyzeVideosForBrand(prospectVideosByPlatform),
        ...await runWithConcurrency(
          competitors.map((comp) => async () => {
            const videosByPlatform = { [comp.platform]: comp.recentVideos } as Parameters<typeof analyzeVideosForBrand>[0];
            const grades = await analyzeVideosForBrand(videosByPlatform);
            return { username: comp.username, grades };
          }),
          3,
        ),
      ]);

      // Build competitorVideoAudits keyed by username
      const competitorVideoAudits: Record<string, BrandVideoAudits> = {};
      for (const result of competitorAuditResults) {
        if (result) {
          competitorVideoAudits[result.username] = result.grades;
        }
      }

      console.log(`[audit:${id}] Gemini grading complete: prospect=${Object.keys(prospectVideoAudits).length} platforms, competitors=${Object.keys(competitorVideoAudits).length}`);

      // Attach gemini_grades to each PlatformReport
      for (const p of platformReports) {
        const audits = prospectVideoAudits[p.platform] ?? [];
        if (audits.length >= 3) {
          p.gemini_grades = {
            hook_consistency: aggregateHookConsistency(audits),
            content_variety: aggregateContentVariety(audits),
            content_quality: aggregateContentQuality(audits),
          };
        }
      }

      // Attach gemini_grades to each CompetitorProfile
      for (const comp of competitors) {
        const perPlatform = competitorVideoAudits[comp.username]?.[comp.platform] ?? [];
        if (perPlatform.length >= 3) {
          comp.gemini_grades = {
            hook_consistency: aggregateHookConsistency(perPlatform),
            content_variety: aggregateContentVariety(perPlatform),
            content_quality: aggregateContentQuality(perPlatform),
          };
        }
      }

      // Step 4: Generate scorecard with Gemini grades wired in
      console.log(`[audit:${id}] Step 4: Generating scorecard...`);
      const scorecard = await generateScorecard({
        platformSummaries: platformReports,
        competitors,
        websiteContext,
        prospectVideoAudits,
        competitorVideoAudits,
      });

      // Step 5: Store results
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

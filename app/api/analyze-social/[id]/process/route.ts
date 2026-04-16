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
  generateScorecard,
} from '@/lib/audit/analyze';
import { discoverCompetitorsByWebsite, scrapeProvidedCompetitors } from '@/lib/audit/discover-competitors';
import type { PlatformReport, CompetitorProfile, WebsiteContext, SocialLink, AuditPlatform, FailedPlatform } from '@/lib/audit/types';
import { persistAllScrapedImages, persistAllCompetitorImages } from '@/lib/audit/persist-scraped-images';
import { filterLastNDays, aggregateEngagement } from '@/lib/audit/scrape-helpers';
import { calculateEngagementRate, calculateAvgViews, estimatePostingFrequency } from '@/lib/audit/analyze';

export const maxDuration = 300;

/**
 * Platforms we can actually scrape today. Anything else the user adds gets
 * surfaced on the report as "no scraper yet" rather than silently dropped.
 * Add a platform to this set the moment its scraper + `switch` case land.
 */
// Facebook + LinkedIn intentionally excluded — Facebook scraping is too
// flaky (Meta blocks engagement counts on Reels), LinkedIn isn't short-form.
// Scraper code stays in place under lib/audit/ for easy re-add later.
const SUPPORTED_SCRAPE_PLATFORMS = new Set<AuditPlatform>([
  'tiktok',
  'instagram',
  'youtube',
]);

/**
 * POST /api/analyze-social/[id]/process — Run the full audit pipeline
 *
 * Flow:
 * 1. Scrape the prospect's website → extract business context + social links
 * 2a. Scrape each social platform in parallel (TikTok, Instagram, etc.)
 * 2b. Competitor discovery + scraping — runs in parallel with 2a
 * 3. AI generates the 6-card scorecard
 * 4. Persist scraped images to Supabase Storage (so report survives CDN expiry)
 * 5. Store results
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

      // Scrape every platform the user has given us a URL for — detected from
      // the website OR typed in manually on the confirm-platforms screen. The
      // prior version hardcoded ['tiktok','instagram','facebook','youtube'] on
      // the detection side and silently dropped anything else, so a user who
      // pasted a LinkedIn URL saw it disappear. Now: any key in social_urls is
      // accepted; unsupported platforms (no scraper yet) surface a clear
      // failure message on the report instead of vanishing.
      const manualPlatforms = (audit.social_urls as Record<string, string> | null) ?? {};
      const platformsToScrape: { platform: AuditPlatform; url: string }[] = [];
      const unsupportedPlatforms: FailedPlatform[] = [];

      const pushOrReplace = (platform: AuditPlatform, url: string) => {
        if (!url) return;
        if (!SUPPORTED_SCRAPE_PLATFORMS.has(platform)) {
          if (!unsupportedPlatforms.some((p) => p.platform === platform)) {
            unsupportedPlatforms.push({
              platform,
              url,
              error: `No scraper for ${platform} yet — we'll show this profile once support lands.`,
            });
          }
          return;
        }
        const existing = platformsToScrape.findIndex((p) => p.platform === platform);
        if (existing >= 0) platformsToScrape[existing].url = url;
        else platformsToScrape.push({ platform, url });
      };

      // Detected from the website — baseline set
      for (const link of detectedLinks) {
        pushOrReplace(link.platform, link.url);
      }

      // Manual overrides win when both are present
      for (const [platform, url] of Object.entries(manualPlatforms)) {
        pushOrReplace(platform as AuditPlatform, url);
      }

      // Legacy direct-TikTok column, for audits created before social_urls existed
      if (audit.tiktok_url) {
        pushOrReplace('tiktok', audit.tiktok_url);
      }

      // If no SCRAPEABLE profiles were found (detected or typed), pause and
      // ask the user to provide URLs. Unsupported-platform entries alone
      // don't count — we can't do anything with them yet.
      if (platformsToScrape.length === 0) {
        console.log(`[audit:${id}] No scrapeable social profiles found — requesting manual input`);
        await adminClient
          .from('prospect_audits')
          .update({
            status: 'needs_social_input',
            prospect_data: {
              websiteContext,
              platforms: [],
              detectedSocialLinks: detectedLinks,
              failedPlatforms: unsupportedPlatforms,
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
        // 2b: Competitor discovery + scraping.
        // If the user provided competitor URLs at the confirm-platforms step,
        // use those directly; otherwise fall back to LLM-driven discovery.
        (() => {
          const override = (audit.analysis_data as any)?.competitor_urls_override as string[] | null | undefined;
          const competitorPromise = override && override.length > 0
            ? scrapeProvidedCompetitors(override, platformsToScrape.map(p => p.platform))
            : discoverCompetitorsByWebsite(websiteContext, []);
          return competitorPromise;
        })().catch((err) => {
          console.error(`[audit:${id}] Competitor discovery failed (non-blocking):`, err);
          return { competitors: [] as CompetitorProfile[], failures: [] as { name: string; website: string; reason: string }[] };
        }),
      ]);

      // Collate prospect platform results. Unsupported-platform entries
      // (LinkedIn, etc.) are already in `unsupportedPlatforms`; merge them
      // in so the report shows "no scraper yet" instead of pretending the
      // user's URL was never submitted.
      const platformReports: PlatformReport[] = [];
      const failedPlatforms: FailedPlatform[] = [...unsupportedPlatforms];

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

      // 30-day window: trim prospect + competitor video arrays to the last
      // 30 days and recompute the dependent metrics (avg views, ER, posting
      // frequency) off the recent slice. The pre-30-day pipeline averaged
      // across the full 30-item scrape window (sometimes 300+ days for
      // back-catalog-heavy accounts), which diluted ER and misread cadence.
      // We keep the full `postsCount` lifetime number on the profile so the
      // report still knows total output.
      const WINDOW_DAYS = 30;
      for (const report of platformReports) {
        const recent = filterLastNDays(report.videos, WINDOW_DAYS);
        report.videos = recent;
        report.avgViews = calculateAvgViews(recent);
        report.engagementRate = calculateEngagementRate(recent, report.profile.followers);
        report.postingFrequency = estimatePostingFrequency(recent);
        report.thirtyDayEngagement = aggregateEngagement(recent, WINDOW_DAYS);
        // Overwrite `likes` on the profile with the 30-day aggregate since
        // that's the semantic Jack asked for — lifetime likes aren't
        // consistently available and weren't actually useful for briefs.
        report.profile.likes = report.thirtyDayEngagement.totalLikes;
      }

      const { competitors, failures: competitorFailures } = competitorDiscoveryResult;
      for (const c of competitors) {
        const recent = filterLastNDays(c.recentVideos, WINDOW_DAYS);
        c.recentVideos = recent;
        c.avgViews = calculateAvgViews(recent);
        c.engagementRate = calculateEngagementRate(recent, c.followers);
        c.postingFrequency = estimatePostingFrequency(recent);
        c.thirtyDayEngagement = aggregateEngagement(recent, WINDOW_DAYS);
      }

      console.log(
        `[audit:${id}] Competitors: ${competitors.length} kept, ${competitorFailures.length} dropped`,
      );
      if (competitorFailures.length > 0) {
        for (const f of competitorFailures) {
          console.log(`[audit:${id}]   dropped "${f.name}" (${f.website}): ${f.reason}`);
        }
      }

      // Step 2b image persistence: copy each scraped avatar + thumbnail into
      // Supabase Storage so the report still renders once the Apify CDN URLs
      // expire (~hours for TikTok, ~days for IG).
      //
      // Was in after() previously — moved into the main flow so the data
      // the user sees on completion already has Storage URLs. after() was
      // unreliable on Vercel (didn't always complete), which left the
      // report with raw Apify URLs that 403 within hours.
      //
      // `persistAllScrapedImages` / `persistAllCompetitorImages` mutate
      // their inputs in place with the new Storage URLs, so the
      // platformReports + competitors arrays we pass to the final DB
      // write below already contain the persisted URLs.
      console.log(`[audit:${id}] Step 2b: Persisting scraped images...`);
      const persistStartMs = Date.now();
      const [prospectPersistResult, competitorPersistResult] = await Promise.allSettled([
        platformReports.length > 0
          ? persistAllScrapedImages(adminClient, id, platformReports)
          : Promise.resolve(),
        competitors.length > 0
          ? persistAllCompetitorImages(adminClient, id, competitors)
          : Promise.resolve(),
      ]);
      if (prospectPersistResult.status === 'rejected') {
        console.warn(`[audit:${id}] prospect image persistence failed (non-fatal):`, prospectPersistResult.reason);
      }
      if (competitorPersistResult.status === 'rejected') {
        console.warn(`[audit:${id}] competitor image persistence failed (non-fatal):`, competitorPersistResult.reason);
      }
      console.log(`[audit:${id}] image persistence took ${Math.round((Date.now() - persistStartMs) / 1000)}s`);

      // Step 3: Generate the 6-card scorecard. The old Gemini per-video
      // pre-grading pipeline was retired along with the 13-category scorecard
      // — we're back to a single LLM pass that compares the prospect vs.
      // competitors on six high-leverage categories.
      console.log(`[audit:${id}] Step 3: Generating scorecard...`);
      const socialGoals = (audit.analysis_data as any)?.social_goals as string[] | undefined;
      const scorecard = await generateScorecard({
        platformSummaries: platformReports,
        competitors,
        websiteContext,
        socialGoals,
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

      // Pre-attach: if the user picked a client on the confirm screen, auto-
      // create the benchmark row now so the weekly cron immediately has a
      // queued job. No-op when unattached — the post-report "Attach to
      // client" button covers retroactive flows.
      const attachedClientId = (audit as { attached_client_id?: string | null }).attached_client_id ?? null;
      if (attachedClientId && competitors.length > 0) {
        try {
          const competitorsSnapshot = competitors.map((c) => ({
            username: c.username,
            displayName: c.displayName,
            platform: c.platform,
            profileUrl: c.profileUrl,
            avatarUrl: c.avatarUrl,
            baselineFollowers: c.followers,
            baselineAvgViews: c.avgViews,
            baselineEngagementRate: c.engagementRate,
            baselinePostingFrequency: c.postingFrequency,
          }));
          const nextDue = new Date();
          nextDue.setDate(nextDue.getDate() + 7); // weekly default
          const { error: benchErr } = await adminClient
            .from('client_benchmarks')
            .insert({
              client_id: attachedClientId,
              audit_id: id,
              competitors_snapshot: competitorsSnapshot,
              cadence: 'weekly',
              analytics_source: 'auto',
              next_snapshot_due_at: nextDue.toISOString(),
              created_by: (audit as { created_by?: string | null }).created_by ?? null,
            });
          if (benchErr) {
            console.warn(`[audit:${id}] auto-benchmark insert failed (non-fatal):`, benchErr);
          } else {
            console.log(`[audit:${id}] auto-benchmark created for client ${attachedClientId}`);
          }
        } catch (err) {
          console.warn(`[audit:${id}] auto-benchmark failed (non-fatal):`, err);
        }
      }

      console.log(`[audit:${id}] Audit completed: ${platformReports.length} platforms (${failedPlatforms.length} failed), ${competitors.length} competitors, ${allVideos.length} videos`);
      return NextResponse.json({ status: 'completed' });
    } catch (processError) {
      const msg = processError instanceof Error ? processError.message : 'Unknown error';
      const stack = processError instanceof Error ? processError.stack ?? null : null;
      // Log the full stack so we can diagnose from Supabase logs without
      // needing to repro. The `error_message` column is truncated to the
      // message for UI display; raw stack goes to console + api_error_log.
      console.error(`[audit:${id}] Processing failed: ${msg}\n${stack ?? ''}`);

      try {
        const { logApiError } = await import('@/lib/api/error-log');
        await logApiError({
          route: '/api/analyze-social/[id]/process',
          statusCode: 500,
          errorMessage: msg,
          errorDetail: stack ?? undefined,
          meta: { audit_id: id },
        });
      } catch (logErr) {
        console.warn(`[audit:${id}] error-log write failed (non-fatal):`, logErr);
      }

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

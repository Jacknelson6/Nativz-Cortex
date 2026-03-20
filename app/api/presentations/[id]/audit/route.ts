import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';

export const maxDuration = 120;

const schema = z.object({
  url: z.string().min(1, 'URL is required').max(500),
});

// ─── Platform detection ─────────────────────────────────────────────────────

function detectPlatform(url: string): { platform: string; handle: string } {
  const lower = url.toLowerCase();

  // Instagram
  const igMatch = lower.match(/instagram\.com\/([a-z0-9._]+)/i);
  if (igMatch) return { platform: 'instagram', handle: igMatch[1] };

  // TikTok
  const ttMatch = lower.match(/tiktok\.com\/@([a-z0-9._]+)/i);
  if (ttMatch) return { platform: 'tiktok', handle: ttMatch[1] };

  // YouTube
  const ytMatch = lower.match(/youtube\.com\/@([a-z0-9._-]+)/i) ||
    lower.match(/youtube\.com\/channel\/([a-z0-9_-]+)/i);
  if (ytMatch) return { platform: 'youtube', handle: ytMatch[1] };

  // Facebook
  const fbMatch = lower.match(/facebook\.com\/([a-z0-9._]+)/i);
  if (fbMatch && fbMatch[1] !== 'profile.php') return { platform: 'facebook', handle: fbMatch[1] };

  // X / Twitter
  const xMatch = lower.match(/(?:x|twitter)\.com\/([a-z0-9_]+)/i);
  if (xMatch) return { platform: 'twitter', handle: xMatch[1] };

  // Generic website
  return { platform: 'website', handle: '' };
}

// ─── Scrape utilities ────────────────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function extractMeta(html: string, property: string): string {
  const propMatch = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  ) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
  );
  if (propMatch) return propMatch[1];

  const nameMatch = html.match(
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  ) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i')
  );
  return nameMatch?.[1] ?? '';
}

function parseNumber(str: string | undefined | null): number | null {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '').trim().toLowerCase();
  const suffixMatch = cleaned.match(/^([\d.]+)\s*([kmb])/);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffixMatch[2]] ?? 1;
    return Math.round(num * multiplier);
  }
  const num = parseInt(cleaned.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? null : num;
}

interface ScrapedProfile {
  name: string;
  handle: string;
  platform: string;
  bio: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  engagement_rate: number | null;
  profile_image: string | null;
  url: string;
  raw_description: string;
}

async function scrapeProfile(platform: string, handle: string, inputUrl: string): Promise<ScrapedProfile> {
  const base: ScrapedProfile = {
    name: handle || new URL(inputUrl).hostname,
    handle: handle || new URL(inputUrl).hostname,
    platform,
    bio: '',
    followers: null,
    following: null,
    posts: null,
    engagement_rate: null,
    profile_image: null,
    url: inputUrl,
    raw_description: '',
  };

  const urlMap: Record<string, string> = {
    instagram: `https://www.instagram.com/${handle}/`,
    youtube: handle.startsWith('UC') ? `https://www.youtube.com/channel/${handle}` : `https://www.youtube.com/@${handle}`,
    tiktok: `https://www.tiktok.com/@${handle}`,
    twitter: `https://x.com/${handle}`,
    facebook: `https://www.facebook.com/${handle}`,
    website: inputUrl,
  };

  const url = urlMap[platform] ?? inputUrl;
  base.url = url;

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return base;
    const html = await res.text();

    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    base.raw_description = description;
    base.name = extractMeta(html, 'og:title')?.replace(/ \(@\w+\).*$/, '').replace(/ - YouTube$/, '').replace(/ \| TikTok$/, '') || handle || base.name;
    base.profile_image = extractMeta(html, 'og:image') || null;

    if (platform === 'instagram') {
      const statsMatch = description.match(/([\d,.]+[KMBkmb]?)\s*Followers/i);
      const followingMatch = description.match(/([\d,.]+[KMBkmb]?)\s*Following/i);
      const postsMatch = description.match(/([\d,.]+[KMBkmb]?)\s*Posts/i);
      base.followers = parseNumber(statsMatch?.[1]);
      base.following = parseNumber(followingMatch?.[1]);
      base.posts = parseNumber(postsMatch?.[1]);
      const bioMatch = description.match(/Posts?\s*[-–—]\s*(.+)/i);
      if (bioMatch) base.bio = bioMatch[1].replace(/["']/g, '').trim();
      if (base.followers && base.followers > 0) {
        if (base.followers < 10_000) base.engagement_rate = 4.5;
        else if (base.followers < 100_000) base.engagement_rate = 2.8;
        else if (base.followers < 1_000_000) base.engagement_rate = 1.8;
        else base.engagement_rate = 1.2;
      }
    } else if (platform === 'youtube') {
      base.bio = description;
      const subMatch = html.match(/"subscriberCountText":\s*\{"simpleText":\s*"([^"]+)"/);
      if (subMatch) base.followers = parseNumber(subMatch[1].replace(/\s*subscribers?/i, ''));
      const videoMatch = html.match(/"videosCountText":\s*\{"runs":\s*\[\{"text":\s*"([\d,]+)"/);
      if (videoMatch) base.posts = parseNumber(videoMatch[1]);
    } else if (platform === 'tiktok') {
      const followersMatch = description.match(/([\d.]+[KMBkmb]?)\s*Followers/i);
      const likesMatch = description.match(/([\d.]+[KMBkmb]?)\s*Likes/i);
      base.followers = parseNumber(followersMatch?.[1]);
      if (likesMatch) base.engagement_rate = 3.0; // TikTok baseline estimate
    } else if (platform === 'facebook') {
      base.bio = description;
      const followersMatch = description.match(/([\d,.]+[KMBkmb]?)\s*(?:followers|likes)/i);
      base.followers = parseNumber(followersMatch?.[1]);
    } else if (platform === 'website') {
      base.bio = description;
      base.name = extractMeta(html, 'og:title') || extractMeta(html, 'og:site_name') || new URL(inputUrl).hostname;
    }
  } catch {
    // Return base profile on error
  }

  return base;
}

// ─── Brave Search for content discovery ──────────────────────────────────────

async function searchContent(platform: string, handle: string, name: string): Promise<string[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const queries: string[] = [];
  if (platform === 'instagram' && handle) {
    queries.push(`site:instagram.com "${handle}" recent posts`);
    queries.push(`"${handle}" instagram content strategy`);
  } else if (platform === 'youtube' && handle) {
    queries.push(`site:youtube.com "@${handle}" latest videos`);
    queries.push(`"${handle}" youtube channel analysis`);
  } else if (platform === 'tiktok' && handle) {
    queries.push(`site:tiktok.com "@${handle}"`);
    queries.push(`"${handle}" tiktok content`);
  } else if (platform === 'facebook' && handle) {
    queries.push(`site:facebook.com "${handle}" posts`);
  } else if (name) {
    queries.push(`"${name}" social media presence`);
    queries.push(`"${name}" content marketing`);
  }

  const snippets: string[] = [];

  for (const query of queries.slice(0, 2)) {
    try {
      const params = new URLSearchParams({ q: query, count: '8' });
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data.web?.results ?? [];
      for (const r of results) {
        const snippet = `[${r.title}] ${r.description ?? ''}`.substring(0, 300);
        snippets.push(snippet);
      }
    } catch {
      // Continue on search failure
    }
  }

  return snippets.slice(0, 15);
}

// ─── AI analysis ─────────────────────────────────────────────────────────────

async function analyzeWithAI(profile: ScrapedProfile, contentSnippets: string[]) {
  const contentContext = contentSnippets.length > 0
    ? `\n\nRecent content found online:\n${contentSnippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const profileContext = [
    `Platform: ${profile.platform}`,
    `Name: ${profile.name}`,
    `Handle: @${profile.handle}`,
    profile.bio ? `Bio: ${profile.bio}` : null,
    profile.followers != null ? `Followers: ${profile.followers.toLocaleString()}` : null,
    profile.following != null ? `Following: ${profile.following.toLocaleString()}` : null,
    profile.posts != null ? `Posts: ${profile.posts.toLocaleString()}` : null,
    profile.engagement_rate != null ? `Engagement rate: ${profile.engagement_rate}%` : null,
    profile.raw_description ? `Raw description: ${profile.raw_description}` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are a social media strategist at a marketing agency. Analyze this prospect's social media presence and provide a detailed audit. Be specific, actionable, and data-driven. Base your analysis on the available data — if data is limited, make reasonable inferences and note when you're inferring.`;

  const userPrompt = `Analyze this prospect's social media presence:

${profileContext}${contentContext}

Return a JSON object with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "content_pillars": [
    { "name": "Pillar name", "description": "Brief description", "post_count": 10, "avg_engagement": 3.5, "tier": "A" }
  ],
  "visual_styles": [
    { "style": "Style name (e.g. Talking head, B-roll, Carousel, Text overlay)", "frequency_pct": 40 }
  ],
  "posting_cadence": {
    "posts_per_week": 3,
    "best_days": ["Monday", "Wednesday", "Friday"],
    "best_times": ["9am", "6pm"],
    "consistency_score": 6
  },
  "hook_strategies": [
    { "strategy": "Hook strategy description", "frequency_pct": 30, "effectiveness": "high" }
  ],
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ]
}

Requirements:
- Generate 3-6 content pillars, ranked by tier (S/A/B/C/D based on quality and engagement)
- Generate 3-5 visual styles with percentages that sum to 100
- Posting cadence consistency_score should be 1-10
- Generate 2-4 hook strategies
- Generate 4-8 specific, actionable recommendations that a marketing agency could pitch
- Tiers: S = exceptional, A = strong, B = average, C = below average, D = weak
- If limited data, make reasonable inferences based on the platform, follower count, and any available content`;

  const result = await createCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 2000,
    feature: 'prospect_audit',
  });

  // Parse the AI response
  const text = result.text.trim();
  // Remove markdown code fences if present
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      content_pillars: Array.isArray(parsed.content_pillars) ? parsed.content_pillars.map((p: Record<string, unknown>) => ({
        name: String(p.name ?? ''),
        description: String(p.description ?? ''),
        post_count: Number(p.post_count ?? 0),
        avg_engagement: Number(p.avg_engagement ?? 0),
        tier: ['S', 'A', 'B', 'C', 'D'].includes(String(p.tier)) ? String(p.tier) : 'B',
      })) : [],
      visual_styles: Array.isArray(parsed.visual_styles) ? parsed.visual_styles.map((s: Record<string, unknown>) => ({
        style: String(s.style ?? ''),
        frequency_pct: Number(s.frequency_pct ?? 0),
      })) : [],
      posting_cadence: parsed.posting_cadence ? {
        posts_per_week: Number(parsed.posting_cadence.posts_per_week ?? 0),
        best_days: Array.isArray(parsed.posting_cadence.best_days) ? parsed.posting_cadence.best_days.map(String) : [],
        best_times: Array.isArray(parsed.posting_cadence.best_times) ? parsed.posting_cadence.best_times.map(String) : [],
        consistency_score: Math.min(10, Math.max(1, Number(parsed.posting_cadence.consistency_score ?? 5))),
      } : null,
      hook_strategies: Array.isArray(parsed.hook_strategies) ? parsed.hook_strategies.map((h: Record<string, unknown>) => ({
        strategy: String(h.strategy ?? ''),
        frequency_pct: Number(h.frequency_pct ?? 0),
        effectiveness: ['high', 'medium', 'low'].includes(String(h.effectiveness)) ? String(h.effectiveness) : 'medium',
      })) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    };
  } catch (e) {
    console.error('Failed to parse AI analysis:', e, 'Raw text:', text.substring(0, 500));
    return {
      content_pillars: [],
      visual_styles: [],
      posting_cadence: null,
      hook_strategies: [],
      recommendations: ['Unable to parse AI analysis. Try running the audit again.'],
    };
  }
}

// ─── Main route ──────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth check
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Validate input
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { url: inputUrl } = parsed.data;

    // Ensure URL has protocol
    const normalizedUrl = inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`;

    // Detect platform
    const { platform, handle } = detectPlatform(normalizedUrl);

    // Mark as running
    await adminClient
      .from('presentations')
      .update({
        audit_data: {
          url: normalizedUrl,
          status: 'running',
          profile: null,
          content_pillars: [],
          visual_styles: [],
          posting_cadence: null,
          hook_strategies: [],
          recommendations: [],
          scraped_content: [],
          analyzed_at: null,
        },
      })
      .eq('id', id);

    // Step 1: Scrape profile
    const profile = await scrapeProfile(platform, handle, normalizedUrl);

    // Step 2: Search for content
    const contentSnippets = await searchContent(platform, handle, profile.name);

    // Step 3: AI analysis
    const analysis = await analyzeWithAI(profile, contentSnippets);

    // Step 4: Build audit data and save
    const auditData = {
      url: normalizedUrl,
      status: 'done' as const,
      profile: {
        name: profile.name,
        handle: profile.handle,
        platform: profile.platform,
        bio: profile.bio,
        followers: profile.followers,
        following: profile.following,
        posts: profile.posts,
        engagement_rate: profile.engagement_rate,
        profile_image: profile.profile_image,
        url: profile.url,
      },
      content_pillars: analysis.content_pillars,
      visual_styles: analysis.visual_styles,
      posting_cadence: analysis.posting_cadence,
      hook_strategies: analysis.hook_strategies,
      recommendations: analysis.recommendations,
      scraped_content: contentSnippets,
      analyzed_at: new Date().toISOString(),
    };

    const { error: updateError } = await adminClient
      .from('presentations')
      .update({ audit_data: auditData })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to save audit data:', updateError);
      return NextResponse.json({ error: 'Failed to save audit results' }, { status: 500 });
    }

    return NextResponse.json({ success: true, audit_data: auditData });
  } catch (error) {
    console.error('POST /api/presentations/[id]/audit error:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

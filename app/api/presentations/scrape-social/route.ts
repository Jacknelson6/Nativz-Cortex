import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  platform: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'facebook']),
  handle: z.string().min(1, 'Handle is required').max(200),
});

export interface SocialProfileData {
  platform: string;
  handle: string;
  display_name: string;
  bio: string;
  profile_image: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  engagement_rate: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_views: number | null;
  url: string;
  scraped_at: string;
  raw_description: string;
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { platform, handle } = parsed.data;
    const cleanHandle = handle.replace(/^@/, '').trim();

    let profileData: SocialProfileData;

    switch (platform) {
      case 'instagram':
        profileData = await scrapeInstagram(cleanHandle);
        break;
      case 'youtube':
        profileData = await scrapeYouTube(cleanHandle);
        break;
      case 'tiktok':
        profileData = await scrapeTikTok(cleanHandle);
        break;
      case 'twitter':
        profileData = await scrapeTwitter(cleanHandle);
        break;
      case 'facebook':
        profileData = await scrapeFacebook(cleanHandle);
        break;
      default:
        return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    return NextResponse.json(profileData);
  } catch (error) {
    console.error('POST /api/presentations/scrape-social error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function parseNumber(str: string | undefined | null): number | null {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '').trim().toLowerCase();

  // Handle K/M/B suffixes
  const suffixMatch = cleaned.match(/^([\d.]+)\s*([kmb])/);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffixMatch[2]] ?? 1;
    return Math.round(num * multiplier);
  }

  const num = parseInt(cleaned.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? null : num;
}

function extractMeta(html: string, property: string): string {
  // Try property="..."
  const propMatch = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  ) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
  );
  if (propMatch) return propMatch[1];

  // Try name="..."
  const nameMatch = html.match(
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  ) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i')
  );
  return nameMatch?.[1] ?? '';
}

function baseProfile(platform: string, handle: string, url: string): SocialProfileData {
  return {
    platform,
    handle,
    display_name: handle,
    bio: '',
    profile_image: null,
    followers: null,
    following: null,
    posts: null,
    engagement_rate: null,
    avg_likes: null,
    avg_comments: null,
    avg_views: null,
    url,
    scraped_at: new Date().toISOString(),
    raw_description: '',
  };
}

// ─── Platform scrapers ───────────────────────────────────────────────────────

async function scrapeInstagram(handle: string): Promise<SocialProfileData> {
  const url = `https://www.instagram.com/${handle}/`;
  const profile = baseProfile('instagram', handle, url);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return profile;
    const html = await res.text();

    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    profile.raw_description = description;
    profile.display_name = extractMeta(html, 'og:title')?.replace(/ \(@\w+\).*$/, '') || handle;
    profile.profile_image = extractMeta(html, 'og:image') || null;

    // Instagram og:description format: "X Followers, Y Following, Z Posts - ..."
    const statsMatch = description.match(/([\d,.]+[KMBkmb]?)\s*Followers/i);
    const followingMatch = description.match(/([\d,.]+[KMBkmb]?)\s*Following/i);
    const postsMatch = description.match(/([\d,.]+[KMBkmb]?)\s*Posts/i);

    profile.followers = parseNumber(statsMatch?.[1]);
    profile.following = parseNumber(followingMatch?.[1]);
    profile.posts = parseNumber(postsMatch?.[1]);

    // Extract bio from description (after the stats part)
    const bioMatch = description.match(/Posts?\s*[-–—]\s*(.+)/i);
    if (bioMatch) {
      profile.bio = bioMatch[1].replace(/["']/g, '').trim();
    }

    // Estimate engagement rate from public data
    if (profile.followers && profile.followers > 0 && profile.posts && profile.posts > 0) {
      // Industry average baseline: small accounts ~3-6%, large accounts ~1-3%
      if (profile.followers < 10_000) profile.engagement_rate = 4.5;
      else if (profile.followers < 100_000) profile.engagement_rate = 2.8;
      else if (profile.followers < 1_000_000) profile.engagement_rate = 1.8;
      else profile.engagement_rate = 1.2;
    }
  } catch {
    // Return base profile on error
  }

  return profile;
}

async function scrapeYouTube(handle: string): Promise<SocialProfileData> {
  // Try @handle first, then channel name
  const url = handle.startsWith('UC') || handle.startsWith('UC')
    ? `https://www.youtube.com/channel/${handle}`
    : `https://www.youtube.com/@${handle}`;
  const profile = baseProfile('youtube', handle, url);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return profile;
    const html = await res.text();

    profile.display_name = extractMeta(html, 'og:title')?.replace(/ - YouTube$/, '') || handle;
    profile.profile_image = extractMeta(html, 'og:image') || null;
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    profile.raw_description = description;
    profile.bio = description;

    // Try to extract subscriber count from page data
    const subMatch = html.match(/"subscriberCountText":\s*\{"simpleText":\s*"([^"]+)"/);
    if (subMatch) {
      profile.followers = parseNumber(subMatch[1].replace(/\s*subscribers?/i, ''));
    }

    // Video count
    const videoMatch = html.match(/"videosCountText":\s*\{"runs":\s*\[\{"text":\s*"([\d,]+)"/);
    if (videoMatch) {
      profile.posts = parseNumber(videoMatch[1]);
    }
  } catch {
    // Return base profile
  }

  return profile;
}

async function scrapeTikTok(handle: string): Promise<SocialProfileData> {
  const url = `https://www.tiktok.com/@${handle}`;
  const profile = baseProfile('tiktok', handle, url);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return profile;
    const html = await res.text();

    profile.display_name = extractMeta(html, 'og:title')?.replace(/ \| TikTok$/, '') || handle;
    profile.profile_image = extractMeta(html, 'og:image') || null;
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    profile.raw_description = description;

    // TikTok description: "Username (@handle) on TikTok | X Likes. Y Followers. Bio text."
    const followersMatch = description.match(/([\d.]+[KMBkmb]?)\s*Followers/i);
    const likesMatch = description.match(/([\d.]+[KMBkmb]?)\s*Likes/i);

    profile.followers = parseNumber(followersMatch?.[1]);
    profile.avg_likes = parseNumber(likesMatch?.[1]);

    // Try JSON-LD
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld.interactionStatistic) {
          for (const stat of ld.interactionStatistic) {
            if (stat.interactionType?.['@type'] === 'http://schema.org/FollowAction') {
              profile.followers = profile.followers ?? parseNumber(String(stat.userInteractionCount));
            }
          }
        }
      } catch { /* ignore parse errors */ }
    }
  } catch {
    // Return base profile
  }

  return profile;
}

async function scrapeTwitter(handle: string): Promise<SocialProfileData> {
  // Use nitter or direct X.com scraping (limited)
  const url = `https://x.com/${handle}`;
  const profile = baseProfile('twitter', handle, url);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return profile;
    const html = await res.text();

    profile.display_name = extractMeta(html, 'og:title')?.replace(/ \(@\w+\).*$/, '') || handle;
    profile.profile_image = extractMeta(html, 'og:image') || null;
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    profile.raw_description = description;
    profile.bio = description;
  } catch {
    // Return base profile
  }

  return profile;
}

async function scrapeFacebook(handle: string): Promise<SocialProfileData> {
  const url = `https://www.facebook.com/${handle}`;
  const profile = baseProfile('facebook', handle, url);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return profile;
    const html = await res.text();

    profile.display_name = extractMeta(html, 'og:title') || handle;
    profile.profile_image = extractMeta(html, 'og:image') || null;
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    profile.raw_description = description;
    profile.bio = description;

    // Facebook sometimes includes follower count in description
    const followersMatch = description.match(/([\d,.]+[KMBkmb]?)\s*(?:followers|likes)/i);
    profile.followers = parseNumber(followersMatch?.[1]);
  } catch {
    // Return base profile
  }

  return profile;
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import type { ProspectAuditData, ProspectAuditProfile } from '@/app/admin/presentations/[id]/types';

export const maxDuration = 120;

const schema = z.object({
  url: z.string().min(1).max(500),
  clientId: z.string().uuid().optional(),
});

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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
        { status: 400 },
      );
    }

    const { url } = parsed.data;

    // Detect platform from URL
    const platform = detectPlatform(url);

    // Scrape profile data
    const profile = await scrapeProfile(url, platform);

    // Run AI analysis
    const analysis = await analyzeProfile(profile, url, user.id, user.email ?? undefined);

    const result: ProspectAuditData = {
      url,
      status: 'done',
      profile,
      content_pillars: analysis.content_pillars ?? [],
      visual_styles: analysis.visual_styles ?? [],
      posting_cadence: analysis.posting_cadence ?? null,
      hook_strategies: analysis.hook_strategies ?? [],
      recommendations: analysis.recommendations ?? [],
      scraped_content: [],
      analyzed_at: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/strategy-lab/prospect-audit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Audit failed' },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('facebook.com') || u.includes('fb.com')) return 'facebook';
  return 'website';
}

function extractMeta(html: string, property: string): string {
  const propMatch =
    html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
  if (propMatch) return propMatch[1];
  const nameMatch =
    html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'));
  return nameMatch?.[1] ?? '';
}

function parseNumber(str: string | undefined | null): number {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, '').trim().toLowerCase();
  const suffixMatch = cleaned.match(/^([\d.]+)\s*([kmb])/);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffixMatch[2]] ?? 1;
    return Math.round(num * multiplier);
  }
  const num = parseInt(cleaned.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

async function scrapeProfile(url: string, platform: string): Promise<ProspectAuditProfile> {
  const profile: ProspectAuditProfile = {
    name: '',
    handle: '',
    platform,
    bio: '',
    followers: null,
    following: null,
    posts: null,
    engagement_rate: null,
    profile_image: null,
    url,
  };

  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(normalizedUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return profile;

    const html = await res.text();
    profile.name = extractMeta(html, 'og:title')?.replace(/ \(@\w+\).*$/, '') || '';
    profile.profile_image = extractMeta(html, 'og:image') || null;

    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');

    if (platform === 'instagram') {
      profile.handle = url.match(/instagram\.com\/([^/?]+)/)?.[1] ?? '';
      profile.followers = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Followers/i)?.[1]);
      profile.following = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Following/i)?.[1]);
      profile.posts = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Posts/i)?.[1]);
      const bioMatch = description.match(/Posts?\s*[-–—]\s*(.+)/i);
      if (bioMatch) profile.bio = bioMatch[1].replace(/["']/g, '').trim();
    } else if (platform === 'tiktok') {
      profile.handle = url.match(/tiktok\.com\/@([^/?]+)/)?.[1] ?? '';
      profile.followers = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Followers/i)?.[1]);
      profile.bio = description;
    } else {
      profile.handle = url.replace(/https?:\/\/(www\.)?/, '').split('/')[1] ?? '';
      profile.bio = description;
    }

    if (!profile.name) profile.name = profile.handle || 'Unknown';
  } catch {
    // use base fallback
  }

  return profile;
}

async function analyzeProfile(
  profile: ProspectAuditProfile,
  url: string,
  userId?: string,
  userEmail?: string,
) {
  const prompt = `You are a social media strategist at Nativz, a video marketing agency. Analyze this prospect's social media presence and return a JSON object.

Profile:
- Name: ${profile.name || 'Unknown'}
- Handle: @${profile.handle || 'unknown'}
- Platform: ${profile.platform}
- Bio: ${profile.bio || 'N/A'}
- Followers: ${profile.followers ?? 'Unknown'}
- Following: ${profile.following ?? 'Unknown'}
- Posts: ${profile.posts ?? 'Unknown'}
- URL: ${url}

Return ONLY valid JSON with this structure:
{
  "content_pillars": [
    { "name": "string", "description": "string", "post_count": number, "avg_engagement": number, "tier": "S"|"A"|"B"|"C"|"D" }
  ],
  "visual_styles": [
    { "style": "string", "frequency_pct": number }
  ],
  "posting_cadence": {
    "posts_per_week": number,
    "best_days": ["string"],
    "best_times": ["string"],
    "consistency_score": number
  },
  "hook_strategies": [
    { "strategy": "string", "frequency_pct": number, "effectiveness": "high"|"medium"|"low" }
  ],
  "recommendations": ["string"]
}

Generate realistic, insightful data based on what you can infer from their profile. Provide 3-5 content pillars, 3-5 visual styles, 3-5 hook strategies, and 4-6 recommendations for what Nativz could pitch to improve their content strategy.`;

  try {
    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      timeoutMs: 60000,
      feature: 'prospect_audit',
      modelPreference: ['anthropic/claude-sonnet-4-5'],
      userId,
      userEmail,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('AI analysis failed:', err);
    return {};
  }
}

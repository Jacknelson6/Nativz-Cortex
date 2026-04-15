import { NextRequest, NextResponse } from 'next/server';
import { getBrandFromRequest } from '@/lib/agency/brand-from-request';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAdImage } from '@/lib/ad-creatives/generate-image';
import { createCompletion } from '@/lib/ai/client';
import { DEFAULT_OPENROUTER_MODEL } from '@/lib/ai/openrouter-default-model';
import type { SocialResultsData, SocialResultsProfile, SocialResultsPost, SocialResultsHighlight } from '@/app/admin/presentations/[id]/types';

export const maxDuration = 120;

const schema = z.object({
  instagram_handle: z.string().min(1).max(100),
  timeline_months: z.number().int().min(1).max(12).default(3),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { brandName } = getBrandFromRequest(request);
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

    const { data: presentation } = await adminClient
      .from('presentations')
      .select('id, type, audit_data')
      .eq('id', id)
      .single();

    if (!presentation || presentation.type !== 'social_results') {
      return NextResponse.json({ error: 'Presentation not found or wrong type' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { instagram_handle, timeline_months } = parsed.data;
    const cleanHandle = instagram_handle.replace(/^@/, '').trim();

    // Set status to 'scraping'
    const initialData: SocialResultsData = {
      instagram_handle: cleanHandle,
      status: 'scraping',
      before: null,
      after: null,
      timeline_months,
      generated_at: null,
    };
    await adminClient.from('presentations').update({ audit_data: initialData as unknown as Record<string, unknown> }).eq('id', id);

    // Step 1: Scrape current Instagram profile
    const beforeProfile = await scrapeInstagramProfile(cleanHandle);

    // Step 2: Set status to 'generating'
    await adminClient
      .from('presentations')
      .update({ audit_data: { ...initialData, status: 'generating', before: beforeProfile } as unknown as Record<string, unknown> })
      .eq('id', id);

    // Step 3: Generate revised bio
    const revisedBio = await generateRevisedBio(
      beforeProfile,
      timeline_months,
      brandName,
      user.id,
      user.email ?? undefined,
    );

    // Step 4: Project follower growth
    const projectedFollowers = projectFollowers(beforeProfile.followers, timeline_months);

    // Step 5: Generate 6 new post images
    const generatedPosts = await generatePostImages(beforeProfile, id, 6);

    // Step 6: Assemble "after" profile
    const afterProfile: SocialResultsProfile = {
      ...beforeProfile,
      bio: revisedBio,
      followers: projectedFollowers,
      posts_count: beforeProfile.posts_count + generatedPosts.length,
      posts: [
        ...generatedPosts,
        ...beforeProfile.posts.slice(0, Math.max(0, 9 - generatedPosts.length)),
      ],
      story_highlights: generateDefaultHighlights(),
    };

    // Step 7: Save final result
    const finalData: SocialResultsData = {
      instagram_handle: cleanHandle,
      status: 'done',
      before: beforeProfile,
      after: afterProfile,
      timeline_months,
      generated_at: new Date().toISOString(),
    };

    await adminClient
      .from('presentations')
      .update({ audit_data: finalData as unknown as Record<string, unknown> })
      .eq('id', id);

    return NextResponse.json(finalData);
  } catch (error) {
    console.error('POST /api/presentations/[id]/social-results/generate error:', error);
    try {
      const adminClient = createAdminClient();
      await adminClient
        .from('presentations')
        .update({
          audit_data: {
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          } as unknown as Record<string, unknown>,
        })
        .eq('id', id);
    } catch { /* ignore secondary error */ }
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}

// ─── Instagram scraping ───────────────────────────────────────────────────────

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

async function scrapeInstagramProfile(handle: string): Promise<SocialResultsProfile> {
  const url = `https://www.instagram.com/${handle}/`;

  const profile: SocialResultsProfile = {
    handle,
    display_name: handle,
    bio: '',
    profile_image: null,
    followers: 0,
    following: 0,
    posts_count: 0,
    posts: [],
    story_highlights: [],
  };

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const html = await res.text();
      const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
      profile.display_name = extractMeta(html, 'og:title')?.replace(/ \(@\w+\).*$/, '') || handle;
      profile.profile_image = extractMeta(html, 'og:image') || null;
      profile.followers = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Followers/i)?.[1]);
      profile.following = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Following/i)?.[1]);
      profile.posts_count = parseNumber(description.match(/([\d,.]+[KMBkmb]?)\s*Posts/i)?.[1]);
      const bioMatch = description.match(/Posts?\s*[-–—]\s*(.+)/i);
      if (bioMatch) profile.bio = bioMatch[1].replace(/["']/g, '').trim();
    }
  } catch { /* use base fallback */ }

  // Try Apify for post grid (optional)
  const apifyPosts = await scrapePostsViaApify(handle);
  profile.posts = apifyPosts;

  return profile;
}

async function scrapePostsViaApify(handle: string): Promise<SocialResultsPost[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apiKey}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${handle}/`],
          resultsType: 'posts',
          resultsLimit: 9,
        }),
        signal: AbortSignal.timeout(65000),
      }
    );

    if (!res.ok) return [];
    const items = await res.json() as Array<{
      displayUrl?: string;
      shortCode?: string;
      type?: string;
      caption?: string;
    }>;

    return (items ?? []).slice(0, 9).map((item, i) => ({
      id: item.shortCode ?? `post-${i}`,
      image_url: item.displayUrl ?? '',
      is_generated: false,
      type: (item.type === 'Video' ? 'reel' : 'photo') as SocialResultsPost['type'],
      caption: item.caption ?? null,
    })).filter(p => p.image_url);
  } catch {
    return [];
  }
}

// ─── AI generation helpers ────────────────────────────────────────────────────

async function generateRevisedBio(
  profile: SocialResultsProfile,
  months: number,
  brandName: string,
  userId?: string,
  userEmail?: string,
): Promise<string> {
  try {
    const result = await createCompletion({
      messages: [
        {
          role: 'user',
          content: `You are a social media strategist at ${brandName}, a video marketing agency. A prospect has this Instagram bio: "${profile.bio}" — Account: @${profile.handle} with ${profile.followers.toLocaleString()} followers. Write a concise, compelling new Instagram bio (max 150 characters) reflecting what their brand will look like after ${months} months of working with ${brandName}. Make it punchy, authentic, include relevant emojis. Return ONLY the bio text.`,
        },
      ],
      maxTokens: 200,
      timeoutMs: 30000,
      feature: 'social_results_bio_generation',
      modelPreference: [DEFAULT_OPENROUTER_MODEL],
      userId,
      userEmail,
    });
    return result.text.trim() || profile.bio;
  } catch {
    return profile.bio;
  }
}

function projectFollowers(current: number, months: number): number {
  if (current === 0) return 0;
  let monthlyGrowthRate: number;
  if (current < 5_000) monthlyGrowthRate = 0.20;
  else if (current < 20_000) monthlyGrowthRate = 0.15;
  else if (current < 100_000) monthlyGrowthRate = 0.10;
  else monthlyGrowthRate = 0.07;
  return Math.round(current * Math.pow(1 + monthlyGrowthRate, months));
}

async function generatePostImages(
  profile: SocialResultsProfile,
  presentationId: string,
  count: number
): Promise<SocialResultsPost[]> {
  const brand = profile.display_name || profile.handle;
  const imageTypes: Array<{ type: SocialResultsPost['type']; prompt: string; aspectRatio: string }> = [
    { type: 'photo', aspectRatio: '1:1', prompt: `Professional product photography for ${brand} Instagram post. Clean background, dramatic lighting, commercial photography aesthetic. Square format.` },
    { type: 'photo', aspectRatio: '1:1', prompt: `Lifestyle UGC-style photo for ${brand}. Person using their product, authentic feel, natural lighting. Instagram native. Square.` },
    { type: 'reel', aspectRatio: '4:5', prompt: `Eye-catching Instagram Reels thumbnail for ${brand}. Bold text overlay, vibrant colors, high contrast. Portrait.` },
    { type: 'photo', aspectRatio: '1:1', prompt: `Branded graphic for ${brand}. Minimalist design, strong visual hierarchy, Instagram carousel style. Square.` },
    { type: 'photo', aspectRatio: '1:1', prompt: `Behind-the-scenes content for ${brand}. Authentic workspace setting, good natural lighting. Square.` },
    { type: 'reel', aspectRatio: '4:5', prompt: `Before/after transformation post for ${brand}. Split screen or reveal style, compelling visual contrast. Portrait.` },
  ];

  const adminClient = createAdminClient();
  const results: SocialResultsPost[] = [];

  for (let i = 0; i < Math.min(count, imageTypes.length); i++) {
    try {
      const { type, prompt, aspectRatio } = imageTypes[i];
      const imageBuffer = await generateAdImage({ prompt, aspectRatio });

      const filename = `social-results/${presentationId}-${Date.now()}-${i}.png`;
      const { error: uploadError } = await adminClient.storage
        .from('ad-creatives')
        .upload(filename, imageBuffer, { contentType: 'image/png', upsert: false });

      if (uploadError) {
        console.error(`[social-results] upload error for image ${i}:`, uploadError);
        continue;
      }

      const { data: { publicUrl } } = adminClient.storage
        .from('ad-creatives')
        .getPublicUrl(filename);

      results.push({
        id: `gen-${Date.now()}-${i}`,
        image_url: publicUrl,
        is_generated: true,
        type,
        caption: null,
      });
    } catch (err) {
      console.error(`[social-results] failed to generate image ${i}:`, err);
    }
  }

  return results;
}

function generateDefaultHighlights(): SocialResultsHighlight[] {
  return ['New In', 'BTS', 'Tips', 'FAQ', 'Reviews'].map((title, i) => ({
    id: `highlight-${i}`,
    title,
    cover_image_url: null,
    is_generated: false,
  }));
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { resolveBrandAvatar, type AvatarSource } from '@/lib/scrapers/social-avatar';
import { extractSocialsFromHtml } from '@/lib/scrapers/social-handles';

const analyzeSchema = z.object({
  url: z.string().url('A valid URL is required'),
});

/**
 * POST /api/clients/analyze-url
 *
 * Analyze a website URL to auto-populate client onboarding fields. Fetches the website HTML,
 * extracts a logo (apple-touch-icon, OG image, Twitter card image, Clearbit, or Google favicon),
 * strips the HTML to plain text, and uses Claude AI to infer industry, target audience,
 * brand voice, and topic keywords.
 *
 * @auth Required (admin)
 * @body url - Valid website URL to analyze (required)
 * @returns {{ industry: string, target_audience: string, brand_voice: string, topic_keywords: string[], logo_url: string | null }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can analyze URLs
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
    const parsed = analyzeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    // Fetch website HTML with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let html: string;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NativzBot/1.0)',
        },
      });
      html = await res.text();
    } catch {
      return NextResponse.json(
        { error: 'Could not fetch website. Check the URL and try again.' },
        { status: 422 }
      );
    } finally {
      clearTimeout(timeout);
    }

    // NAT-57 follow-up: extract social handles from the website HTML so
    // onboarding can pre-fill the social-profile slots. Admin confirms
    // or marks "no account" in the onboarding UI.
    const allSocials = extractSocialsFromHtml(html);
    const socials = {
      instagram: allSocials.instagram,
      tiktok: allSocials.tiktok,
      facebook: allSocials.facebook,
      youtube: allSocials.youtube,
    };

    // PRD A: walk Instagram -> Facebook -> YouTube -> TikTok -> LinkedIn -> favicon
    // for the actual brand mark. No Google globe, no Clearbit guess.
    const resolved = await resolveBrandAvatar({
      website: url,
      socials: allSocials,
    });
    const logoUrl: string | null = resolved.url;
    const logoSource: AvatarSource | null = resolved.source;

    // Strip HTML to plain text (first ~5000 chars)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract enough content from that URL. Try a different page.' },
        { status: 422 }
      );
    }

    // Send to Claude for analysis
    const prompt = `Analyze this website content and extract business information. Respond ONLY in valid JSON.

Website URL: ${url}
Website content:
${text}

Return this exact JSON schema:
{
  "industry": "The business industry/category (e.g., 'Healthy Food & Beverage', 'Fitness & Wellness')",
  "target_audience": "A 1-2 sentence description of the likely target audience",
  "brand_voice": "A brief description of the brand's tone and voice (e.g., 'Friendly, energetic, health-forward')",
  "topic_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tagline": "A short brand tagline / hook (5-10 words). Pull from the page if present, otherwise infer.",
  "value_proposition": "One sentence describing what the brand offers and to whom.",
  "mission_statement": "1-2 sentences on the brand's mission or 'why'. Infer if not stated.",
  "description": "A 2-3 sentence brand voice description — how they sound, what words they use, what tone shows up. Read like a paragraph an admin would write in a brand profile.",
  "writing_style": "1-2 sentences describing how copy should be written for this brand (sentence length, formality, punctuation habits, emoji usage, vocabulary, signature phrases).",
  "content_language": "ISO 639-1 language code the website is primarily written in (e.g. 'en', 'es', 'fr')."
}

Guidelines:
- industry should be specific but concise (2-5 words)
- target_audience should describe demographics, interests, and psychographics
- brand_voice should capture the tone in 3-5 descriptive words
- topic_keywords should be 3-7 core topics the brand would want to create content about
- tagline / value_proposition / mission_statement / description / writing_style are for the Brand Profile — write them in the brand's own register, not generic marketing-speak
- content_language must be a 2-letter ISO code, lowercase`;

    const aiResult = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      feature: 'client_analyze_url',
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const result = parseAIResponseJSON<{
      industry: string;
      target_audience: string;
      brand_voice: string;
      topic_keywords: string[];
      tagline?: string;
      value_proposition?: string;
      mission_statement?: string;
      description?: string;
      writing_style?: string;
      content_language?: string;
    }>(aiResult.text);

    return NextResponse.json({ ...result, logo_url: logoUrl, logo_source: logoSource, socials });
  } catch (error) {
    console.error('POST /api/clients/analyze-url error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

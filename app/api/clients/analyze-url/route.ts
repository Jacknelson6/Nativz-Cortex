import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';

const analyzeSchema = z.object({
  url: z.string().url('A valid URL is required'),
});

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

    // Try to extract a real logo from the HTML
    let logoUrl: string | null = null;
    try {
      const baseUrl = new URL(url);

      // Priority list of logo sources
      const patterns: Array<{ regex: RegExp; group: number }> = [
        // Open Graph image (usually a good brand image)
        { regex: /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i, group: 1 },
        { regex: /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i, group: 1 },
        // Apple touch icon (high-res square logo)
        { regex: /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i, group: 1 },
        // Shortcut icon / favicon (last resort from HTML)
        { regex: /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i, group: 1 },
      ];

      for (const { regex, group } of patterns) {
        const match = html.match(regex);
        if (match?.[group]) {
          let found = match[group];
          // Make relative URLs absolute
          if (found.startsWith('//')) {
            found = `${baseUrl.protocol}${found}`;
          } else if (found.startsWith('/')) {
            found = `${baseUrl.origin}${found}`;
          } else if (!found.startsWith('http')) {
            found = `${baseUrl.origin}/${found}`;
          }
          logoUrl = found;
          break;
        }
      }

      // Fallback to Google's favicon service
      if (!logoUrl) {
        logoUrl = `https://www.google.com/s2/favicons?domain=${baseUrl.hostname}&sz=128`;
      }
    } catch { /* ignore */ }

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
  "topic_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Guidelines:
- industry should be specific but concise (2-5 words)
- target_audience should describe demographics, interests, and psychographics
- brand_voice should capture the tone in 3-5 descriptive words
- topic_keywords should be 3-7 core topics the brand would want to create content about`;

    const aiResult = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
    });

    const result = parseAIResponseJSON<{
      industry: string;
      target_audience: string;
      brand_voice: string;
      topic_keywords: string[];
    }>(aiResult.text);

    return NextResponse.json({ ...result, logo_url: logoUrl });
  } catch (error) {
    console.error('POST /api/clients/analyze-url error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

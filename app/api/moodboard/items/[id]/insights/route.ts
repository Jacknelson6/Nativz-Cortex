import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import * as cheerio from 'cheerio';
import type { PageInsights } from '@/lib/types/moodboard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Set processing
    await adminClient
      .from('moodboard_items')
      .update({ status: 'processing' })
      .eq('id', id);

    try {
      // Fetch the webpage
      const pageRes = await fetch(item.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!pageRes.ok) {
        throw new Error(`Failed to fetch page: ${pageRes.status}`);
      }

      const html = await pageRes.text();

      // Parse with Cheerio
      const $ = cheerio.load(html);

      // Extract title
      const pageTitle = $('title').text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        '';

      // Extract description
      const pageDescription = $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') || '';

      // Extract OG image for screenshot
      const ogImage = $('meta[property="og:image"]').attr('content') || '';

      // Extract readable text content
      $('script, style, nav, footer, header, iframe, noscript').remove();
      const bodyText = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 8000); // Limit to avoid token overflow

      // AI analysis
      const aiResponse = await createCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are a marketing strategist. Analyze webpage content and return only valid JSON.',
          },
          {
            role: 'user',
            content: `Analyze this webpage and extract insights:

URL: ${item.url}
Title: ${pageTitle}
Description: ${pageDescription}

Page content:
${bodyText}

Return a JSON object with:
{
  "summary": "2-3 sentence summary of what this page/site is about",
  "key_headlines": ["list of the most important headlines/copy on the page"],
  "value_propositions": ["list of key value props identified"],
  "design_notes": "Brief description of the design style, layout, and aesthetic approach",
  "notable_insights": ["3-5 actionable insights the content team could apply"],
  "content_themes": ["3-5 thematic tags"]
}

Return ONLY the JSON.`,
          },
        ],
        maxTokens: 1500,
      });

      const insights = parseAIResponseJSON<PageInsights>(aiResponse.text);

      // Update item
      const { data: updated, error: updateError } = await adminClient
        .from('moodboard_items')
        .update({
          status: 'completed',
          title: pageTitle || item.title,
          thumbnail_url: ogImage || item.thumbnail_url,
          screenshot_url: ogImage || item.screenshot_url,
          page_insights: insights,
          content_themes: insights.content_themes ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update board timestamp
      await adminClient
        .from('moodboard_boards')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', item.board_id);

      return NextResponse.json(updated);
    } catch (processingError) {
      await adminClient
        .from('moodboard_items')
        .update({ status: 'failed' })
        .eq('id', id);

      console.error('Insights extraction error:', processingError);
      return NextResponse.json(
        { error: 'Failed to extract insights', details: processingError instanceof Error ? processingError.message : 'Unknown error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('POST /api/moodboard/items/[id]/insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

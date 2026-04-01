import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { chromium } from 'playwright-core';
import { buildAnalysisHtml } from '@/lib/pdf/analysis-html';
import { NATIVZ_LOGO_ON_LIGHT_PNG } from '@/lib/brand-logo';
import type { MoodboardItem } from '@/lib/types/moodboard';
import { createCompletion } from '@/lib/ai/client';

// ─── AI title generation ────────────────────────────────────────────────────────

async function generateTitle(item: MoodboardItem, userId?: string, userEmail?: string): Promise<string> {
  const context = [
    item.concept_summary,
    item.hook,
    (item.content_themes ?? []).join(', '),
    item.title,
  ].filter(Boolean).join(' | ');

  if (!context.trim()) return fallbackTitle(item);

  try {
    const result = await createCompletion({
      messages: [
        {
          role: 'user',
          content: `Generate a short, professional PDF export title (5-10 words max) for this video analysis. The title should describe the video's theme/topic, NOT be a caption or hashtags. Format: just the title text, no quotes or punctuation.\n\nVideo context: ${context}`,
        },
      ],
      maxTokens: 60,
      timeoutMs: 30000,
      feature: 'analysis_pdf_title',
      modelPreference: ['openrouter/hunter-alpha'],
      userId,
      userEmail,
    });
    const title = result.text.trim().replace(/^["']|["']$/g, '');
    return title && title.length > 3 ? title : fallbackTitle(item);
  } catch (err) {
    console.error('AI title generation error:', err);
    return fallbackTitle(item);
  }
}

function fallbackTitle(item: MoodboardItem): string {
  const themes = item.content_themes ?? [];
  if (themes.length > 0) {
    const theme = themes[0].replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    return `Video Analysis - ${theme}`;
  }
  if (item.concept_summary) {
    const words = item.concept_summary.split(' ').slice(0, 8).join(' ');
    return `Video Analysis - ${words}`;
  }
  return 'Video Analysis Export';
}

// ─── Route handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let browser;

  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: item, error: fetchError } = await admin
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fetch client name if available
    let clientName: string | null = null;
    if (item.client_id) {
      const { data: client } = await admin
        .from('clients')
        .select('name')
        .eq('id', item.client_id)
        .single();
      clientName = client?.name ?? null;
    }

    // Generate AI title
    const generatedTitle = await generateTitle(
      item as MoodboardItem,
      user.id,
      user.email ?? undefined,
    );

    // Build HTML
    const html = buildAnalysisHtml({
      item: item as MoodboardItem,
      clientName,
      generatedTitle,
      logoBase64: NATIVZ_LOGO_ON_LIGHT_PNG,
    });

    // Render to PDF with Playwright
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    const slugTitle = generatedTitle
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .replace(/-{2,}/g, '-')
      .substring(0, 50);
    const filename = `${slugTitle || 'video-analysis'}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('GET /api/analysis/items/[id]/analysis/pdf error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}

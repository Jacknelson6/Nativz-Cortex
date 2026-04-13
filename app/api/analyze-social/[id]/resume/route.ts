import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const maxDuration = 30;

const ResumeSchema = z.object({
  social_urls: z.record(z.string(), z.string()),
  competitor_urls: z.array(z.string().url()).max(3).optional(),
});

/**
 * POST /api/analyze-social/[id]/resume — Submit social URLs and resume processing
 * Used when the website scrape didn't find social profiles.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ResumeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'At least one social URL is required' }, { status: 400 });
    }

    const socialUrls = Object.fromEntries(
      Object.entries(parsed.data.social_urls).filter(([, v]) => v?.trim())
    );

    if (Object.keys(socialUrls).length === 0) {
      return NextResponse.json({ error: 'At least one social URL is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch existing analysis_data so we can merge rather than overwrite
    const { data: existing } = await adminClient
      .from('prospect_audits')
      .select('analysis_data')
      .eq('id', id)
      .single();

    const existingAnalysisData = (existing?.analysis_data as Record<string, unknown> | null) ?? {};
    const competitorUrlsOverride = parsed.data.competitor_urls?.filter(Boolean) ?? [];
    const analysisData: Record<string, unknown> = {
      ...existingAnalysisData,
      ...(competitorUrlsOverride.length > 0 ? { competitor_urls_override: competitorUrlsOverride } : {}),
    };

    // Update audit with the manual social URLs and reset to pending for reprocessing
    await adminClient
      .from('prospect_audits')
      .update({
        social_urls: socialUrls,
        tiktok_url: socialUrls.tiktok ?? '',
        analysis_data: analysisData,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({ status: 'pending' });
  } catch (error) {
    console.error('POST /api/analyze-social/[id]/resume error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

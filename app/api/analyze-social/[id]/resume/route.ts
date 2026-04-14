import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const maxDuration = 30;

// Accept either a fully-qualified URL or a bare domain (doughco.com, sapahouse.com).
// The process route calls normaliseWebsite() before scraping anyway, so either
// form lands correctly downstream. Enforcing z.string().url() here silently
// dropped entries from the Generate-competitors flow that store bare domains.
const domainOrUrl = z
  .string()
  .min(1)
  .transform((s) => s.trim())
  .refine((s) => /^(?:https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/.*)?$/i.test(s), {
    message: 'Must be a URL or domain',
  });

const ResumeSchema = z.object({
  social_urls: z.record(z.string(), z.string()),
  competitor_urls: z.array(domainOrUrl).max(3).optional(),
  social_goals: z.array(z.string()).max(10).optional(),
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
    const socialGoals = parsed.data.social_goals?.filter(Boolean) ?? [];

    // Always set the override field — if the user submitted competitors it
    // gets the new list, if they cleared them it becomes an empty array.
    // Previously the resume route only wrote the field when non-empty, so
    // removing competitors from a re-submitted audit didn't actually remove
    // them — process route kept reading the old override and re-scraping
    // stale URLs.
    const analysisData: Record<string, unknown> = {
      ...existingAnalysisData,
      competitor_urls_override: competitorUrlsOverride,
      ...(socialGoals.length > 0 ? { social_goals: socialGoals } : {}),
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

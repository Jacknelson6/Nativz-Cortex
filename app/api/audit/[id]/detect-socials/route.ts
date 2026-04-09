import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeWebsite } from '@/lib/audit/scrape-website';
import { extractWebsiteContext } from '@/lib/audit/analyze';

export const maxDuration = 30;

/**
 * POST /api/audit/[id]/detect-socials
 *
 * Phase 1: Scrape the website, extract social links + business context.
 * Returns detected platforms so the user can confirm/add before full processing.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: audit } = await adminClient
      .from('prospect_audits')
      .select('id, website_url, status')
      .eq('id', id)
      .single();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (!audit.website_url) {
      return NextResponse.json({ error: 'No website URL' }, { status: 400 });
    }

    // Scrape website
    const websiteResult = await scrapeWebsite(audit.website_url);
    const websiteContext = await extractWebsiteContext(websiteResult);

    // Save website context to the audit
    await adminClient
      .from('prospect_audits')
      .update({
        status: 'confirming_platforms',
        prospect_data: {
          websiteContext,
          platforms: [],
          detectedSocialLinks: websiteContext.socialLinks,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json({
      websiteContext,
      detectedPlatforms: websiteContext.socialLinks,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('POST /api/audit/[id]/detect-socials error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

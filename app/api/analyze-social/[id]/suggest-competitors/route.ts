import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suggestCompetitorWebsites } from '@/lib/audit/discover-competitors';

export const maxDuration = 30;

/**
 * POST /api/analyze-social/[id]/suggest-competitors
 *
 * Runs the LLM competitor-discovery step (website + industry → ranked list)
 * without scraping. The confirm-platforms UI uses this to pre-fill the
 * user-editable competitor inputs.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: audit } = await admin
    .from('prospect_audits')
    .select('id, prospect_data')
    .eq('id', id)
    .single();

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const websiteContext = (audit.prospect_data as any)?.websiteContext;
  if (!websiteContext) {
    return NextResponse.json({ error: 'websiteContext not available — run detect-socials first' }, { status: 400 });
  }

  try {
    // Pass empty signals — we don't have platform scrapes yet at this stage.
    const candidates = await suggestCompetitorWebsites(websiteContext, []);
    return NextResponse.json({ candidates: candidates.slice(0, 3) });
  } catch (err) {
    console.warn('[analyze-social] suggest-competitors failed:', err);
    return NextResponse.json({ candidates: [] });
  }
}

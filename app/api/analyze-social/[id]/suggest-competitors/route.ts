import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suggestCompetitorWebsites } from '@/lib/audit/discover-competitors';
import { logApiError } from '@/lib/api/error-log';

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
    .select('id, prospect_data, analysis_data')
    .eq('id', id)
    .single();

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const websiteContext = (audit.prospect_data as any)?.websiteContext;
  if (!websiteContext) {
    return NextResponse.json({ error: 'websiteContext not available — run detect-socials first' }, { status: 400 });
  }

  // If we already cached suggestions for this audit, return them — avoids
  // re-running the LLM every time the user revisits the confirm screen.
  const existingAnalysisData = (audit.analysis_data as Record<string, unknown> | null) ?? {};
  const cached = existingAnalysisData.suggested_competitors as { name: string; website: string; why: string }[] | undefined;
  if (cached && cached.length > 0) {
    return NextResponse.json({ candidates: cached.slice(0, 3), cached: true });
  }

  try {
    const candidates = await suggestCompetitorWebsites(websiteContext, []);
    const top3 = candidates.slice(0, 3);

    // Persist for revisits — no migration needed (analysis_data is JSONB).
    await admin
      .from('prospect_audits')
      .update({
        analysis_data: { ...existingAnalysisData, suggested_competitors: top3 },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // If every tier returned empty, log the scope + industry snapshot so we
    // can tell whether the LLM is failing or the scope extractor is misclassifying.
    if (top3.length === 0) {
      await logApiError({
        route: '/api/analyze-social/[id]/suggest-competitors',
        statusCode: 200,
        errorMessage: 'No competitor candidates returned after all fallback tiers',
        userId: user.id,
        userEmail: user.email,
        meta: {
          audit_id: id,
          scope: (websiteContext as { scope?: string })?.scope ?? null,
          location: (websiteContext as { location?: string })?.location ?? null,
          industry: (websiteContext as { industry?: string })?.industry ?? null,
          title: (websiteContext as { title?: string })?.title ?? null,
        },
      });
    }

    return NextResponse.json({ candidates: top3 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[analyze-social] suggest-competitors failed:', err);
    await logApiError({
      route: '/api/analyze-social/[id]/suggest-competitors',
      statusCode: 500,
      errorMessage: message,
      errorDetail: err instanceof Error ? err.stack ?? undefined : undefined,
      userId: user.id,
      userEmail: user.email,
      meta: { audit_id: id },
    });
    return NextResponse.json({ candidates: [] });
  }
}

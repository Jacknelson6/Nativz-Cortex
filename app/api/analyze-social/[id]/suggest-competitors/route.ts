import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suggestCompetitorWebsites, filterReachableCandidates } from '@/lib/audit/discover-competitors';
import { logApiError } from '@/lib/api/error-log';

export const maxDuration = 30;

type ScopeChoice = 'national' | 'local';

/**
 * POST /api/analyze-social/[id]/suggest-competitors
 *
 * Runs the LLM competitor-discovery step (website + industry → ranked list)
 * without scraping. The confirm-platforms UI uses this to pre-fill the
 * user-editable competitor inputs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse optional { scope: 'national' | 'local' } body. When the user
  // clicks "Generate competitors" with a scope toggle, we regenerate
  // fresh instead of returning cached. When no scope is provided we
  // return cached on revisit so the confirm screen doesn't re-burn
  // LLM tokens each mount.
  let bodyScope: ScopeChoice | null = null;
  try {
    const body = await request.json().catch(() => null) as { scope?: string } | null;
    if (body?.scope === 'national' || body?.scope === 'local') bodyScope = body.scope;
  } catch {
    /* empty body is fine */
  }

  const admin = createAdminClient();
  const { data: audit } = await admin
    .from('prospect_audits')
    .select('id, prospect_data, analysis_data')
    .eq('id', id)
    .single();

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const websiteContext = (audit.prospect_data as { websiteContext?: unknown })?.websiteContext as
    | { scope?: string; location?: string; industry?: string; title?: string; description?: string; keywords?: string[] }
    | undefined;
  if (!websiteContext) {
    return NextResponse.json({ error: 'websiteContext not available — run detect-socials first' }, { status: 400 });
  }

  const existingAnalysisData = (audit.analysis_data as Record<string, unknown> | null) ?? {};
  // Only return cache when the caller didn't explicitly request a regenerate.
  if (!bodyScope) {
    const cached = existingAnalysisData.suggested_competitors as
      | { name: string; website: string; why: string }[]
      | undefined;
    if (cached && cached.length > 0) {
      return NextResponse.json({ candidates: cached, cached: true });
    }
  }

  try {
    const llmCandidates = await suggestCompetitorWebsites(
      websiteContext as Parameters<typeof suggestCompetitorWebsites>[0],
      [],
      { scopeOverride: bodyScope ?? undefined },
    );

    // Drop hallucinated domains (e.g. sapahouse.com) before showing to the
    // user. Keep up to 6 real candidates so they can pick 3.
    const reachable = await filterReachableCandidates(llmCandidates, 3500);
    const finalCandidates = reachable.slice(0, 6);

    await admin
      .from('prospect_audits')
      .update({
        analysis_data: { ...existingAnalysisData, suggested_competitors: finalCandidates },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Every tier + reachability filter returning empty = signal worth logging.
    if (finalCandidates.length === 0) {
      await logApiError({
        route: '/api/analyze-social/[id]/suggest-competitors',
        statusCode: 200,
        errorMessage: 'No reachable competitor candidates after all fallback tiers',
        userId: user.id,
        userEmail: user.email,
        meta: {
          audit_id: id,
          scope_requested: bodyScope,
          scope_inferred: websiteContext.scope ?? null,
          location: websiteContext.location ?? null,
          industry: websiteContext.industry ?? null,
          title: websiteContext.title ?? null,
          llm_returned: llmCandidates.length,
          reachable_count: reachable.length,
        },
      });
    }

    return NextResponse.json({ candidates: finalCandidates, scope: bodyScope ?? websiteContext.scope ?? 'national' });
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
      meta: { audit_id: id, scope_requested: bodyScope },
    });
    return NextResponse.json({ candidates: [] });
  }
}

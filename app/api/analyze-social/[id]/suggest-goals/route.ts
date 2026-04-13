import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suggestSocialGoals } from '@/lib/audit/analyze';

export const maxDuration = 30;

/**
 * POST /api/analyze-social/[id]/suggest-goals
 *
 * Runs the LLM social-goals seeding step (website context → 3-4 goal lines)
 * without blocking the main pipeline. The confirm-platforms UI uses this to
 * pre-fill the editable goals textarea.
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
    const goals = await suggestSocialGoals(websiteContext);
    return NextResponse.json({ goals });
  } catch (err) {
    console.warn('[analyze-social] suggest-goals failed:', err);
    return NextResponse.json({ goals: [] });
  }
}

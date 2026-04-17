import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

/**
 * GET /api/analyze-social/[id] — Get audit details and results
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: audit, error } = await adminClient
      .from('prospect_audits')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Stale-audit self-heal: if an audit has been stuck in `processing` for
    // longer than the Vercel function hard limit + a safety margin, the
    // processing function was almost certainly terminated by the platform
    // mid-flight (maxDuration=300s). The catch-block that would flip the
    // row to `failed` never ran, so the row sits in `processing` forever
    // and the frontend polls indefinitely. Auto-fail it so the UI can
    // recover and the user sees a retry button instead of a spinning page.
    const STALE_PROCESSING_MS = 7 * 60 * 1000; // 7 min
    if (audit.status === 'processing' && audit.updated_at) {
      const ageMs = Date.now() - new Date(audit.updated_at).getTime();
      if (ageMs > STALE_PROCESSING_MS) {
        const errMsg =
          'Audit timed out — the processing job exceeded the platform time limit. This usually means competitor discovery or a scrape got stuck. Retry to try again.';
        await adminClient
          .from('prospect_audits')
          .update({
            status: 'failed',
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        audit.status = 'failed';
        audit.error_message = errMsg;
        console.warn(`[audit:${id}] auto-failed stale processing audit (${Math.round(ageMs / 1000)}s old)`);
      }
    }

    return NextResponse.json({ audit });
  } catch (error) {
    console.error('GET /api/analyze-social/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

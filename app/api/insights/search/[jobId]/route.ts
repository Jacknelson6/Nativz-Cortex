import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_ROLES = ['admin', 'super_admin'];
const STALE_PROCESSING_MS = 10 * 60 * 1000;

/**
 * GET /api/insights/search/[jobId]
 *
 * Returns the current state of a TikTok Shop category search:
 * status, progress counters, results (if completed). Also auto-fails
 * runs that have been stuck in `running`/`queued` past the platform
 * timeout — same pattern as prospect_audits.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: search, error } = await admin
      .from('tiktok_shop_searches')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    // Stale auto-fail: background task was terminated by the platform
    // before it could flip to completed/failed.
    if ((search.status === 'running' || search.status === 'queued') && search.updated_at) {
      const ageMs = Date.now() - new Date(search.updated_at).getTime();
      if (ageMs > STALE_PROCESSING_MS) {
        const errMsg =
          'Search timed out — the background job exceeded the platform time limit. Re-run to try again.';
        await admin
          .from('tiktok_shop_searches')
          .update({
            status: 'failed',
            error_message: errMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        search.status = 'failed';
        search.error_message = errMsg;
      }
    }

    return NextResponse.json({ search });
  } catch (error) {
    console.error('GET /api/insights/search/[jobId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/insights/search/[jobId] — admin-only, remove a search row.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!userData || !ADMIN_ROLES.includes(userData.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await admin.from('tiktok_shop_searches').delete().eq('id', jobId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/insights/search/[jobId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

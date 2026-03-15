import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';

/**
 * DELETE /api/social/disconnect/[profileId]
 *
 * Deactivate a connected social profile (soft delete). Clears access tokens and marks
 * is_active false. Also attempts to disconnect from Late API if the profile has a
 * late_account_id (non-fatal on failure).
 *
 * @auth Required (any authenticated user)
 * @param profileId - Social profile UUID to disconnect
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const { profileId } = await params;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Fetch the profile to check for late_account_id
    const { data: profile } = await admin
      .from('social_profiles')
      .select('late_account_id')
      .eq('id', profileId)
      .single();

    // Disconnect from Late if connected
    if (profile?.late_account_id) {
      try {
        const service = getPostingService();
        await service.disconnectProfile(profile.late_account_id);
      } catch (lateErr) {
        console.error('[social/disconnect] Late disconnect failed:', lateErr);
      }
    }

    const { error } = await admin
      .from('social_profiles')
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        page_access_token: null,
        late_account_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);

    if (error) {
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[social/disconnect] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

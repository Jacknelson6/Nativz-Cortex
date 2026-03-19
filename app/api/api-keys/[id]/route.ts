import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';

/**
 * DELETE /api/api-keys/[id]
 *
 * Revoke or permanently delete an API key. Only the key's owner can perform this action.
 * By default, sets is_active=false (revoke). Pass permanent=true to hard-delete the record.
 *
 * @auth Required (key owner only)
 * @param id - API key UUID
 * @query permanent - If 'true', permanently delete the record; otherwise just revoke (default: false)
 * @returns {{ revoked: true } | { deleted: true }}
 */
export async function DELETE(
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

    const admin = createAdminClient();
    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';

    // Only allow owner to revoke/delete
    const { data: key } = await admin
      .from('api_keys')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (key.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (permanent) {
      const { error } = await admin.from('api_keys').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
      }

      // Audit log: API key permanently deleted
      logActivity(user.id, 'api_key_deleted', 'api_key', id, {
        permanent: true,
      }).catch(() => {});

      return NextResponse.json({ deleted: true });
    }

    const { error } = await admin
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }

    // Audit log: API key revoked
    logActivity(user.id, 'api_key_revoked', 'api_key', id, {
      permanent: false,
    }).catch(() => {});

    return NextResponse.json({ revoked: true });
  } catch (error) {
    console.error('DELETE /api/api-keys/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

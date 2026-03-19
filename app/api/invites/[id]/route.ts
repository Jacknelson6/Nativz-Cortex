/**
 * DELETE /api/invites/[id]
 *
 * Revoke (delete) an unused invite token.
 *
 * @auth Required (admin)
 * @param id - Invite token UUID
 * @returns {{ success: true }}
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check invite exists and hasn't been used
    const { data: invite } = await adminClient
      .from('invite_tokens')
      .select('id, used_at')
      .eq('id', id)
      .single();

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.used_at) {
      return NextResponse.json({ error: 'Cannot revoke a used invite' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('invite_tokens')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to revoke invite:', error);
      return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/invites/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

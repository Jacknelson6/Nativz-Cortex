/**
 * DELETE /api/admin/nerd-conversations/[id]/format-pin
 *
 * VFF-10 T14: Removes the viral-format pin from a Nerd conversation.
 * The strategist hits this from the Content Lab right rail when they
 * decide the pinned format isn't the right anchor anymore. We null out
 * the column rather than delete the conversation — chat history stays.
 *
 * @auth admin / super_admin only.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (me as { role: string | null } | null)?.role ?? null;
  if (role !== 'admin' && role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin
    .from('nerd_conversations')
    .update({ format_video_id: null })
    .eq('id', id);
  if (error) {
    return NextResponse.json(
      { error: 'Failed to clear format pin', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

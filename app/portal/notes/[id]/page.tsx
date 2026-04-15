import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortalNoteBoard } from '@/components/portal/portal-note-board';

export const dynamic = 'force-dynamic';

/**
 * /portal/notes/[id] — opens a client-scope notes board for a viewer. The
 * board must be scope='client' and its client_id must be in the viewer's
 * user_client_access list, otherwise we 404 (no leak of board existence
 * across organizations).
 *
 * Admins can also open any board from here, which mirrors how the admin
 * sidebar rewrites /admin/notes → /portal/notes during impersonation.
 */
export default async function PortalNotesBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    userRow?.is_super_admin === true ||
    userRow?.role === 'admin' ||
    userRow?.role === 'super_admin';
  const isViewer = userRow?.role === 'viewer';

  const { data: board } = await admin
    .from('moodboard_boards')
    .select('id, name, user_id, is_personal, scope, client_id')
    .eq('id', id)
    .maybeSingle();

  if (!board) notFound();

  let canSee = isAdmin || (board.is_personal === true && board.user_id === user.id);

  if (!canSee && isViewer && board.scope === 'client' && board.client_id) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', board.client_id as string)
      .maybeSingle();
    canSee = Boolean(access);
  }

  if (!canSee) notFound();

  return <PortalNoteBoard boardId={board.id} initialBoardName={board.name ?? 'Untitled note'} />;
}

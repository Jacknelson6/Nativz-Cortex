import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PersonalMoodboard } from '@/components/notes/personal-moodboard';

export const dynamic = 'force-dynamic';

/**
 * /notes/[id] — opens a specific Notes board in the full canvas.
 * Access is enforced by requireBoardAccess inside API calls; this page
 * only renders the shell if the caller can see the board at all.
 */
export default async function NotesBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: userRow }, { data: board }] = await Promise.all([
    admin.from('users').select('role, is_super_admin').eq('id', user.id).single(),
    admin
      .from('moodboard_boards')
      .select('id, name, user_id, is_personal, scope, client_id')
      .eq('id', id)
      .maybeSingle(),
  ]);
  const isAdmin =
    userRow?.is_super_admin === true ||
    userRow?.role === 'admin' ||
    userRow?.role === 'super_admin';
  const isViewer = userRow?.role === 'viewer';

  if (!board) notFound();

  // Phase 2 regression fix: viewers must still be able to open brand-scoped
  // boards their org owns (this used to live in /portal/notes/[id]). Admins
  // see everything; personal-board owners see their own; viewers see their
  // org's boards via user_client_access.
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

  return <PersonalMoodboard boardId={board.id} boardName={board.name ?? 'Untitled board'} />;
}

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PersonalMoodboard } from '@/components/notes/personal-moodboard';

export const dynamic = 'force-dynamic';

/**
 * /admin/notes/[id] — opens a specific Notes board in the full canvas.
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
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
  const isAdmin = userRow?.role === 'admin';

  const { data: board } = await admin
    .from('moodboard_boards')
    .select('id, name, user_id, is_personal, scope')
    .eq('id', id)
    .maybeSingle();

  if (!board) notFound();

  const canSee =
    isAdmin || (board.is_personal === true && board.user_id === user.id);
  if (!canSee) notFound();

  return <PersonalMoodboard boardId={board.id} boardName={board.name ?? 'Untitled board'} />;
}

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreatePersonalBoard } from '@/lib/moodboard/get-or-create-personal-board';
import { PersonalMoodboard } from '@/components/notes/personal-moodboard';

export const dynamic = 'force-dynamic';

/**
 * /admin/notes — personal moodboard for the signed-in user.
 *
 * Auto-creates the user's personal board on first visit. The page is thin
 * by design — it resolves the board id server-side, then mounts the existing
 * MoodboardCanvas client component with variant='analysis'. All the paste-URL
 * / transcript / hook-analysis / frame-extraction plumbing already lives in
 * the shared canvas + API routes; this page just gives each user their own
 * board to land on.
 */
export default async function NotesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const adminClient = createAdminClient();
  const board = await getOrCreatePersonalBoard(user.id, adminClient);

  return <PersonalMoodboard boardId={board.id} boardName={board.name} />;
}

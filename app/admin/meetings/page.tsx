import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MeetingNotesView } from '@/components/meetings/meeting-notes-view';

export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Fetch all meeting notes across clients
  const { data: notes } = await admin
    .from('client_knowledge_entries')
    .select('id, client_id, title, content, metadata, source, created_at, updated_at')
    .eq('type', 'meeting_note')
    .order('created_at', { ascending: false })
    .limit(100);

  // Fetch clients for the selector
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug, logo_url')
    .eq('is_active', true)
    .order('name');

  return (
    <MeetingNotesView
      initialNotes={notes ?? []}
      clients={clients ?? []}
    />
  );
}

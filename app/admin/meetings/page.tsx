import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MeetingNotesView } from '@/components/meetings/meeting-notes-view';

export default async function MeetingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: notes }, { data: clients }, { data: prospectRow }] = await Promise.all([
    admin
      .from('client_knowledge_entries')
      .select('id, client_id, title, content, metadata, source, created_at, updated_at')
      .eq('type', 'meeting_note')
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('clients')
      .select('id, name, slug, logo_url')
      .eq('is_active', true)
      .order('name'),
    admin
      .from('clients')
      .select('id')
      .eq('slug', 'fyxer-prospects')
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  // All data is pre-awaited above, so Suspense never fires here — removing
  // it eliminates a dead wrapper that could paint a second skeleton.
  return (
    <MeetingNotesView
      initialNotes={notes ?? []}
      clients={clients ?? []}
      prospectBucketClientId={prospectRow?.id ?? null}
    />
  );
}

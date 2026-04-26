import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingEditor } from '@/components/onboarding/onboarding-editor';

export const dynamic = 'force-dynamic';

/**
 * /admin/onboarding/tracker/[id] — admin editor for a single onboarding
 * tracker (one segment of a flow). Loads tracker + phases + groups +
 * items + uploads and hands them to the client editor.
 */
export default async function OnboardingTrackerEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createAdminClient();

  const [{ data: me }, trackerRes, phasesRes, groupsRes] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, share_token, notify_emails, started_at, completed_at, created_at, updated_at, clients!inner(name, slug, logo_url)')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('onboarding_phases')
      .select('id, tracker_id, name, description, what_we_need, status, sort_order, actions, progress_percent')
      .eq('tracker_id', id)
      .order('sort_order', { ascending: true }),
    admin
      .from('onboarding_checklist_groups')
      .select('id, tracker_id, name, sort_order')
      .eq('tracker_id', id)
      .order('sort_order', { ascending: true }),
  ]);

  if (me?.role !== 'admin') notFound();
  if (!trackerRes.data) notFound();

  const rawTracker = trackerRes.data as unknown as Record<string, unknown> & {
    clients: { name: string; slug: string; logo_url: string | null } | Array<{ name: string; slug: string; logo_url: string | null }>;
  };
  const initialTracker = {
    ...rawTracker,
    clients: Array.isArray(rawTracker.clients) ? rawTracker.clients[0] ?? null : rawTracker.clients,
  } as Parameters<typeof OnboardingEditor>[0]['initialTracker'];

  const groupIds = (groupsRes.data ?? []).map((g) => g.id);
  const [itemsRes, availableTemplatesRes, uploadsRes] = await Promise.all([
    groupIds.length
      ? admin
          .from('onboarding_checklist_items')
          .select('id, group_id, task, description, owner, status, sort_order, kind')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    initialTracker.is_template
      ? Promise.resolve({ data: [] as unknown[] })
      : admin
          .from('onboarding_trackers')
          .select('id, service, template_name')
          .eq('is_template', true)
          .eq('service', initialTracker.service)
          .order('created_at', { ascending: false }),
    initialTracker.is_template
      ? Promise.resolve({ data: [] as unknown[] })
      : admin
          .from('onboarding_uploads')
          .select('id, filename, mime_type, size_bytes, note, uploaded_by, created_at')
          .eq('tracker_id', id)
          .order('created_at', { ascending: false }),
  ]);

  // Once we have items, look up any team scheduling events back-linked to
  // them so the editor can render "picker live" vs "set up availability"
  // affordances on schedule_meeting items. Templates never have events.
  const itemIds = ((itemsRes.data ?? []) as Array<{ id: string }>).map((it) => it.id);
  const schedulingEventsRes = !initialTracker.is_template && itemIds.length
    ? await admin
        .from('team_scheduling_events')
        .select('id, item_id, share_token, status')
        .in('item_id', itemIds)
    : { data: [] as unknown[] };

  return (
    <OnboardingEditor
      initialTracker={initialTracker}
      initialPhases={phasesRes.data ?? []}
      initialGroups={groupsRes.data ?? []}
      initialItems={(itemsRes.data as Parameters<typeof OnboardingEditor>[0]['initialItems']) ?? []}
      availableTemplates={(availableTemplatesRes.data as Parameters<typeof OnboardingEditor>[0]['availableTemplates']) ?? []}
      initialUploads={(uploadsRes.data as Parameters<typeof OnboardingEditor>[0]['initialUploads']) ?? []}
      initialSchedulingEvents={(schedulingEventsRes.data as Parameters<typeof OnboardingEditor>[0]['initialSchedulingEvents']) ?? []}
    />
  );
}

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingEditor } from '@/components/onboarding/onboarding-editor';

export const dynamic = 'force-dynamic';

/**
 * /admin/onboarding/[id] — admin editor for a single tracker. Loads
 * tracker + phases + groups + items and hands the whole payload to the
 * client editor, which owns all mutations via the /api/onboarding/*
 * endpoints.
 */
export default async function OnboardingEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') notFound();

  // Fetch tracker + children in parallel.
  const [trackerRes, phasesRes, groupsRes] = await Promise.all([
    admin
      .from('onboarding_trackers')
      .select('id, client_id, service, title, status, share_token, started_at, completed_at, created_at, updated_at, clients!inner(name, slug, logo_url)')
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

  if (!trackerRes.data) notFound();

  // Supabase types `!inner` joins as arrays; they're 1:1 here so unwrap.
  const rawTracker = trackerRes.data as unknown as Record<string, unknown> & {
    clients: { name: string; slug: string; logo_url: string | null } | Array<{ name: string; slug: string; logo_url: string | null }>;
  };
  const initialTracker = {
    ...rawTracker,
    clients: Array.isArray(rawTracker.clients) ? rawTracker.clients[0] ?? null : rawTracker.clients,
  } as Parameters<typeof OnboardingEditor>[0]['initialTracker'];

  // Fetch items + email templates + applicable templates in parallel.
  const groupIds = (groupsRes.data ?? []).map((g) => g.id);
  const [itemsRes, emailTemplatesRes, availableTemplatesRes] = await Promise.all([
    groupIds.length
      ? admin
          .from('onboarding_checklist_items')
          .select('id, group_id, task, description, owner, status, sort_order')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    // Email templates: skip on template pages (not useful there).
    initialTracker.is_template
      ? Promise.resolve({ data: [] as unknown[] })
      : admin
          .from('onboarding_email_templates')
          .select('id, service, name, subject, body')
          .eq('service', initialTracker.service)
          .order('sort_order', { ascending: true }),
    // Applicable service templates for "Apply template" picker.
    initialTracker.is_template
      ? Promise.resolve({ data: [] as unknown[] })
      : admin
          .from('onboarding_trackers')
          .select('id, service, template_name')
          .eq('is_template', true)
          .eq('service', initialTracker.service)
          .order('created_at', { ascending: false }),
  ]);

  return (
    <OnboardingEditor
      initialTracker={initialTracker}
      initialPhases={phasesRes.data ?? []}
      initialGroups={groupsRes.data ?? []}
      initialItems={(itemsRes.data as Parameters<typeof OnboardingEditor>[0]['initialItems']) ?? []}
      emailTemplates={(emailTemplatesRes.data as Parameters<typeof OnboardingEditor>[0]['emailTemplates']) ?? []}
      availableTemplates={(availableTemplatesRes.data as Parameters<typeof OnboardingEditor>[0]['availableTemplates']) ?? []}
    />
  );
}

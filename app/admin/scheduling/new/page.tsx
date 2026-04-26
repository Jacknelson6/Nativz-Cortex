import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewSchedulingEventForm } from './form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin form to create a new team_scheduling_event. Lists every internal
 * teammate (users in nativz.io / andersoncollaborative.com) — calendar reads
 * happen via service-account / domain-wide delegation, so no per-user OAuth
 * is required to pick someone.
 *
 * Optional ?item_id= prepopulates the linked schedule_meeting onboarding
 * item, threading from the onboarding builder when an admin clicks "Set up
 * team availability" on an item.
 */
const TEAM_DOMAINS = ['nativz.io', 'andersoncollaborative.com'] as const;
export default async function NewSchedulingEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/admin/scheduling/new');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = me?.role === 'admin' || me?.is_super_admin === true;
  if (!isAdmin) redirect('/');

  const sp = await searchParams;
  const rawItemId = typeof sp.item_id === 'string' ? sp.item_id : null;
  const rawClientId = typeof sp.client_id === 'string' ? sp.client_id : null;

  // Internal teammates from authorized workspace domains — DWD lets us read
  // their calendars without per-user OAuth.
  type ConnectedUser = {
    id: string;
    email: string;
    name: string | null;
  };
  const domainFilter = TEAM_DOMAINS.map((d) => `email.ilike.%@${d}`).join(',');
  const { data: userRows } = await admin
    .from('users')
    .select('id, email, name')
    .or(domainFilter)
    .order('name', { ascending: true });
  const connectedUsers: ConnectedUser[] = (userRows ?? [])
    .filter((u) => !!u.email)
    .map((u) => ({
      id: u.id as string,
      email: u.email as string,
      name: (u.name as string | null) ?? null,
    }));

  // If linked to a schedule_meeting item, hydrate its task name + linked
  // flow/client so we can prepopulate the event name.
  let linkedItem: {
    id: string;
    task: string;
    flow_id: string | null;
    client_id: string | null;
    client_name: string | null;
  } | null = null;
  if (rawItemId) {
    const { data: itemRow } = await admin
      .from('onboarding_checklist_items')
      .select('id, task, group_id')
      .eq('id', rawItemId)
      .maybeSingle();
    if (itemRow) {
      const { data: groupRow } = await admin
        .from('onboarding_checklist_groups')
        .select('tracker_id')
        .eq('id', itemRow.group_id)
        .maybeSingle();
      const trackerId = groupRow?.tracker_id as string | null | undefined;
      let flowId: string | null = null;
      let clientId: string | null = null;
      if (trackerId) {
        const { data: segRow } = await admin
          .from('onboarding_flow_segments')
          .select('flow_id')
          .eq('tracker_id', trackerId)
          .maybeSingle();
        flowId = (segRow?.flow_id as string | null) ?? null;
        if (flowId) {
          const { data: flowRow } = await admin
            .from('onboarding_flows')
            .select('client_id')
            .eq('id', flowId)
            .maybeSingle();
          clientId = (flowRow?.client_id as string | null) ?? null;
        }
      }
      let clientName: string | null = null;
      if (clientId) {
        const { data: clientRow } = await admin
          .from('clients')
          .select('name')
          .eq('id', clientId)
          .maybeSingle();
        clientName = (clientRow?.name as string | null) ?? null;
      }
      linkedItem = {
        id: itemRow.id as string,
        task: itemRow.task as string,
        flow_id: flowId,
        client_id: clientId,
        client_name: clientName,
      };
    }
  }

  return (
    <div className="cortex-page-gutter max-w-2xl space-y-8">
      <header>
        <h1 className="ui-page-title-md">New scheduling event</h1>
        <p className="text-sm text-text-muted">
          Pick teammates who need to be in the meeting. We&apos;ll show the client every slot
          where everyone&apos;s free.
        </p>
      </header>
      <NewSchedulingEventForm
        connectedUsers={connectedUsers}
        linkedItem={linkedItem}
        prefilledClientId={rawClientId}
      />
    </div>
  );
}

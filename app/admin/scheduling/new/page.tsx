import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewSchedulingEventForm } from './form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin form to create a new team_scheduling_event. The "who can attend"
 * roster comes from `scheduling_people` — the canonical configured-people
 * list managed at /admin/scheduling/people. Each configured person is
 * resolved to a real `users.id` via their workspace email aliases so the
 * event-create POST has a valid user_id for team_scheduling_event_members.
 *
 * Optional ?item_id= prepopulates the linked schedule_meeting onboarding
 * item, threading from the onboarding builder when an admin clicks "Set up
 * team availability" on an item.
 */
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

  // Configured scheduling people = canonical "who's schedulable" list.
  // Pull active rows in priority-tier order, then resolve to real users.id
  // values via their workspace email aliases. Anyone we can't resolve is
  // silently dropped — the POST schema requires a valid user_id.
  type ConfiguredPerson = {
    id: string; // resolved users.id
    email: string;
    name: string;
    color: string;
    priorityTier: 1 | 2 | 3;
  };

  const [{ data: peopleRows }, { data: emailRows }] = await Promise.all([
    admin
      .from('scheduling_people')
      .select('id, display_name, color, priority_tier, sort_order')
      .eq('is_active', true)
      .order('priority_tier', { ascending: true })
      .order('sort_order', { ascending: true }),
    admin.from('scheduling_person_emails').select('person_id, email'),
  ]);

  const emailsByPerson = new Map<string, string[]>();
  for (const row of emailRows ?? []) {
    const personId = row.person_id as string;
    const email = (row.email as string).toLowerCase();
    const list = emailsByPerson.get(personId) ?? [];
    list.push(email);
    emailsByPerson.set(personId, list);
  }

  const allEmails = Array.from(new Set(Array.from(emailsByPerson.values()).flat()));
  const userIdByEmail = new Map<string, string>();
  if (allEmails.length > 0) {
    const { data: userRows } = await admin
      .from('users')
      .select('id, email')
      .in('email', allEmails);
    for (const u of userRows ?? []) {
      const email = (u.email as string | null)?.toLowerCase();
      if (email && u.id) userIdByEmail.set(email, u.id as string);
    }
  }

  const configuredPeople: ConfiguredPerson[] = (peopleRows ?? [])
    .map((p) => {
      const emails = emailsByPerson.get(p.id as string) ?? [];
      let resolved: { user_id: string; email: string } | null = null;
      for (const email of emails) {
        const userId = userIdByEmail.get(email);
        if (userId) {
          resolved = { user_id: userId, email };
          break;
        }
      }
      if (!resolved) return null;
      return {
        id: resolved.user_id,
        email: resolved.email,
        name: p.display_name as string,
        color: (p.color as string) ?? '#94a3b8',
        priorityTier: (p.priority_tier as 1 | 2 | 3) ?? 2,
      };
    })
    .filter((p): p is ConfiguredPerson => p !== null);

  // Hydrate any onboarding-checklist link so we can prepopulate the event
  // name + connect the resulting event back to the originating flow.
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
    <div className="cortex-page-gutter max-w-2xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/admin/scheduling"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={12} />
          Back to scheduling
        </Link>
        <h1 className="ui-page-title-md">New scheduling event</h1>
      </header>
      <NewSchedulingEventForm
        configuredPeople={configuredPeople}
        linkedItem={linkedItem}
        prefilledClientId={rawClientId}
      />
    </div>
  );
}

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingFlowBuilder } from '@/components/onboarding/onboarding-flow-builder';
import type { FlowStatus, SegmentKind } from '@/lib/onboarding/flows';

export const dynamic = 'force-dynamic';

/**
 * /admin/onboarding/[id] — flow detail + builder. Loads the flow + every
 * segment + the linked proposal (if any) + every stakeholder + every
 * available admin user (for the stakeholder picker), then hands the
 * snapshot to the client builder which owns mutations.
 */
export default async function OnboardingFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) notFound();

  type FlowRow = {
    id: string;
    client_id: string;
    status: FlowStatus;
    proposal_id: string | null;
    share_token: string;
    poc_emails: string[] | null;
    started_at: string | null;
    completed_at: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    clients:
      | { id: string; name: string; slug: string; logo_url: string | null; agency: string | null }
      | Array<{ id: string; name: string; slug: string; logo_url: string | null; agency: string | null }>;
  };
  const { data: flowRow } = await admin
    .from('onboarding_flows')
    .select(
      'id, client_id, status, proposal_id, share_token, poc_emails, ' +
      'started_at, completed_at, closed_at, created_at, updated_at, ' +
      'clients!inner(id, name, slug, logo_url, agency)',
    )
    .eq('id', id)
    .maybeSingle<FlowRow>();
  if (!flowRow) notFound();

  const fr = flowRow;
  const client = Array.isArray(fr.clients) ? fr.clients[0] ?? null : fr.clients;

  const [segmentsRes, proposalRes, stakeholdersRes, adminUsersRes] = await Promise.all([
    admin
      .from('onboarding_flow_segments')
      .select('id, kind, tracker_id, position, status, started_at, completed_at')
      .eq('flow_id', id)
      .order('position', { ascending: true }),
    fr.proposal_id
      ? admin
          .from('proposals')
          .select('id, slug, title, status, signer_email, total_cents, deposit_cents, expires_at, signed_at, paid_at')
          .eq('id', fr.proposal_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('onboarding_flow_stakeholders')
      .select('id, user_id, email, display_name, role_label, notify_on_invoice_paid, notify_on_segment_completed, notify_on_onboarding_complete')
      .eq('flow_id', id)
      .order('created_at', { ascending: true }),
    admin
      .from('users')
      .select('id, full_name, email, role_title, role, is_super_admin')
      .or('role.eq.admin,is_super_admin.eq.true')
      .order('full_name', { ascending: true }),
  ]);

  // For each non-virtual segment, load its tracker title + checklist counts.
  type SegmentRow = {
    id: string;
    kind: SegmentKind;
    tracker_id: string | null;
    position: number;
    status: 'pending' | 'in_progress' | 'done';
    started_at: string | null;
    completed_at: string | null;
  };
  const segments = ((segmentsRes.data as SegmentRow[] | null) ?? []);
  const trackerIds = segments.map((s) => s.tracker_id).filter((v): v is string => !!v);

  type TrackerSummary = { id: string; title: string | null; service: string; status: string };
  type GroupSummary = { id: string; tracker_id: string };
  let trackers: TrackerSummary[] = [];
  let groupsByTracker = new Map<string, string[]>();
  let itemCounts = new Map<string, { total: number; done: number }>();
  if (trackerIds.length) {
    const [trackersRes, groupsRes] = await Promise.all([
      admin
        .from('onboarding_trackers')
        .select('id, title, service, status')
        .in('id', trackerIds),
      admin
        .from('onboarding_checklist_groups')
        .select('id, tracker_id')
        .in('tracker_id', trackerIds),
    ]);
    trackers = (trackersRes.data ?? []) as TrackerSummary[];
    const groups = (groupsRes.data ?? []) as GroupSummary[];
    for (const g of groups) {
      const arr = groupsByTracker.get(g.tracker_id) ?? [];
      arr.push(g.id);
      groupsByTracker.set(g.tracker_id, arr);
    }
    const allGroupIds = groups.map((g) => g.id);
    if (allGroupIds.length) {
      const { data: items } = await admin
        .from('onboarding_checklist_items')
        .select('group_id, status')
        .in('group_id', allGroupIds);
      const groupToTracker = new Map(groups.map((g) => [g.id, g.tracker_id]));
      for (const it of (items ?? []) as { group_id: string; status: string }[]) {
        const tid = groupToTracker.get(it.group_id);
        if (!tid) continue;
        const cur = itemCounts.get(tid) ?? { total: 0, done: 0 };
        cur.total += 1;
        if (it.status === 'done') cur.done += 1;
        itemCounts.set(tid, cur);
      }
    }
  }

  const trackerById = new Map(trackers.map((t) => [t.id, t]));
  const segmentSummaries = segments.map((s) => {
    const tracker = s.tracker_id ? trackerById.get(s.tracker_id) ?? null : null;
    const counts = s.tracker_id ? itemCounts.get(s.tracker_id) ?? { total: 0, done: 0 } : { total: 0, done: 0 };
    return {
      id: s.id,
      kind: s.kind,
      tracker_id: s.tracker_id,
      position: s.position,
      status: s.status,
      tracker_title: tracker?.title ?? null,
      tracker_service: tracker?.service ?? null,
      item_total: counts.total,
      item_done: counts.done,
    };
  });

  type AdminUser = {
    id: string;
    full_name: string | null;
    email: string | null;
    role_title: string | null;
  };
  const adminUsers = (adminUsersRes.data ?? []) as AdminUser[];

  type Proposal = {
    id: string;
    slug: string;
    title: string;
    status: string;
    signer_email: string | null;
    total_cents: number | null;
    deposit_cents: number | null;
    expires_at: string | null;
    signed_at: string | null;
    paid_at: string | null;
  };

  return (
    <OnboardingFlowBuilder
      flow={{
        id: fr.id,
        client_id: fr.client_id,
        status: fr.status as FlowStatus,
        proposal_id: fr.proposal_id,
        share_token: fr.share_token,
        poc_emails: fr.poc_emails ?? [],
        started_at: fr.started_at,
        completed_at: fr.completed_at,
        closed_at: fr.closed_at,
        created_at: fr.created_at,
      }}
      client={client}
      segments={segmentSummaries}
      proposal={(proposalRes.data ?? null) as Proposal | null}
      stakeholders={(stakeholdersRes.data ?? []) as Parameters<typeof OnboardingFlowBuilder>[0]['stakeholders']}
      adminUsers={adminUsers}
    />
  );
}

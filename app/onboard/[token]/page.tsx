import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { IntakeForm } from './intake-form';
import { SEGMENT_KIND_LABEL, type SegmentKind, type FlowStatus } from '@/lib/onboarding/flows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IntakeItem = {
  id: string;
  task: string;
  description: string | null;
  owner: 'agency' | 'client';
  status: 'pending' | 'done';
  sort_order: number;
  kind: string;
  template_key: string | null;
  required: boolean;
  data: Record<string, unknown>;
  dont_have: boolean;
  // Populated server-side at render when a team_scheduling_event is linked
  // to this item (kind === 'schedule_meeting'). NOT persisted — the editor
  // uses it to render the cal.diy-style picker URL inline.
  scheduling?: {
    share_token: string;
    status: 'open' | 'scheduled' | 'canceled' | 'expired';
    duration_minutes: number;
    pick: { start_at: string; end_at: string } | null;
  };
};

export type IntakeGroup = {
  id: string;
  name: string;
  sort_order: number;
  items: IntakeItem[];
};

export type IntakeSegment = {
  id: string;
  kind: string;
  title: string;
  position: number;
  status: 'pending' | 'in_progress' | 'done';
  groups: IntakeGroup[];
};

export type IntakeFlow = {
  id: string;
  status: FlowStatus;
  template_id: string | null;
  tier_id: string | null;
  client: {
    id: string;
    name: string;
    slug: string;
    agency: string | null;
    logo_url: string | null;
  };
  segments: IntakeSegment[];
};

export default async function OnboardingIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const admin = createAdminClient();

  const { data: flowRow } = await admin
    .from('onboarding_flows')
    .select(
      `
      id, status, template_id, tier_id, share_token, started_at, completed_at,
      clients!inner(id, name, slug, agency, logo_url)
    `,
    )
    .eq('share_token', token)
    .maybeSingle();

  if (!flowRow) notFound();
  const status = flowRow.status as FlowStatus;
  if (status === 'archived') notFound();

  const clientRaw = (flowRow as { clients: unknown }).clients;
  const client = (Array.isArray(clientRaw) ? clientRaw[0] : clientRaw) as {
    id: string;
    name: string;
    slug: string;
    agency: string | null;
    logo_url: string | null;
  };

  const { data: segmentRows } = await admin
    .from('onboarding_flow_segments')
    .select('id, kind, position, status, tracker_id')
    .eq('flow_id', flowRow.id)
    .order('position', { ascending: true });

  const trackerIds = (segmentRows ?? [])
    .map((s) => s.tracker_id as string | null)
    .filter((id): id is string => !!id);

  const trackerById = new Map<string, { id: string; service: string; title: string | null }>();
  if (trackerIds.length > 0) {
    const { data: trackerRows } = await admin
      .from('onboarding_trackers')
      .select('id, service, title')
      .in('id', trackerIds);
    for (const t of trackerRows ?? []) trackerById.set(t.id, t);
  }

  const groupsByTracker = new Map<string, IntakeGroup[]>();
  if (trackerIds.length > 0) {
    const { data: groupRows } = await admin
      .from('onboarding_checklist_groups')
      .select('id, name, sort_order, tracker_id')
      .in('tracker_id', trackerIds)
      .order('sort_order', { ascending: true });

    const groupIds = (groupRows ?? []).map((g) => g.id);
    const itemsByGroup = new Map<string, IntakeItem[]>();
    if (groupIds.length > 0) {
      const { data: itemRows } = await admin
        .from('onboarding_checklist_items')
        .select(
          'id, group_id, task, description, owner, status, sort_order, kind, template_key, required, data, dont_have',
        )
        .in('group_id', groupIds)
        .order('sort_order', { ascending: true });

      const scheduleMeetingItemIds = (itemRows ?? [])
        .filter((it) => it.kind === 'schedule_meeting')
        .map((it) => it.id as string);

      const schedulingByItem = new Map<
        string,
        {
          share_token: string;
          status: 'open' | 'scheduled' | 'canceled' | 'expired';
          duration_minutes: number;
          pick: { start_at: string; end_at: string } | null;
        }
      >();
      if (scheduleMeetingItemIds.length > 0) {
        const { data: eventRows } = await admin
          .from('team_scheduling_events')
          .select('id, item_id, share_token, status, duration_minutes')
          .in('item_id', scheduleMeetingItemIds);
        const eventIds = (eventRows ?? []).map((e) => e.id as string);
        const pickByEvent = new Map<string, { start_at: string; end_at: string }>();
        if (eventIds.length > 0) {
          const { data: pickRows } = await admin
            .from('team_scheduling_event_picks')
            .select('event_id, start_at, end_at, cancelled_at')
            .in('event_id', eventIds)
            .is('cancelled_at', null);
          for (const p of pickRows ?? []) {
            pickByEvent.set(p.event_id as string, {
              start_at: p.start_at as string,
              end_at: p.end_at as string,
            });
          }
        }
        for (const e of eventRows ?? []) {
          schedulingByItem.set(e.item_id as string, {
            share_token: e.share_token as string,
            status: e.status as 'open' | 'scheduled' | 'canceled' | 'expired',
            duration_minutes: e.duration_minutes as number,
            pick: pickByEvent.get(e.id as string) ?? null,
          });
        }
      }

      for (const it of itemRows ?? []) {
        const list = itemsByGroup.get(it.group_id) ?? [];
        list.push({
          id: it.id,
          task: it.task,
          description: it.description,
          owner: it.owner,
          status: it.status,
          sort_order: it.sort_order,
          kind: it.kind,
          template_key: it.template_key,
          required: it.required,
          data: (it.data as Record<string, unknown>) ?? {},
          dont_have: it.dont_have,
          scheduling: schedulingByItem.get(it.id) ?? undefined,
        });
        itemsByGroup.set(it.group_id, list);
      }
    }

    for (const g of groupRows ?? []) {
      const list = groupsByTracker.get(g.tracker_id) ?? [];
      list.push({
        id: g.id,
        name: g.name,
        sort_order: g.sort_order,
        items: itemsByGroup.get(g.id) ?? [],
      });
      groupsByTracker.set(g.tracker_id, list);
    }
  }

  const segments: IntakeSegment[] = (segmentRows ?? [])
    .filter((s) => s.kind !== 'agreement_payment')
    .map((s) => {
      const trackerId = s.tracker_id as string | null;
      const tracker = trackerId ? trackerById.get(trackerId) : null;
      const titleFromKind = SEGMENT_KIND_LABEL[s.kind as SegmentKind] ?? s.kind;
      return {
        id: s.id,
        kind: s.kind,
        title: tracker?.title ?? titleFromKind,
        position: s.position,
        status: s.status as 'pending' | 'in_progress' | 'done',
        groups: trackerId ? groupsByTracker.get(trackerId) ?? [] : [],
      };
    });

  const flow: IntakeFlow = {
    id: flowRow.id,
    status,
    template_id: flowRow.template_id as string | null,
    tier_id: flowRow.tier_id as string | null,
    client,
    segments,
  };

  return <IntakeForm token={token} flow={flow} />;
}

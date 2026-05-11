// SPY-01 T07: server-side prospect query helpers. Admin-only.
// Uses createAdminClient() per CONTEXT (admin-only product surface, no org scoping yet).

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  ProspectLifecycleState,
  ProspectRow,
  ProspectSocialRow,
  ProspectTouchpointRow,
} from './types';
import { LIFECYCLE_STATES } from './types';

export interface ProspectListItem extends ProspectRow {
  socials: Pick<ProspectSocialRow, 'platform' | 'handle'>[];
}

export interface ProspectListResult {
  prospects: ProspectListItem[];
  counts: Record<ProspectLifecycleState, number>;
}

export async function listProspects(filters: {
  state?: ProspectLifecycleState;
  q?: string;
} = {}): Promise<ProspectListResult> {
  const admin = createAdminClient();

  let query = admin
    .from('prospects')
    .select('*, prospect_socials(platform, handle)')
    .is('archived_at', null)
    .order('last_touched_at', { ascending: false });

  if (filters.state) query = query.eq('lifecycle_state', filters.state);
  if (filters.q && filters.q.trim()) {
    const like = `%${filters.q.trim()}%`;
    query = query.or(`brand_name.ilike.${like},primary_handle.ilike.${like},niche.ilike.${like}`);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`listProspects failed: ${error.message}`);

  const prospects: ProspectListItem[] = (rows ?? []).map((r) => {
    const { prospect_socials, ...rest } = r as ProspectRow & {
      prospect_socials: Pick<ProspectSocialRow, 'platform' | 'handle'>[] | null;
    };
    return { ...rest, socials: prospect_socials ?? [] };
  });

  const counts = await lifecycleCounts();
  return { prospects, counts };
}

export async function lifecycleCounts(): Promise<Record<ProspectLifecycleState, number>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('prospects')
    .select('lifecycle_state')
    .is('archived_at', null);
  if (error) throw new Error(`lifecycleCounts failed: ${error.message}`);
  const out: Record<ProspectLifecycleState, number> = {
    discovered: 0,
    audited: 0,
    in_outreach: 0,
    demo_scheduled: 0,
    converted: 0,
    lost: 0,
  };
  for (const row of data ?? []) {
    const state = (row as { lifecycle_state: ProspectLifecycleState }).lifecycle_state;
    if (LIFECYCLE_STATES.includes(state)) out[state]++;
  }
  return out;
}

export async function getProspect(id: string): Promise<{
  prospect: ProspectRow;
  socials: ProspectSocialRow[];
  touchpoints: ProspectTouchpointRow[];
} | null> {
  const admin = createAdminClient();
  const { data: prospect, error: pErr } = await admin
    .from('prospects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (pErr) throw new Error(`getProspect failed: ${pErr.message}`);
  if (!prospect) return null;

  const [{ data: socials }, { data: touchpoints }] = await Promise.all([
    admin.from('prospect_socials').select('*').eq('prospect_id', id),
    admin
      .from('prospect_touchpoints')
      .select('*')
      .eq('prospect_id', id)
      .order('occurred_at', { ascending: false })
      .limit(200),
  ]);

  return {
    prospect: prospect as ProspectRow,
    socials: (socials ?? []) as ProspectSocialRow[],
    touchpoints: (touchpoints ?? []) as ProspectTouchpointRow[],
  };
}

export async function listTouchpoints(prospectId: string): Promise<ProspectTouchpointRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('prospect_touchpoints')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('occurred_at', { ascending: false });
  if (error) throw new Error(`listTouchpoints failed: ${error.message}`);
  return (data ?? []) as ProspectTouchpointRow[];
}

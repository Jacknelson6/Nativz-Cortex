import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SERVICE_DEFAULT_MONTHLY,
  clientHasService,
  type ServiceKind,
} from './service-defaults';

export type CapacitySource = 'proposal' | 'default' | 'not-subscribed';

export interface ServiceCapacity {
  monthly: number;
  source: CapacitySource;
  proposalId: string | null;
  tierId: string | null;
  tierName: string | null;
}

export interface ClientServiceCapacity {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  editing: ServiceCapacity;
  smm: ServiceCapacity;
  blogging: ServiceCapacity;
}

interface TierDeliverables {
  editing?: number;
  smm?: number;
  blogging?: number;
}

interface TierShape {
  id?: string;
  name?: string;
  deliverables?: TierDeliverables;
}

function notSubscribed(): ServiceCapacity {
  return { monthly: 0, source: 'not-subscribed', proposalId: null, tierId: null, tierName: null };
}

function fromDefault(kind: ServiceKind): ServiceCapacity {
  return {
    monthly: SERVICE_DEFAULT_MONTHLY[kind],
    source: 'default',
    proposalId: null,
    tierId: null,
    tierName: null,
  };
}

function fromProposal(
  kind: ServiceKind,
  tier: TierShape,
  proposalId: string,
): ServiceCapacity {
  const monthly = tier.deliverables?.[kind];
  if (typeof monthly !== 'number' || monthly < 0) return fromDefault(kind);
  return {
    monthly,
    source: 'proposal',
    proposalId,
    tierId: tier.id ?? null,
    tierName: tier.name ?? null,
  };
}

function currentPeriodBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export async function getClientServiceCapacity(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ClientServiceCapacity> {
  const period = currentPeriodBounds();

  const [{ data: client }, { data: proposal }] = await Promise.all([
    supabase.from('clients').select('id, services').eq('id', clientId).maybeSingle(),
    supabase
      .from('proposals')
      .select('id, tier_id, template_id, signed_at, status')
      .eq('client_id', clientId)
      .not('signed_at', 'is', null)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const services: string[] = (client?.services as string[] | null) ?? [];

  let tier: TierShape | null = null;
  let proposalId: string | null = null;
  if (proposal?.template_id && proposal?.tier_id) {
    const { data: template } = await supabase
      .from('proposal_templates')
      .select('tiers_preview')
      .eq('id', proposal.template_id)
      .maybeSingle();
    const tiers = (template?.tiers_preview as TierShape[] | null) ?? [];
    tier = tiers.find((t) => t.id === proposal.tier_id) ?? null;
    if (tier) proposalId = proposal.id as string;
  }

  function resolve(kind: ServiceKind): ServiceCapacity {
    if (!clientHasService(services, kind)) return notSubscribed();
    if (tier && proposalId) return fromProposal(kind, tier, proposalId);
    return fromDefault(kind);
  }

  return {
    clientId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    editing: resolve('editing'),
    smm: resolve('smm'),
    blogging: resolve('blogging'),
  };
}

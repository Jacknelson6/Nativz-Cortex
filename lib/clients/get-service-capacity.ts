import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SERVICE_DEFAULT_MONTHLY,
  clientHasService,
  type ServiceKind,
} from './service-defaults';
import { getClientServiceUsage } from './get-service-usage';

export type CapacitySource = 'default' | 'not-subscribed';

export interface ServiceCapacity {
  monthly: number;
  delivered: number;
  source: CapacitySource;
}

export interface ClientServiceCapacity {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  editing: ServiceCapacity;
  smm: ServiceCapacity;
  blogging: ServiceCapacity;
}

function notSubscribed(): ServiceCapacity {
  return { monthly: 0, delivered: 0, source: 'not-subscribed' };
}

function fromDefault(kind: ServiceKind): ServiceCapacity {
  return {
    monthly: SERVICE_DEFAULT_MONTHLY[kind],
    delivered: 0,
    source: 'default',
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

  const [{ data: client }, editingUsage, smmUsage, bloggingUsage] = await Promise.all([
    supabase.from('clients').select('id, services').eq('id', clientId).maybeSingle(),
    getClientServiceUsage(supabase, clientId, 'editing'),
    getClientServiceUsage(supabase, clientId, 'smm'),
    getClientServiceUsage(supabase, clientId, 'blogging'),
  ]);

  const services: string[] = (client?.services as string[] | null) ?? [];

  const delivered: Record<ServiceKind, number> = {
    editing: editingUsage.used,
    smm: smmUsage.used,
    blogging: bloggingUsage.used,
  };

  function resolve(kind: ServiceKind): ServiceCapacity {
    if (!clientHasService(services, kind)) {
      return { ...notSubscribed(), delivered: delivered[kind] };
    }
    return { ...fromDefault(kind), delivered: delivered[kind] };
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

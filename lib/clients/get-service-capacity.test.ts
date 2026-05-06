import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientServiceCapacity } from './get-service-capacity';

vi.mock('./get-service-usage', () => ({
  getClientServiceUsage: vi.fn(async () => ({ used: 0, periodStart: '', periodEnd: '' })),
}));

interface MockResponses {
  client: { id: string; services: string[] | null } | null;
}

function buildSupabase(responses: MockResponses): SupabaseClient {
  function tableHandler(table: string) {
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.maybeSingle = async () => {
      if (table === 'clients') return { data: responses.client };
      return { data: null };
    };
    return builder;
  }
  return {
    from: (table: string) => tableHandler(table),
  } as unknown as SupabaseClient;
}

describe('getClientServiceCapacity', () => {
  it('uses defaults for every service the client subscribes to', async () => {
    const supabase = buildSupabase({
      client: { id: 'c1', services: ['Editing', 'SMM'] },
    });

    const cap = await getClientServiceCapacity(supabase, 'c1');

    expect(cap.editing.source).toBe('default');
    expect(cap.smm.source).toBe('default');
    expect(cap.smm.monthly).toBe(60);
    expect(cap.blogging.source).toBe('not-subscribed');
  });

  it('marks services not-subscribed when client.services omits them', async () => {
    const supabase = buildSupabase({
      client: { id: 'c3', services: ['Editing'] },
    });

    const cap = await getClientServiceCapacity(supabase, 'c3');

    expect(cap.editing.source).toBe('default');
    expect(cap.smm.source).toBe('not-subscribed');
    expect(cap.smm.monthly).toBe(0);
    expect(cap.blogging.source).toBe('not-subscribed');
  });
});

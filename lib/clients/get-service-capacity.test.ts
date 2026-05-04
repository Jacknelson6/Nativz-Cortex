import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientServiceCapacity } from './get-service-capacity';

vi.mock('./get-service-usage', () => ({
  getClientServiceUsage: vi.fn(async () => ({ used: 0, periodStart: '', periodEnd: '' })),
}));

interface MockResponses {
  client: { id: string; services: string[] | null } | null;
  proposal: { id: string; tier_id: string; template_id: string; signed_at: string; status: string } | null;
  template?: { tiers_preview: unknown[] } | null;
}

function buildSupabase(responses: MockResponses): SupabaseClient {
  function tableHandler(table: string) {
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.not = chain;
    builder.maybeSingle = async () => {
      if (table === 'clients') return { data: responses.client };
      if (table === 'proposals') return { data: responses.proposal };
      if (table === 'proposal_templates') return { data: responses.template ?? null };
      return { data: null };
    };
    return builder;
  }
  return {
    from: (table: string) => tableHandler(table),
  } as unknown as SupabaseClient;
}

describe('getClientServiceCapacity', () => {
  it('resolves from proposal tier when proposal + tier match', async () => {
    const supabase = buildSupabase({
      client: { id: 'c1', services: ['Editing', 'SMM'] },
      proposal: {
        id: 'p1',
        tier_id: 't-studio',
        template_id: 'tpl1',
        signed_at: '2026-04-01',
        status: 'signed',
      },
      template: {
        tiers_preview: [
          { id: 't-studio', name: 'Studio', deliverables: { editing: 8, smm: 60, blogging: 0 } },
        ],
      },
    });

    const cap = await getClientServiceCapacity(supabase, 'c1');

    expect(cap.editing.source).toBe('proposal');
    expect(cap.editing.monthly).toBe(8);
    expect(cap.editing.tierName).toBe('Studio');
    expect(cap.smm.source).toBe('proposal');
    expect(cap.smm.monthly).toBe(60);
  });

  it('falls back to default when client is enabled but has no signed proposal', async () => {
    const supabase = buildSupabase({
      client: { id: 'c2', services: ['SMM'] },
      proposal: null,
    });

    const cap = await getClientServiceCapacity(supabase, 'c2');

    expect(cap.smm.source).toBe('default');
    expect(cap.smm.monthly).toBe(60);
    expect(cap.editing.source).toBe('not-subscribed');
  });

  it('marks services not-subscribed when client.services omits them', async () => {
    const supabase = buildSupabase({
      client: { id: 'c3', services: ['Editing'] },
      proposal: null,
    });

    const cap = await getClientServiceCapacity(supabase, 'c3');

    expect(cap.editing.source).toBe('default');
    expect(cap.smm.source).toBe('not-subscribed');
    expect(cap.smm.monthly).toBe(0);
    expect(cap.blogging.source).toBe('not-subscribed');
  });

  it('falls back to default when tier exists but has no deliverables block', async () => {
    const supabase = buildSupabase({
      client: { id: 'c4', services: ['Editing'] },
      proposal: {
        id: 'p4',
        tier_id: 't-legacy',
        template_id: 'tpl-legacy',
        signed_at: '2026-04-01',
        status: 'signed',
      },
      template: {
        tiers_preview: [{ id: 't-legacy', name: 'Legacy', deliverables: undefined }],
      },
    });

    const cap = await getClientServiceCapacity(supabase, 'c4');

    expect(cap.editing.source).toBe('default');
    expect(cap.editing.monthly).toBe(0);
  });
});

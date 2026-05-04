import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { autoPopulateEditingForPeriod } from './auto-populate-editing';

interface MockState {
  period: { id: string; start_date: string; end_date: string; status: string } | null;
  editedTypeId: string | null;
  consumes: Array<{ id: string; client_id: string | null; editor_user_id: string | null }>;
  refunds: Array<{ id: string; client_id: string | null; editor_user_id: string | null }>;
  teamMembersByUser: Map<
    string,
    { id: string; user_id: string | null; full_name: string | null; cost_rate_cents_per_hour: number | null }
  >;
  unattributedMember:
    | { id: string; user_id: string | null; full_name: string | null; cost_rate_cents_per_hour: number | null }
    | null;
  existingAutoRows: Array<{
    id: string;
    client_id: string | null;
    team_member_id: string | null;
    source: 'auto' | 'auto-edited' | 'auto-deleted';
  }>;
  inserts: Array<Record<string, unknown>>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
}

function buildSupabase(state: MockState): SupabaseClient {
  function makeBuilder(table: string) {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};

    builder.select = () => builder;
    builder.gte = () => builder;
    builder.lt = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    };
    builder.in = (col: string, vals: unknown[]) => {
      filters[`${col}__in`] = vals;
      return builder;
    };

    builder.maybeSingle = async () => {
      if (table === 'payroll_periods') return { data: state.period };
      if (table === 'deliverable_types') {
        return { data: state.editedTypeId ? { id: state.editedTypeId } : null };
      }
      if (table === 'team_members') {
        return { data: state.unattributedMember };
      }
      return { data: null };
    };

    builder.returns = () => {
      if (table === 'credit_transactions') {
        const kind = filters.kind;
        const data =
          kind === 'consume' ? state.consumes : kind === 'refund' ? state.refunds : [];
        return Promise.resolve({ data, error: null });
      }
      if (table === 'team_members') {
        const userIds = (filters.user_id__in ?? []) as string[];
        const rows = userIds
          .map((u) => state.teamMembersByUser.get(u))
          .filter((r): r is NonNullable<typeof r> => Boolean(r));
        return Promise.resolve({ data: rows, error: null });
      }
      if (table === 'payroll_entries') {
        return Promise.resolve({ data: state.existingAutoRows, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };

    builder.insert = async (row: Record<string, unknown>) => {
      state.inserts.push(row);
      return { error: null };
    };
    builder.update = (patch: Record<string, unknown>) => ({
      eq: async (_col: string, val: string) => {
        state.updates.push({ id: val, patch });
        return { error: null };
      },
    });

    return builder;
  }

  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as SupabaseClient;
}

const PERIOD = {
  id: 'period-1',
  start_date: '2026-05-01',
  end_date: '2026-05-15',
  status: 'draft',
};
const EDITOR_USER = 'user-jed';
const EDITOR_TEAM_MEMBER_ID = 'tm-jed';
const CLIENT_ID = 'client-1';

function baseState(): MockState {
  return {
    period: PERIOD,
    editedTypeId: 'dt-edited',
    consumes: [
      { id: 'c1', client_id: CLIENT_ID, editor_user_id: EDITOR_USER },
      { id: 'c2', client_id: CLIENT_ID, editor_user_id: EDITOR_USER },
      { id: 'c3', client_id: CLIENT_ID, editor_user_id: EDITOR_USER },
    ],
    refunds: [],
    teamMembersByUser: new Map([
      [
        EDITOR_USER,
        {
          id: EDITOR_TEAM_MEMBER_ID,
          user_id: EDITOR_USER,
          full_name: 'Jed',
          cost_rate_cents_per_hour: 5000,
        },
      ],
    ]),
    unattributedMember: null,
    existingAutoRows: [],
    inserts: [],
    updates: [],
  };
}

describe('autoPopulateEditingForPeriod', () => {
  it('inserts a new auto row when no existing row matches the (client, editor) group', async () => {
    const state = baseState();
    const result = await autoPopulateEditingForPeriod(buildSupabase(state), PERIOD.id);

    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      period_id: PERIOD.id,
      entry_type: 'editing',
      team_member_id: EDITOR_TEAM_MEMBER_ID,
      client_id: CLIENT_ID,
      video_count: 3,
      rate_cents: 5000,
      amount_cents: 15000,
      source: 'auto',
    });
  });

  it('updates the existing auto row when its count drifts from approved consumes', async () => {
    const state = baseState();
    state.existingAutoRows = [
      {
        id: 'pe-existing',
        client_id: CLIENT_ID,
        team_member_id: EDITOR_TEAM_MEMBER_ID,
        source: 'auto',
      },
    ];

    const result = await autoPopulateEditingForPeriod(buildSupabase(state), PERIOD.id);

    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      id: 'pe-existing',
      patch: { video_count: 3, rate_cents: 5000, amount_cents: 15000 },
    });
  });

  it('treats auto-edited rows as untouchable (admin already curated)', async () => {
    const state = baseState();
    state.existingAutoRows = [
      {
        id: 'pe-edited',
        client_id: CLIENT_ID,
        team_member_id: EDITOR_TEAM_MEMBER_ID,
        source: 'auto-edited',
      },
    ];

    const result = await autoPopulateEditingForPeriod(buildSupabase(state), PERIOD.id);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.inserted).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('treats auto-deleted rows as tombstones and never resurrects them (US-004 invariant)', async () => {
    const state = baseState();
    state.existingAutoRows = [
      {
        id: 'pe-tombstone',
        client_id: CLIENT_ID,
        team_member_id: EDITOR_TEAM_MEMBER_ID,
        source: 'auto-deleted',
      },
    ];

    const result = await autoPopulateEditingForPeriod(buildSupabase(state), PERIOD.id);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.inserted).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('refuses to sync against a locked period', async () => {
    const state = baseState();
    state.period = { ...PERIOD, status: 'locked' };

    const result = await autoPopulateEditingForPeriod(buildSupabase(state), PERIOD.id);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

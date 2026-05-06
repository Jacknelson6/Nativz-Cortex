import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ClientServiceCapacity,
  ServiceCapacity,
} from '@/lib/clients/get-service-capacity';

const getClientServiceCapacityMock = vi.fn(
  (_supabase: unknown, _clientId: string) => Promise.resolve({} as ClientServiceCapacity),
);

vi.mock('@/lib/clients/get-service-capacity', () => ({
  getClientServiceCapacity: getClientServiceCapacityMock,
}));

const { getEditingOverScopeForPeriod } = await import('./get-period-over-scope');

/**
 * Per-client over-scope summary for the editing tab of an accounting period.
 *
 * Pipeline:
 *   1. Read distinct client_ids from payroll_entries where entry_type='editing'
 *      and period_id matches.
 *   2. Read clients(id, name) for those ids.
 *   3. For each client, ask `getClientServiceCapacity` for editing capacity.
 *   4. Filter out: not-subscribed, monthly<=0, delivered<=monthly.
 *   5. Sort by overCount desc.
 */

interface PayrollRow {
  client_id: string | null;
}

interface ClientRow {
  id: string;
  name: string;
}

function makeAdmin(opts: {
  payrollRows: PayrollRow[];
  clientRows: ClientRow[];
}): SupabaseClient {
  const fromMock = vi.fn((table: string) => {
    if (table === 'payroll_entries') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        not: vi.fn(async () => ({ data: opts.payrollRows, error: null })),
      };
      return builder;
    }
    if (table === 'clients') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(async () => ({ data: opts.clientRows, error: null })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

function editing(
  overrides: Partial<ServiceCapacity>,
): ServiceCapacity {
  return {
    monthly: 0,
    delivered: 0,
    source: 'not-subscribed',
    ...overrides,
  };
}

function capacityFor(
  clientId: string,
  editingCap: ServiceCapacity,
): ClientServiceCapacity {
  return {
    clientId,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    editing: editingCap,
    smm: editing({}),
    blogging: editing({}),
  };
}

beforeEach(() => {
  getClientServiceCapacityMock.mockReset();
});

describe('getEditingOverScopeForPeriod', () => {
  it('returns [] when the period has no editing payroll rows', async () => {
    const admin = makeAdmin({ payrollRows: [], clientRows: [] });
    expect(await getEditingOverScopeForPeriod(admin, 'period-1')).toEqual([]);
    // Capacity helper should NEVER be called when there are no client ids.
    expect(getClientServiceCapacityMock).not.toHaveBeenCalled();
  });

  it('drops payroll rows with null client_id before computing capacity', async () => {
    const admin = makeAdmin({
      payrollRows: [
        { client_id: null },
        { client_id: null },
      ],
      clientRows: [],
    });
    expect(await getEditingOverScopeForPeriod(admin, 'period-1')).toEqual([]);
    expect(getClientServiceCapacityMock).not.toHaveBeenCalled();
  });

  it('deduplicates client ids before reading capacity (one capacity call per unique client)', async () => {
    const admin = makeAdmin({
      payrollRows: [
        { client_id: 'c1' },
        { client_id: 'c1' },
        { client_id: 'c1' },
      ],
      clientRows: [{ id: 'c1', name: 'Client One' }],
    });
    getClientServiceCapacityMock.mockResolvedValue(
      capacityFor('c1', editing({ monthly: 10, delivered: 5, source: 'default' })),
    );
    await getEditingOverScopeForPeriod(admin, 'period-1');
    expect(getClientServiceCapacityMock).toHaveBeenCalledTimes(1);
  });

  it('excludes clients whose editing capacity is not-subscribed', async () => {
    const admin = makeAdmin({
      payrollRows: [{ client_id: 'c1' }],
      clientRows: [{ id: 'c1', name: 'Client One' }],
    });
    getClientServiceCapacityMock.mockResolvedValue(
      capacityFor('c1', editing({
        monthly: 0,
        delivered: 100,
        source: 'not-subscribed',
      })),
    );
    expect(await getEditingOverScopeForPeriod(admin, 'period-1')).toEqual([]);
  });

  it('excludes clients with monthly<=0 even if subscribed', async () => {
    const admin = makeAdmin({
      payrollRows: [{ client_id: 'c1' }],
      clientRows: [{ id: 'c1', name: 'Client One' }],
    });
    getClientServiceCapacityMock.mockResolvedValue(
      capacityFor('c1', editing({
        monthly: 0,
        delivered: 5,
        source: 'default',
      })),
    );
    expect(await getEditingOverScopeForPeriod(admin, 'period-1')).toEqual([]);
  });

  it('excludes clients whose delivered does not exceed monthly capacity', async () => {
    const admin = makeAdmin({
      payrollRows: [{ client_id: 'c1' }, { client_id: 'c2' }],
      clientRows: [
        { id: 'c1', name: 'Right at cap' },
        { id: 'c2', name: 'Under cap' },
      ],
    });
    getClientServiceCapacityMock
      .mockResolvedValueOnce(
        capacityFor('c1', editing({
          monthly: 10,
          delivered: 10,
          source: 'default',
        })),
      )
      .mockResolvedValueOnce(
        capacityFor('c2', editing({
          monthly: 10,
          delivered: 7,
          source: 'default',
        })),
      );
    expect(await getEditingOverScopeForPeriod(admin, 'period-1')).toEqual([]);
  });

  it('returns over-scope clients sorted by overCount descending', async () => {
    const admin = makeAdmin({
      payrollRows: [
        { client_id: 'c1' },
        { client_id: 'c2' },
        { client_id: 'c3' },
      ],
      clientRows: [
        { id: 'c1', name: 'Big over' },
        { id: 'c2', name: 'Small over' },
        { id: 'c3', name: 'Medium over' },
      ],
    });
    getClientServiceCapacityMock
      .mockResolvedValueOnce(
        capacityFor('c1', editing({
          monthly: 10,
          delivered: 25,
          source: 'default',
        })),
      )
      .mockResolvedValueOnce(
        capacityFor('c2', editing({
          monthly: 10,
          delivered: 12,
          source: 'default',
        })),
      )
      .mockResolvedValueOnce(
        capacityFor('c3', editing({
          monthly: 10,
          delivered: 18,
          source: 'default',
        })),
      );

    const result = await getEditingOverScopeForPeriod(admin, 'period-1');
    expect(result.map((r) => r.clientId)).toEqual(['c1', 'c3', 'c2']);
    expect(result.map((r) => r.overCount)).toEqual([15, 8, 2]);
  });

  it('preserves clientName from the clients table and falls back to "Unknown"', async () => {
    const admin = makeAdmin({
      payrollRows: [{ client_id: 'c1' }, { client_id: 'c2' }],
      clientRows: [
        { id: 'c1', name: 'Known Client' },
        // c2 missing from clients table -> falls back to "Unknown"
      ],
    });
    getClientServiceCapacityMock
      .mockResolvedValueOnce(
        capacityFor('c1', editing({
          monthly: 5,
          delivered: 8,
          source: 'default',
        })),
      )
      .mockResolvedValueOnce(
        capacityFor('c2', editing({
          monthly: 5,
          delivered: 7,
          source: 'default',
        })),
      );
    const result = await getEditingOverScopeForPeriod(admin, 'period-1');
    const byId = Object.fromEntries(result.map((r) => [r.clientId, r.clientName]));
    expect(byId['c1']).toBe('Known Client');
    expect(byId['c2']).toBe('Unknown');
  });

  it('shapes each row with service: "editing" and the right delivered/monthly fields', async () => {
    const admin = makeAdmin({
      payrollRows: [{ client_id: 'c1' }],
      clientRows: [{ id: 'c1', name: 'Client One' }],
    });
    getClientServiceCapacityMock.mockResolvedValue(
      capacityFor('c1', editing({
        monthly: 10,
        delivered: 14,
        source: 'default',
      })),
    );
    const result = await getEditingOverScopeForPeriod(admin, 'period-1');
    expect(result).toEqual([
      {
        clientId: 'c1',
        clientName: 'Client One',
        service: 'editing',
        monthly: 10,
        delivered: 14,
        overCount: 4,
      },
    ]);
  });
});

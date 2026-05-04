import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isHideFromRosterUnsupportedError,
  selectClientsWithRosterVisibility,
} from './roster-visibility-query';

describe('isHideFromRosterUnsupportedError', () => {
  it('returns false for null/undefined/non-object input', () => {
    expect(isHideFromRosterUnsupportedError(null)).toBe(false);
    expect(isHideFromRosterUnsupportedError(undefined)).toBe(false);
    expect(isHideFromRosterUnsupportedError('hide_from_roster')).toBe(false);
    expect(isHideFromRosterUnsupportedError(42)).toBe(false);
  });

  it('returns false for an empty error object', () => {
    expect(isHideFromRosterUnsupportedError({})).toBe(false);
  });

  it('matches when the message mentions hide_from_roster', () => {
    expect(
      isHideFromRosterUnsupportedError({ message: 'column hide_from_roster does not exist' }),
    ).toBe(true);
  });

  it('matches when only the details field references the column', () => {
    expect(
      isHideFromRosterUnsupportedError({ message: 'oops', details: 'hide_from_roster missing' }),
    ).toBe(true);
  });

  it('matches when only the hint field references the column', () => {
    expect(
      isHideFromRosterUnsupportedError({ hint: 'try migrating: hide_from_roster' }),
    ).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(
      isHideFromRosterUnsupportedError({ message: 'COLUMN HIDE_FROM_ROSTER NOT FOUND' }),
    ).toBe(true);
  });

  it('returns false when the error is unrelated', () => {
    expect(
      isHideFromRosterUnsupportedError({ message: 'permission denied for table clients' }),
    ).toBe(false);
  });
});

interface QueryResult {
  data: Array<Record<string, unknown>> | null;
  error: { message?: string } | null;
}

interface ChainTrace {
  filters: Array<{ kind: string; args: unknown[] }>;
}

function makeChain(result: QueryResult, trace: ChainTrace) {
  const chain = {
    select: (sel: string) => {
      trace.filters.push({ kind: 'select', args: [sel] });
      return chain;
    },
    eq: (col: string, val: unknown) => {
      trace.filters.push({ kind: 'eq', args: [col, val] });
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      trace.filters.push({ kind: 'in', args: [col, vals] });
      return chain;
    },
    order: (col: string, opts: { ascending?: boolean }) => {
      trace.filters.push({ kind: 'order', args: [col, opts] });
      // .order() is the terminal call: return a thenable so `await`-ing it resolves to result.
      return Promise.resolve(result);
    },
    then: (resolve: (r: QueryResult) => void) => resolve(result),
  };
  return chain as unknown as ReturnType<SupabaseClient['from']>;
}

function makeAdmin(
  perCallResults: QueryResult[],
): { admin: SupabaseClient; calls: ChainTrace[] } {
  const calls: ChainTrace[] = [];
  let i = 0;
  const admin = {
    from: () => {
      const trace: ChainTrace = { filters: [] };
      calls.push(trace);
      const result = perCallResults[i] ?? { data: [], error: null };
      i += 1;
      return makeChain(result, trace);
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

describe('selectClientsWithRosterVisibility', () => {
  it('returns the primary result when no error and includes hide_from_roster filter', async () => {
    const { admin, calls } = makeAdmin([
      { data: [{ id: 'c1', name: 'Acme' }], error: null },
    ]);
    const result = await selectClientsWithRosterVisibility(admin, {
      select: 'id, name',
      onlyActive: true,
      orderBy: { column: 'name' },
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: 'c1', name: 'Acme' }]);
    expect(calls).toHaveLength(1);
    const filters = calls[0]!.filters;
    expect(filters).toContainEqual({ kind: 'eq', args: ['is_active', true] });
    expect(filters).toContainEqual({ kind: 'eq', args: ['hide_from_roster', false] });
    expect(filters).toContainEqual({ kind: 'order', args: ['name', { ascending: true }] });
  });

  it('applies eq and in filters from options', async () => {
    const { admin, calls } = makeAdmin([{ data: [], error: null }]);
    await selectClientsWithRosterVisibility(admin, {
      select: '*',
      eq: { organization_id: 'org-1' },
      in: { id: ['a', 'b', 'c'] },
    });

    const filters = calls[0]!.filters;
    expect(filters).toContainEqual({ kind: 'eq', args: ['organization_id', 'org-1'] });
    expect(filters).toContainEqual({ kind: 'in', args: ['id', ['a', 'b', 'c']] });
  });

  it('skips empty in() filter arrays', async () => {
    const { admin, calls } = makeAdmin([{ data: [], error: null }]);
    await selectClientsWithRosterVisibility(admin, {
      select: '*',
      in: { id: [] },
    });

    const filters = calls[0]!.filters;
    expect(filters.find((f) => f.kind === 'in')).toBeUndefined();
  });

  it('retries without hide_from_roster when the column is missing', async () => {
    const { admin, calls } = makeAdmin([
      { data: null, error: { message: 'column hide_from_roster does not exist' } },
      { data: [{ id: 'c1' }], error: null },
    ]);

    const result = await selectClientsWithRosterVisibility(admin, { select: 'id' });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: 'c1' }]);
    expect(calls).toHaveLength(2);
    // First attempt includes the hide filter; retry does not.
    expect(calls[0]!.filters).toContainEqual({ kind: 'eq', args: ['hide_from_roster', false] });
    expect(calls[1]!.filters.find((f) => f.kind === 'eq' && f.args[0] === 'hide_from_roster')).toBeUndefined();
  });

  it('returns the retry error when the fallback also fails', async () => {
    const { admin } = makeAdmin([
      { data: null, error: { message: 'hide_from_roster missing' } },
      { data: null, error: { message: 'permission denied' } },
    ]);

    const result = await selectClientsWithRosterVisibility(admin, { select: 'id' });

    expect(result.data).toEqual([]);
    expect(result.error).toEqual({ message: 'permission denied' });
  });

  it('does NOT retry on unrelated primary errors', async () => {
    const { admin, calls } = makeAdmin([
      { data: null, error: { message: 'permission denied for table clients' } },
    ]);

    const result = await selectClientsWithRosterVisibility(admin, { select: 'id' });

    expect(result.data).toEqual([]);
    expect(result.error).toEqual({ message: 'permission denied for table clients' });
    expect(calls).toHaveLength(1);
  });

  it('returns [] when primary succeeds with null data', async () => {
    const { admin } = makeAdmin([{ data: null, error: null }]);
    const result = await selectClientsWithRosterVisibility(admin, { select: 'id' });
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('respects descending orderBy', async () => {
    const { admin, calls } = makeAdmin([{ data: [], error: null }]);
    await selectClientsWithRosterVisibility(admin, {
      select: 'id',
      orderBy: { column: 'created_at', ascending: false },
    });
    expect(calls[0]!.filters).toContainEqual({
      kind: 'order',
      args: ['created_at', { ascending: false }],
    });
  });
});


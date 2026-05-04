import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientNotificationRecipients } from './notification-recipients';

/**
 * getClientNotificationRecipients is the single source-of-truth resolver
 * for "who should we email when X happens for client Y?" Every
 * transactional sender in the app (calendar share, drop approval,
 * editing project share) routes through it. Two contracts to pin:
 *
 *   1. Query shape: contacts table, scoped to client_id, with a NOT
 *      NULL filter on email — anything else and we'd send a "Hi (null)"
 *      email or a recipient list with empty strings.
 *
 *   2. Result shape: drops any rows with a falsy email defensively
 *      (the .not('email', 'is', null) filter already does this in
 *      Postgres, but the helper double-checks in case the caller hands
 *      in a stub that ignores filters), and preserves null names.
 */

interface QueryCall {
  table: string;
  select: string;
  eqArgs: [string, unknown];
  notArgs: [string, string, unknown];
}

function makeAdmin(rows: Array<{ email: string | null; name: string | null }>) {
  const calls: QueryCall = {
    table: '',
    select: '',
    eqArgs: ['', null],
    notArgs: ['', '', null],
  };
  const builder = {
    select: vi.fn((col: string) => {
      calls.select = col;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      calls.eqArgs = [col, val];
      return builder;
    }),
    not: vi.fn((col: string, op: string, val: unknown) => {
      calls.notArgs = [col, op, val];
      return builder;
    }),
    returns: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  const admin = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { admin, calls };
}

describe('getClientNotificationRecipients — query shape', () => {
  it('hits contacts table scoped to the given client_id', async () => {
    const { admin, calls } = makeAdmin([]);
    await getClientNotificationRecipients(admin, 'client-abc');
    expect(calls.table).toBe('contacts');
    expect(calls.eqArgs).toEqual(['client_id', 'client-abc']);
  });

  it('selects email + name only (no PII bloat)', async () => {
    const { admin, calls } = makeAdmin([]);
    await getClientNotificationRecipients(admin, 'client-abc');
    expect(calls.select).toBe('email, name');
  });

  it('filters out rows with NULL email at the database', async () => {
    const { admin, calls } = makeAdmin([]);
    await getClientNotificationRecipients(admin, 'client-abc');
    expect(calls.notArgs).toEqual(['email', 'is', null]);
  });
});

describe('getClientNotificationRecipients — result shape', () => {
  it('returns the recipients with email + name preserved', async () => {
    const { admin } = makeAdmin([
      { email: 'a@example.com', name: 'Alice' },
      { email: 'b@example.com', name: 'Bob' },
    ]);
    const out = await getClientNotificationRecipients(admin, 'c-1');
    expect(out).toEqual([
      { email: 'a@example.com', name: 'Alice' },
      { email: 'b@example.com', name: 'Bob' },
    ]);
  });

  it('preserves null name (caller may render fallback "there")', async () => {
    const { admin } = makeAdmin([{ email: 'a@example.com', name: null }]);
    const out = await getClientNotificationRecipients(admin, 'c-1');
    expect(out).toEqual([{ email: 'a@example.com', name: null }]);
  });

  it('returns [] when no rows match', async () => {
    const { admin } = makeAdmin([]);
    expect(await getClientNotificationRecipients(admin, 'c-1')).toEqual([]);
  });

  it('defensively drops rows with null email even if the DB returns them', async () => {
    // Belt-and-suspenders: the .not() filter already excludes these in
    // Postgres, but a faulty stub or future query change shouldn't be
    // able to send a "Hi (null)" email without this guard tripping.
    const { admin } = makeAdmin([
      { email: 'a@example.com', name: 'Alice' },
      { email: null, name: 'Ghost' },
      { email: '', name: 'Empty' },
    ]);
    const out = await getClientNotificationRecipients(admin, 'c-1');
    expect(out).toEqual([{ email: 'a@example.com', name: 'Alice' }]);
  });
});

describe('getClientNotificationRecipients — null/error handling', () => {
  it('returns [] when the query resolves with null data', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      not: vi.fn(() => builder),
      returns: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    const admin = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
    expect(await getClientNotificationRecipients(admin, 'c-1')).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientAllowsOverage } from './overage';

interface ClientRow {
  allow_silent_overage: boolean | null;
}

function makeAdmin(row: ClientRow | null, error?: { message: string }): {
  admin: SupabaseClient;
  fromMock: ReturnType<typeof vi.fn>;
  eqMock: ReturnType<typeof vi.fn>;
} {
  const maybeSingle = vi.fn(async () => ({
    data: row,
    error: error ?? null,
  }));
  const eqMock = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn((table: string) => {
    if (table !== 'clients') throw new Error(`unexpected table: ${table}`);
    return { select };
  });
  const admin = { from: fromMock } as unknown as SupabaseClient;
  return { admin, fromMock, eqMock };
}

describe('clientAllowsOverage', () => {
  it('returns true ONLY when allow_silent_overage is exactly true', async () => {
    const { admin } = makeAdmin({ allow_silent_overage: true });
    expect(await clientAllowsOverage(admin, 'client-1', 'type-1')).toBe(true);
  });

  it('returns false when the column is explicitly false', async () => {
    const { admin } = makeAdmin({ allow_silent_overage: false });
    expect(await clientAllowsOverage(admin, 'client-1', 'type-1')).toBe(false);
  });

  it('returns false when the column is null (default)', async () => {
    const { admin } = makeAdmin({ allow_silent_overage: null });
    expect(await clientAllowsOverage(admin, 'client-1', 'type-1')).toBe(false);
  });

  it('returns false when the client row is missing entirely', async () => {
    const { admin } = makeAdmin(null);
    expect(await clientAllowsOverage(admin, 'missing', 'type-1')).toBe(false);
  });

  it('queries the clients table and filters by id', async () => {
    const { admin, fromMock, eqMock } = makeAdmin({
      allow_silent_overage: true,
    });
    await clientAllowsOverage(admin, 'client-42', 'type-1');
    expect(fromMock).toHaveBeenCalledWith('clients');
    expect(eqMock).toHaveBeenCalledWith('id', 'client-42');
  });

  it('returns false even when the deliverable type id is provided (Phase D placeholder)', async () => {
    // Per the source comment, _deliverableTypeId is reserved for Phase D+1
    // and must not influence the result today.
    const { admin } = makeAdmin({ allow_silent_overage: false });
    expect(await clientAllowsOverage(admin, 'client-1', 'type-edited')).toBe(false);
    expect(await clientAllowsOverage(admin, 'client-1', 'type-ugc')).toBe(false);
  });
});

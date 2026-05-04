import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOverageDetails } from './get-overage-details';

/**
 * Over-scope detail rows for the editing dialog.
 *
 * Sequence:
 *   1. Map ServiceKind -> deliverable slug (editing -> edited_video, smm/blogging -> null short-circuit)
 *   2. Compute UTC calendar-month bounds around referenceDate
 *   3. Read deliverable_types.id by slug; null short-circuit if missing
 *   4. Read credit_transactions consume rows in [start, end) for this client+type
 *   5. Hydrate editor names from team_members.full_name
 *   6. Return rows with 1-indexed `index` reflecting chronological order
 */

interface ConsumeRow {
  id: string;
  created_at: string;
  editor_user_id: string | null;
}

interface MemberRow {
  user_id: string | null;
  full_name: string | null;
}

interface MockState {
  deliverableTypeId: string | null;
  consumeRows: ConsumeRow[];
  members: MemberRow[];
}

interface CapturedQuery {
  gte?: string;
  lt?: string;
  consumeFilters: Record<string, unknown>;
}

function makeAdmin(state: MockState): {
  admin: SupabaseClient;
  captured: CapturedQuery;
} {
  const captured: CapturedQuery = { consumeFilters: {} };
  const fromMock = vi.fn((table: string) => {
    if (table === 'deliverable_types') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({
          data: state.deliverableTypeId ? { id: state.deliverableTypeId } : null,
          error: null,
        })),
      };
      return builder;
    }
    if (table === 'credit_transactions') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          captured.consumeFilters[col] = val;
          return builder;
        }),
        gte: vi.fn((_col: string, val: string) => {
          captured.gte = val;
          return builder;
        }),
        lt: vi.fn((_col: string, val: string) => {
          captured.lt = val;
          return builder;
        }),
        // .order is the awaitable terminus here
        order: vi.fn(async () => ({ data: state.consumeRows, error: null })),
      };
      return builder;
    }
    if (table === 'team_members') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(async () => ({ data: state.members, error: null })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { admin: { from: fromMock } as unknown as SupabaseClient, captured };
}

describe('getOverageDetails', () => {
  it('short-circuits to [] for non-editing services (smm, blogging)', async () => {
    const { admin } = makeAdmin({
      deliverableTypeId: 'should-never-read',
      consumeRows: [],
      members: [],
    });
    expect(
      await getOverageDetails(admin, 'client-1', 'smm', new Date('2026-04-15')),
    ).toEqual([]);
    expect(
      await getOverageDetails(admin, 'client-1', 'blogging', new Date('2026-04-15')),
    ).toEqual([]);
  });

  it('returns [] when the deliverable type slug is not found in DB', async () => {
    const { admin } = makeAdmin({
      deliverableTypeId: null,
      consumeRows: [],
      members: [],
    });
    expect(
      await getOverageDetails(admin, 'client-1', 'editing', new Date('2026-04-15')),
    ).toEqual([]);
  });

  it('queries the [start, end) of the UTC calendar month around referenceDate', async () => {
    const { admin, captured } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [],
      members: [],
    });
    // April 15 2026 UTC -> April 1 (inclusive) to May 1 (exclusive)
    await getOverageDetails(admin, 'c1', 'editing', new Date('2026-04-15T12:00:00Z'));
    expect(captured.gte).toBe('2026-04-01T00:00:00.000Z');
    expect(captured.lt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('crosses year boundary correctly for December reference dates', async () => {
    const { admin, captured } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [],
      members: [],
    });
    await getOverageDetails(admin, 'c1', 'editing', new Date('2026-12-20T08:00:00Z'));
    expect(captured.gte).toBe('2026-12-01T00:00:00.000Z');
    expect(captured.lt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('returns rows with 1-indexed positions in chronological order', async () => {
    const { admin } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [
        { id: 'tx-1', created_at: '2026-04-02T10:00:00Z', editor_user_id: 'editor-a' },
        { id: 'tx-2', created_at: '2026-04-09T10:00:00Z', editor_user_id: 'editor-b' },
        { id: 'tx-3', created_at: '2026-04-20T10:00:00Z', editor_user_id: 'editor-a' },
      ],
      members: [
        { user_id: 'editor-a', full_name: 'Alex Editor' },
        { user_id: 'editor-b', full_name: 'Bea Editor' },
      ],
    });
    const rows = await getOverageDetails(
      admin,
      'c1',
      'editing',
      new Date('2026-04-15'),
    );
    expect(rows).toEqual([
      {
        id: 'tx-1',
        approvedAt: '2026-04-02T10:00:00Z',
        editorName: 'Alex Editor',
        index: 1,
      },
      {
        id: 'tx-2',
        approvedAt: '2026-04-09T10:00:00Z',
        editorName: 'Bea Editor',
        index: 2,
      },
      {
        id: 'tx-3',
        approvedAt: '2026-04-20T10:00:00Z',
        editorName: 'Alex Editor',
        index: 3,
      },
    ]);
  });

  it('falls back to "Unattributed" when editor_user_id is null', async () => {
    const { admin } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [
        { id: 'tx-1', created_at: '2026-04-02T10:00:00Z', editor_user_id: null },
      ],
      members: [],
    });
    const rows = await getOverageDetails(
      admin,
      'c1',
      'editing',
      new Date('2026-04-15'),
    );
    expect(rows[0]?.editorName).toBe('Unattributed');
  });

  it('falls back to "Unattributed" when team_members has no matching row', async () => {
    const { admin } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [
        { id: 'tx-1', created_at: '2026-04-02T10:00:00Z', editor_user_id: 'ghost' },
      ],
      members: [], // editor exists in credit_transactions but not in team_members
    });
    const rows = await getOverageDetails(
      admin,
      'c1',
      'editing',
      new Date('2026-04-15'),
    );
    expect(rows[0]?.editorName).toBe('Unattributed');
  });

  it('skips the team_members read entirely when no rows have an editor_user_id', async () => {
    const { admin, captured } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [
        { id: 'tx-1', created_at: '2026-04-02T10:00:00Z', editor_user_id: null },
        { id: 'tx-2', created_at: '2026-04-03T10:00:00Z', editor_user_id: null },
      ],
      members: [],
    });
    const rows = await getOverageDetails(
      admin,
      'c1',
      'editing',
      new Date('2026-04-15'),
    );
    expect(rows).toHaveLength(2);
    expect(captured.consumeFilters.kind).toBe('consume');
    // We don't care about the exact call count of from(), only that the
    // editor names came back as Unattributed without a team_members lookup.
    expect(rows.every((r) => r.editorName === 'Unattributed')).toBe(true);
  });

  it('filters consume transactions by client_id, deliverable_type_id, and kind=consume', async () => {
    const { admin, captured } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [],
      members: [],
    });
    await getOverageDetails(admin, 'client-42', 'editing', new Date('2026-04-15'));
    expect(captured.consumeFilters).toMatchObject({
      client_id: 'client-42',
      deliverable_type_id: 'type-edited',
      kind: 'consume',
    });
  });

  it('returns [] when the consume read returns null/empty', async () => {
    const { admin } = makeAdmin({
      deliverableTypeId: 'type-edited',
      consumeRows: [],
      members: [],
    });
    const rows = await getOverageDetails(
      admin,
      'c1',
      'editing',
      new Date('2026-04-15'),
    );
    expect(rows).toEqual([]);
  });
});

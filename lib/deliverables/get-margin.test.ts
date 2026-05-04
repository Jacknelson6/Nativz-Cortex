import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEditorMargin } from './get-margin';

/**
 * Margin loader contract under test.
 *
 *   1. Hours are clamped to [0.25, 8] per drop_video row, computed from
 *      revised_video_uploaded_at minus created_at.
 *   2. Drop videos with no revision timestamp fall back to the 0.25h floor.
 *   3. Non-drop_video charge_unit_kind rows always cost 0.25h (we have
 *      no better signal).
 *   4. Editors without a cost_rate_cents_per_hour return costCents=null,
 *      marginCents=null, rateMissing=true. They never contribute to the
 *      cost/margin totals (totals only sum non-null rows).
 *   5. Output is sorted highest-margin-first; rate-missing rows always
 *      sink to the bottom regardless of revenue.
 *   6. Empty consume read short-circuits to zeroed totals (no follow-up
 *      reads).
 */

interface ConsumeRow {
  editor_user_id: string;
  charge_unit_kind: string;
  charge_unit_id: string;
  deliverable_type_id: string;
}

interface TypeRow {
  id: string;
  unit_cost_cents: number;
}

interface MemberRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  cost_rate_cents_per_hour: number | null;
}

interface DropVideoRow {
  id: string;
  created_at: string;
  revised_video_uploaded_at: string | null;
}

interface MockState {
  consumes: ConsumeRow[];
  types: TypeRow[];
  members: MemberRow[];
  videos: DropVideoRow[];
}

function makeAdmin(state: MockState): {
  admin: SupabaseClient;
  callCount: () => number;
} {
  let totalReads = 0;
  const fromMock = vi.fn((table: string) => {
    totalReads++;
    if (table === 'credit_transactions') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lte: vi.fn(() => builder),
        not: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.consumes, error: null })),
      };
      return builder;
    }
    if (table === 'deliverable_types') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.types, error: null })),
      };
      return builder;
    }
    if (table === 'team_members') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.members, error: null })),
      };
      return builder;
    }
    if (table === 'content_drop_videos') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: state.videos, error: null })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return {
    admin: { from: fromMock } as unknown as SupabaseClient,
    callCount: () => totalReads,
  };
}

const PERIOD_START = '2026-04-01T00:00:00Z';
const PERIOD_END = '2026-04-30T23:59:59Z';

describe('getEditorMargin', () => {
  it('returns zeroed totals and skips follow-up reads when there are no consume rows', async () => {
    const { admin, callCount } = makeAdmin({
      consumes: [],
      types: [],
      members: [],
      videos: [],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows).toEqual([]);
    expect(snap.totals).toEqual({
      deliverables: 0,
      estimatedHours: 0,
      costCents: 0,
      revenueCents: 0,
      marginCents: 0,
    });
    expect(snap.periodStart).toBe(PERIOD_START);
    expect(snap.periodEnd).toBe(PERIOD_END);
    // Only credit_transactions should be read.
    expect(callCount()).toBe(1);
  });

  it('clamps drop_video hours to [0.25, 8] using created_at -> revised_video_uploaded_at', async () => {
    // 4h elapsed - inside the band, kept as-is.
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'video-1',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 10000 }],
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 5000,
        },
      ],
      videos: [
        {
          id: 'video-1',
          created_at: '2026-04-10T08:00:00Z',
          revised_video_uploaded_at: '2026-04-10T12:00:00Z',
        },
      ],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.estimatedHours).toBe(4);
    // 4h * 5000c/h = 20000c cost, 10000c revenue -> -10000c margin.
    expect(snap.rows[0]?.costCents).toBe(20000);
    expect(snap.rows[0]?.marginCents).toBe(-10000);
  });

  it('caps hours at 8 when the elapsed window exceeds the ceiling', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'video-marathon',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 1000 }],
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 100,
        },
      ],
      videos: [
        {
          id: 'video-marathon',
          // 48h apart -> clamped to 8h.
          created_at: '2026-04-10T00:00:00Z',
          revised_video_uploaded_at: '2026-04-12T00:00:00Z',
        },
      ],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.estimatedHours).toBe(8);
  });

  it('floors hours at 0.25 when the revision timestamp is before created_at', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'video-skewed',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 1000 }],
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 100,
        },
      ],
      videos: [
        {
          id: 'video-skewed',
          created_at: '2026-04-10T12:00:00Z',
          revised_video_uploaded_at: '2026-04-10T11:00:00Z', // negative elapsed
        },
      ],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.estimatedHours).toBe(0.3);
  });

  it('falls back to the 0.25h floor when revised_video_uploaded_at is null', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'video-pending',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 1000 }],
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 100,
        },
      ],
      videos: [
        {
          id: 'video-pending',
          created_at: '2026-04-10T08:00:00Z',
          revised_video_uploaded_at: null,
        },
      ],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.estimatedHours).toBe(0.3);
  });

  it('uses the 0.25h floor for non-drop_video charge_unit_kind rows', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-1',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 5000 }],
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 4000,
        },
      ],
      videos: [], // no drop_video lookup needed
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.estimatedHours).toBe(0.3);
    // 0.25h * 4000c = 1000c cost, 5000c revenue -> 4000c margin.
    expect(snap.rows[0]?.costCents).toBe(1000);
    expect(snap.rows[0]?.marginCents).toBe(4000);
  });

  it('marks rateMissing=true and leaves cost/margin null when team_members has no rate', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-rateless',
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'video-1',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 7777 }],
      members: [
        {
          user_id: 'editor-rateless',
          full_name: 'Rateless Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: null,
        },
      ],
      videos: [
        {
          id: 'video-1',
          created_at: '2026-04-10T08:00:00Z',
          revised_video_uploaded_at: '2026-04-10T10:00:00Z',
        },
      ],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.rateMissing).toBe(true);
    expect(snap.rows[0]?.costCents).toBeNull();
    expect(snap.rows[0]?.marginCents).toBeNull();
    expect(snap.rows[0]?.revenueCents).toBe(7777);
  });

  it('omits rate-missing rows from cost/margin totals but keeps revenue and deliverable counts', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-rated',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-1',
          deliverable_type_id: 'type-edited',
        },
        {
          editor_user_id: 'editor-rateless',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-2',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 1000 }],
      members: [
        {
          user_id: 'editor-rated',
          full_name: 'Rated',
          avatar_url: null,
          cost_rate_cents_per_hour: 4000,
        },
        {
          user_id: 'editor-rateless',
          full_name: 'Rateless',
          avatar_url: null,
          cost_rate_cents_per_hour: null,
        },
      ],
      videos: [],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.totals.revenueCents).toBe(2000);
    expect(snap.totals.deliverables).toBe(2);
    // Only the rated editor contributes: 0.25h * 4000c = 1000c.
    expect(snap.totals.costCents).toBe(1000);
    expect(snap.totals.marginCents).toBe(0); // 1000 revenue - 1000 cost
  });

  it('sorts rows highest-margin-first and sinks rate-missing rows to the bottom', async () => {
    const { admin } = makeAdmin({
      consumes: [
        // Rate-missing editor with massive revenue, must still sink.
        {
          editor_user_id: 'editor-rateless',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-rm',
          deliverable_type_id: 'type-pricey',
        },
        // Low-margin rated editor.
        {
          editor_user_id: 'editor-low',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-low',
          deliverable_type_id: 'type-cheap',
        },
        // High-margin rated editor.
        {
          editor_user_id: 'editor-high',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-high',
          deliverable_type_id: 'type-pricey',
        },
      ],
      types: [
        { id: 'type-pricey', unit_cost_cents: 9999 },
        { id: 'type-cheap', unit_cost_cents: 100 },
      ],
      members: [
        {
          user_id: 'editor-rateless',
          full_name: 'No Rate',
          avatar_url: null,
          cost_rate_cents_per_hour: null,
        },
        {
          user_id: 'editor-low',
          full_name: 'Low Margin',
          avatar_url: null,
          cost_rate_cents_per_hour: 1000,
        },
        {
          user_id: 'editor-high',
          full_name: 'High Margin',
          avatar_url: null,
          cost_rate_cents_per_hour: 1000,
        },
      ],
      videos: [],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows.map((r) => r.editorUserId)).toEqual([
      'editor-high',
      'editor-low',
      'editor-rateless',
    ]);
  });

  it('falls back to "Unknown editor" when team_members has no row for the editor_user_id', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-ghost',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-1',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 1000 }],
      members: [], // ghost editor has no team_members row
      videos: [],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.fullName).toBe('Unknown editor');
    expect(snap.rows[0]?.rateMissing).toBe(true);
    expect(snap.rows[0]?.costCents).toBeNull();
  });

  it('aggregates multiple consume rows for the same editor into one output row', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-1',
          deliverable_type_id: 'type-edited',
        },
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-2',
          deliverable_type_id: 'type-edited',
        },
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-3',
          deliverable_type_id: 'type-edited',
        },
      ],
      types: [{ id: 'type-edited', unit_cost_cents: 1000 }],
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 4000,
        },
      ],
      videos: [],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0]?.deliverables).toBe(3);
    expect(snap.rows[0]?.revenueCents).toBe(3000);
    // 3 * 0.25h = 0.75h * 4000c = 3000c cost
    expect(snap.rows[0]?.estimatedHours).toBe(0.8);
    expect(snap.rows[0]?.costCents).toBe(3000);
  });

  it('treats unknown deliverable_type_id as zero revenue (no leak from costByTypeId Map)', async () => {
    const { admin } = makeAdmin({
      consumes: [
        {
          editor_user_id: 'editor-a',
          charge_unit_kind: 'manual_adjust',
          charge_unit_id: 'adj-1',
          deliverable_type_id: 'type-mystery', // not in deliverable_types
        },
      ],
      types: [], // empty
      members: [
        {
          user_id: 'editor-a',
          full_name: 'Alex Editor',
          avatar_url: null,
          cost_rate_cents_per_hour: 4000,
        },
      ],
      videos: [],
    });
    const snap = await getEditorMargin(admin, 'c1', PERIOD_START, PERIOD_END);
    expect(snap.rows[0]?.revenueCents).toBe(0);
    // 0 revenue - 1000 cost = -1000
    expect(snap.rows[0]?.marginCents).toBe(-1000);
  });
});

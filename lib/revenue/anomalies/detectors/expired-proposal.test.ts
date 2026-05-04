import { describe, expect, it, vi } from 'vitest';
import { expiredProposalDetector } from './expired-proposal';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * expiredProposalDetector flags proposals stuck in 'sent' or 'viewed' past
 * their expires_at. The daily reconcile cron normally flips them; if this
 * detector fires, the cron is probably broken. Three contracts to pin:
 *
 *   1. The "now" boundary is computed at detect-time, not at module load.
 *      A frozen cutoff would let stale proposals slip through after the
 *      cron's first invocation.
 *
 *   2. Only proposals whose status is exactly 'sent' or 'viewed' qualify.
 *      The query filters via .in([...]); the test pins this so a future
 *      "draft" or "accepted" status wouldn't accidentally surface here.
 *
 *   3. The finding payload carries `slug` + `expires_at` in metadata. The
 *      admin UI links out via slug; a regression that dropped it would
 *      render an unclickable row.
 */

type Proposal = {
  id: string;
  slug: string;
  title: string;
  status: string;
  expires_at: string;
  client_id: string;
};

function buildAdmin(rows: Proposal[] | null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const limit = vi.fn().mockResolvedValue({ data: rows });
  const lt = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'lt', args });
    return { limit };
  });
  const inFn = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'in', args });
    return { lt };
  });
  const select = vi.fn().mockReturnValue({ in: inFn });
  const from = vi.fn().mockImplementation((table: string) => {
    calls.push({ method: 'from', args: [table] });
    return { select };
  });
  const admin = { from } as unknown as SupabaseClient;
  return { admin, calls, limit };
}

describe('expiredProposalDetector — registry metadata', () => {
  it('exposes id expired_proposal at info severity', () => {
    expect(expiredProposalDetector.id).toBe('expired_proposal');
    expect(expiredProposalDetector.severity).toBe('info');
  });
});

describe('expiredProposalDetector — query shape', () => {
  it('queries the proposals table filtered by status in [sent, viewed] and expires_at < now', async () => {
    const { admin, calls } = buildAdmin([]);
    await expiredProposalDetector.detect(admin);

    const fromCall = calls.find((c) => c.method === 'from');
    const inCall = calls.find((c) => c.method === 'in');
    const ltCall = calls.find((c) => c.method === 'lt');

    expect(fromCall?.args[0]).toBe('proposals');
    expect(inCall?.args[0]).toBe('status');
    expect(inCall?.args[1]).toEqual(['sent', 'viewed']);
    expect(ltCall?.args[0]).toBe('expires_at');
    // Cutoff is the current ISO time; assert it's a valid ISO string roughly = now.
    const cutoff = ltCall?.args[1] as string;
    expect(typeof cutoff).toBe('string');
    expect(Number.isFinite(Date.parse(cutoff))).toBe(true);
    expect(Math.abs(Date.parse(cutoff) - Date.now())).toBeLessThan(5_000);
  });
});

describe('expiredProposalDetector — detect()', () => {
  it('returns [] when the query returns null (no rows / RLS blocked)', async () => {
    const { admin } = buildAdmin(null);
    expect(await expiredProposalDetector.detect(admin)).toEqual([]);
  });

  it('returns [] when no proposals are expired', async () => {
    const { admin } = buildAdmin([]);
    expect(await expiredProposalDetector.detect(admin)).toEqual([]);
  });

  it('maps every expired proposal to a finding with slug + expires_at metadata', async () => {
    const expires = '2026-04-01T00:00:00.000Z';
    const { admin } = buildAdmin([
      {
        id: 'p1',
        slug: 'acme-q2',
        title: 'Acme Q2 retainer',
        status: 'sent',
        expires_at: expires,
        client_id: 'c1',
      },
    ]);

    const out = await expiredProposalDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].entity_type).toBe('proposal');
    expect(out[0].entity_id).toBe('p1');
    expect(out[0].client_id).toBe('c1');
    expect(out[0].title).toContain('Acme Q2 retainer');
    expect(out[0].title).toContain("'sent'");
    expect(out[0].metadata).toMatchObject({ slug: 'acme-q2', expires_at: expires });
  });

  it('preserves the actual status (sent vs viewed) in the title', async () => {
    const { admin } = buildAdmin([
      {
        id: 'p2',
        slug: 'beta',
        title: 'Beta deal',
        status: 'viewed',
        expires_at: '2026-04-01T00:00:00.000Z',
        client_id: 'c2',
      },
    ]);
    const out = await expiredProposalDetector.detect(admin);
    expect(out[0].title).toContain("'viewed'");
  });
});

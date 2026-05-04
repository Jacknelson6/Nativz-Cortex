import { describe, expect, it, vi } from 'vitest';
import { webhookBacklogDetector } from './webhook-backlog';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * webhookBacklogDetector flags Stripe events stuck unprocessed for 10+
 * minutes — money-adjacent state that hasn't landed. Three contracts to
 * pin:
 *
 *   1. The 10-minute cutoff is computed at detect-time. A frozen module-
 *      level cutoff would silently expand the window every cron tick and
 *      stop catching new backlogs after the first hour.
 *
 *   2. Findings include a humanized "Xmin ago" / "Xh ago" / "Xd ago" age
 *      directly in the title. The admin UI displays this string raw; a
 *      regression to "NaN min ago" would be visible but uninvestigable.
 *
 *   3. When `processing_error` is null, the description points at "the
 *      dispatcher may have crashed silently" rather than the literal null.
 *      Operators triage from this string — silent-null would mask the
 *      most severe class of failure.
 */

type Event = {
  id: string;
  type: string;
  received_at: string | null;
  processing_error: string | null;
};

function buildAdmin(rows: Event[] | null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const limit = vi.fn().mockResolvedValue({ data: rows });
  const lt = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'lt', args });
    return { limit };
  });
  const isFn = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'is', args });
    return { lt };
  });
  const select = vi.fn().mockReturnValue({ is: isFn });
  const from = vi.fn().mockImplementation((table: string) => {
    calls.push({ method: 'from', args: [table] });
    return { select };
  });
  return {
    admin: { from } as unknown as SupabaseClient,
    calls,
  };
}

describe('webhookBacklogDetector — registry metadata', () => {
  it('exposes id webhook_backlog at error severity', () => {
    expect(webhookBacklogDetector.id).toBe('webhook_backlog');
    expect(webhookBacklogDetector.severity).toBe('error');
  });
});

describe('webhookBacklogDetector — query shape', () => {
  it('queries stripe_events filtered by processed_at IS NULL and received_at < (now - 10min)', async () => {
    const { admin, calls } = buildAdmin([]);
    await webhookBacklogDetector.detect(admin);

    expect(calls.find((c) => c.method === 'from')?.args[0]).toBe('stripe_events');

    const isCall = calls.find((c) => c.method === 'is');
    expect(isCall?.args[0]).toBe('processed_at');
    expect(isCall?.args[1]).toBeNull();

    const ltCall = calls.find((c) => c.method === 'lt');
    expect(ltCall?.args[0]).toBe('received_at');
    const cutoff = ltCall?.args[1] as string;
    expect(typeof cutoff).toBe('string');
    // Cutoff should be ~10 minutes in the past (allow some test-runner slack).
    const skew = Date.now() - Date.parse(cutoff);
    expect(skew).toBeGreaterThan(10 * 60 * 1000 - 5_000);
    expect(skew).toBeLessThan(10 * 60 * 1000 + 5_000);
  });
});

describe('webhookBacklogDetector — detect()', () => {
  it('returns [] when the query returns null', async () => {
    const { admin } = buildAdmin(null);
    expect(await webhookBacklogDetector.detect(admin)).toEqual([]);
  });

  it('returns [] when no events are backlogged', async () => {
    const { admin } = buildAdmin([]);
    expect(await webhookBacklogDetector.detect(admin)).toEqual([]);
  });

  it('renders a "Xmin ago" age string when receipt is recent (<60min)', async () => {
    const receivedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { admin } = buildAdmin([
      {
        id: 'evt_1',
        type: 'invoice.paid',
        received_at: receivedAt,
        processing_error: null,
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain('invoice.paid');
    expect(out[0].title).toMatch(/15min ago/);
  });

  it('renders a "Xh ago" age string when receipt is hours old (<24h)', async () => {
    const receivedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { admin } = buildAdmin([
      {
        id: 'evt_2',
        type: 'customer.created',
        received_at: receivedAt,
        processing_error: 'TypeError: Cannot read properties of undefined',
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].title).toMatch(/3h ago/);
  });

  it('renders a "Xd ago" age string when receipt is days old', async () => {
    const receivedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { admin } = buildAdmin([
      {
        id: 'evt_3',
        type: 'subscription.deleted',
        received_at: receivedAt,
        processing_error: null,
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].title).toMatch(/2d ago/);
  });

  it('renders an em-dash placeholder when received_at is null', async () => {
    // Defensive: the row schema lets received_at be null. A frozen "NaN" or
    // "Invalid Date" here would show up in the admin alerts UI.
    const { admin } = buildAdmin([
      {
        id: 'evt_4',
        type: 'invoice.paid',
        received_at: null,
        processing_error: null,
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].title).toContain('—');
    expect(out[0].title).not.toMatch(/NaN|Invalid/);
  });

  it('uses the processing_error in the description when present', async () => {
    const { admin } = buildAdmin([
      {
        id: 'evt_5',
        type: 'invoice.paid',
        received_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        processing_error: 'duplicate key value violates unique constraint',
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].description).toContain('duplicate key value');
  });

  it('falls back to "dispatcher may have crashed silently" when processing_error is null', async () => {
    const { admin } = buildAdmin([
      {
        id: 'evt_6',
        type: 'invoice.paid',
        received_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        processing_error: null,
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].description).toMatch(/crashed silently/);
  });

  it('every finding has client_id=null (events are not pre-attributed to a client)', async () => {
    // The webhook-backlog detector intentionally surfaces events without a
    // client link — they're just "money-adjacent state that hasn't landed."
    const { admin } = buildAdmin([
      {
        id: 'evt_7',
        type: 'invoice.paid',
        received_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        processing_error: null,
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].client_id).toBeNull();
    expect(out[0].entity_type).toBe('stripe_event');
    expect(out[0].entity_id).toBe('evt_7');
  });

  it('preserves received_at + processing_error in metadata', async () => {
    const receivedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { admin } = buildAdmin([
      {
        id: 'evt_8',
        type: 'invoice.paid',
        received_at: receivedAt,
        processing_error: 'boom',
      },
    ]);
    const out = await webhookBacklogDetector.detect(admin);
    expect(out[0].metadata).toMatchObject({
      received_at: receivedAt,
      processing_error: 'boom',
    });
  });
});

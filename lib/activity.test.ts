import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `logActivity` writes to the `activity_log` table on every meaningful
 * mutation in the admin dashboard (search runs, idea saves, client
 * edits, impersonation toggles). Three contracts to pin:
 *
 *   1. The row payload is the raw shape the audit page reads. A
 *      regression that renamed `actor_id` -> `user_id` (or any of the
 *      five fields) would silently produce blank rows in /admin/audit.
 *
 *   2. Activity logging never throws. The whole helper is wrapped in a
 *      try/catch that logs to the console; a Supabase outage or a malformed
 *      row must not break the calling mutation. A regression that pulled
 *      the await outside the try would let a single failed insert kill the
 *      mutation that triggered it.
 *
 *   3. metadata defaults to an empty object, not null/undefined. The
 *      activity_log.metadata column is JSONB NOT NULL with a {} default,
 *      and the audit page renders metadata directly. A regression that
 *      left it undefined would crash the page on row hydrate.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chain = any;

let inserted: Array<{ table: string; row: Record<string, unknown> }>;
let insertImpl: (row: Record<string, unknown>) => Promise<{ error: unknown }>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string): Chain => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return insertImpl(row);
      },
    }),
  }),
}));

let logActivity: typeof import('./activity').logActivity;

beforeEach(async () => {
  vi.resetModules();
  inserted = [];
  insertImpl = () => Promise.resolve({ error: null });
  ({ logActivity } = await import('./activity'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logActivity — payload shape', () => {
  it('writes to the activity_log table', async () => {
    await logActivity('actor-1', 'search.run', 'search', 'srch-1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('activity_log');
  });

  it('maps the four required columns from positional args', async () => {
    // Pin: the audit page reads actor_id / action / entity_type /
    // entity_id by literal column name. A rename here is a silent
    // regression that would blank the page.
    await logActivity('actor-1', 'idea.save', 'idea', 'idea-42');
    expect(inserted[0].row).toMatchObject({
      actor_id: 'actor-1',
      action: 'idea.save',
      entity_type: 'idea',
      entity_id: 'idea-42',
    });
  });

  it('defaults metadata to {} when omitted', async () => {
    // Pin: activity_log.metadata is JSONB NOT NULL, default '{}'. A
    // missing default would write NULL and crash the audit-page hydrate.
    await logActivity('actor-1', 'client.edit', 'client', 'c-1');
    expect(inserted[0].row.metadata).toEqual({});
  });

  it('passes metadata through verbatim when provided', async () => {
    const meta = { before: { name: 'old' }, after: { name: 'new' } };
    await logActivity('actor-1', 'client.edit', 'client', 'c-1', meta);
    expect(inserted[0].row.metadata).toEqual(meta);
  });

  it('accepts every documented entity_type', async () => {
    // Pin: the EntityType union is the contract the audit page filters
    // on. A new entity type added here without updating the union would
    // either fail TS or land an "unknown" row in production.
    const types = [
      'search',
      'client',
      'idea',
      'shoot',
      'report',
      'api_key',
      'user',
      'impersonation',
    ] as const;
    for (const t of types) {
      await logActivity('actor', 'noop', t, 'id-1');
    }
    expect(inserted.map((r) => r.row.entity_type)).toEqual([...types]);
  });
});

describe('logActivity — never throws (fire-and-forget contract)', () => {
  it('swallows errors returned via the supabase chain throwing synchronously', async () => {
    // The implementation does `await admin.from(...).insert(...)`; if
    // the chain throws (network blow-up, malformed config), the catch
    // block must absorb it.
    insertImpl = () => {
      throw new Error('connection refused');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(logActivity('actor', 'noop', 'search', 'id')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it('swallows errors returned via a rejected insert promise', async () => {
    insertImpl = () => Promise.reject(new Error('postgrest 500'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(logActivity('actor', 'noop', 'search', 'id')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it('does NOT crash when actor or entity ids are empty strings', async () => {
    // Defensive: callers occasionally pass '' for system actions or
    // pre-creation entities. Activity logging should still record the
    // attempt rather than throw.
    await expect(logActivity('', 'system.boot', 'user', '')).resolves.toBeUndefined();
    expect(inserted[0].row.actor_id).toBe('');
    expect(inserted[0].row.entity_id).toBe('');
  });
});

describe('logActivity — return value', () => {
  it('returns undefined on success (fire-and-forget, no return shape contract)', async () => {
    // Defensive: callers do not consume the return; assert undefined so
    // a future refactor that returned the row would force a deliberate
    // contract change.
    const result = await logActivity('actor', 'noop', 'search', 'id');
    expect(result).toBeUndefined();
  });
});

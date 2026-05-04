import { describe, expect, it, vi } from 'vitest';
import { kickoffDuplicateDetector } from './kickoff-duplicate';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * kickoffDuplicateDetector flags clients who received the kickoff email
 * more than once. The kickoff-once guard (migration 160 + clients.
 * kickoff_email_sent_at) prevents this going forward, but historical bad
 * sends sit in email_messages. Three contracts to pin:
 *
 *   1. Only rows with status='sent' AND type_key='onboarding' AND non-null
 *      client_id count. Drafts, bounced sends, and other type_keys must
 *      not contribute, otherwise we'd flag every client who got any email
 *      twice.
 *
 *   2. Clients with exactly ONE onboarding send are NOT flagged. Only
 *      `count > 1` qualifies. A regression from `>` to `>=` would alert
 *      on every onboarded client.
 *
 *   3. The client name is read from the joined `clients` row; when it's
 *      null/missing, the title falls back to "Unknown" rather than
 *      printing literal null/undefined into the admin UI.
 */

type EmailRow = {
  client_id: string | null;
  clients: { id: string; name: string | null } | null;
};

function buildAdmin(rows: EmailRow[] | null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const not = vi.fn().mockResolvedValue({ data: rows });
  const eqStatus = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'eq.status', args });
    return { not };
  });
  const eqType = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'eq.type_key', args });
    return { eq: eqStatus };
  });
  const select = vi.fn().mockReturnValue({ eq: eqType });
  const from = vi.fn().mockImplementation((table: string) => {
    calls.push({ method: 'from', args: [table] });
    return { select };
  });
  return { admin: { from } as unknown as SupabaseClient, calls };
}

function row(clientId: string | null, name: string | null = 'Acme'): EmailRow {
  return {
    client_id: clientId,
    clients: clientId ? { id: clientId, name } : null,
  };
}

describe('kickoffDuplicateDetector — registry metadata', () => {
  it('exposes id kickoff_duplicate at error severity', () => {
    expect(kickoffDuplicateDetector.id).toBe('kickoff_duplicate');
    expect(kickoffDuplicateDetector.severity).toBe('error');
  });
});

describe('kickoffDuplicateDetector — query shape', () => {
  it('queries email_messages filtered by type_key=onboarding, status=sent, client_id IS NOT NULL', async () => {
    const { admin, calls } = buildAdmin([]);
    await kickoffDuplicateDetector.detect(admin);

    expect(calls.find((c) => c.method === 'from')?.args[0]).toBe('email_messages');

    const typeEq = calls.find((c) => c.method === 'eq.type_key');
    expect(typeEq?.args).toEqual(['type_key', 'onboarding']);

    const statusEq = calls.find((c) => c.method === 'eq.status');
    expect(statusEq?.args).toEqual(['status', 'sent']);
  });
});

describe('kickoffDuplicateDetector — detect()', () => {
  it('returns [] when the query returns null', async () => {
    const { admin } = buildAdmin(null);
    expect(await kickoffDuplicateDetector.detect(admin)).toEqual([]);
  });

  it('returns [] when no onboarding emails were sent', async () => {
    const { admin } = buildAdmin([]);
    expect(await kickoffDuplicateDetector.detect(admin)).toEqual([]);
  });

  it('does NOT flag a client who received exactly one onboarding email', async () => {
    const { admin } = buildAdmin([row('c1')]);
    expect(await kickoffDuplicateDetector.detect(admin)).toEqual([]);
  });

  it('flags a client who received the kickoff email twice', async () => {
    const { admin } = buildAdmin([row('c1', 'Acme'), row('c1', 'Acme')]);
    const out = await kickoffDuplicateDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].entity_type).toBe('client');
    expect(out[0].entity_id).toBe('c1');
    expect(out[0].client_id).toBe('c1');
    expect(out[0].title).toContain('Acme');
    expect(out[0].title).toContain('2');
    expect(out[0].description).toContain('2 onboarding-typed sends');
  });

  it('reports the actual count when more than two duplicates exist', async () => {
    const { admin } = buildAdmin([
      row('c1', 'Acme'),
      row('c1', 'Acme'),
      row('c1', 'Acme'),
      row('c1', 'Acme'),
    ]);
    const out = await kickoffDuplicateDetector.detect(admin);
    expect(out[0].title).toContain('4');
    expect(out[0].description).toContain('4 onboarding-typed sends');
  });

  it('skips rows with NULL client_id (no client to attribute)', async () => {
    // Defensive: query already filters client_id IS NOT NULL, but the JS
    // pass also drops nulls. Pin so a future loosened query doesn't blow up.
    const { admin } = buildAdmin([
      row(null),
      row(null),
      row('c1', 'Acme'),
      row('c1', 'Acme'),
    ]);
    const out = await kickoffDuplicateDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].entity_id).toBe('c1');
  });

  it('falls back to "Unknown" when the joined client name is null', async () => {
    const { admin } = buildAdmin([row('c1', null), row('c1', null)]);
    const out = await kickoffDuplicateDetector.detect(admin);
    expect(out[0].title).toContain('Unknown');
    expect(out[0].title).not.toContain('null');
  });

  it('partitions: flags only the over-sent client when one was sent once and another twice', async () => {
    const { admin } = buildAdmin([
      row('once', 'Once Co'),
      row('twice', 'Twice Co'),
      row('twice', 'Twice Co'),
    ]);
    const out = await kickoffDuplicateDetector.detect(admin);
    expect(out.map((f) => f.entity_id)).toEqual(['twice']);
  });

  it('produces independent findings for multiple over-sent clients', async () => {
    const { admin } = buildAdmin([
      row('a', 'Alpha'),
      row('a', 'Alpha'),
      row('b', 'Beta'),
      row('b', 'Beta'),
      row('b', 'Beta'),
    ]);
    const out = await kickoffDuplicateDetector.detect(admin);
    expect(out.map((f) => f.entity_id).sort()).toEqual(['a', 'b']);
    const beta = out.find((f) => f.entity_id === 'b');
    expect(beta?.title).toContain('3');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveMergeContext } from './resolve-merge-context';

/**
 * resolveMergeContext builds the {{recipient}}/{{sender}}/{{client}}
 * merge dictionary every transactional sender renders into. The
 * subtle, breakable contract:
 *
 *   1. Recipient + sender fields pass through verbatim — these come
 *      from the caller's already-validated rows, so no hidden coercion
 *      should sneak in (don't trim, don't lowercase, don't fall back).
 *
 *   2. client.name is populated ONLY when the recipient has exactly
 *      one user_client_access row. Zero rows means there's no client
 *      to attribute to; multiple rows means the recipient belongs to
 *      several clients and picking one would be arbitrary, which is a
 *      data-leak surface (Hi Alice, your Acme drop is ready! when
 *      Alice is also a Beta contact).
 *
 *   3. Supabase returns the embedded `clients` relation as either an
 *      object or an array depending on the schema's PostgREST hints —
 *      both shapes need to resolve to the same name. A regression
 *      here drops the client name silently (renders {{client.name}}
 *      as empty in the email body).
 */

interface AccessRow {
  client_id: string;
  clients:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null;
}

function makeAdmin(rows: AccessRow[] | null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  const admin = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient;
  return { admin, builder };
}

const recipient = { id: 'r1', email: 'alice@example.com', full_name: 'Alice' };
const sender = { id: 's1', email: 'jack@nativz.io', full_name: 'Jack' };

describe('resolveMergeContext — recipient + sender passthrough', () => {
  it('passes recipient.full_name and recipient.email through unchanged', async () => {
    const { admin } = makeAdmin([]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.recipient).toEqual({
      full_name: 'Alice',
      email: 'alice@example.com',
    });
  });

  it('passes sender.full_name and sender.email through unchanged', async () => {
    const { admin } = makeAdmin([]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.sender).toEqual({
      full_name: 'Jack',
      email: 'jack@nativz.io',
    });
  });

  it('preserves null recipient/sender names rather than substituting a default', async () => {
    const { admin } = makeAdmin([]);
    const out = await resolveMergeContext(
      admin,
      { id: 'r1', email: null, full_name: null },
      { id: 's1', email: null, full_name: null },
    );
    expect(out.recipient).toEqual({ full_name: null, email: null });
    expect(out.sender).toEqual({ full_name: null, email: null });
  });
});

describe('resolveMergeContext — client name resolution', () => {
  it('returns null client name when the recipient has zero client access rows', async () => {
    const { admin } = makeAdmin([]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: null });
  });

  it('returns the client name when there is exactly one access row (object shape)', async () => {
    const { admin } = makeAdmin([
      { client_id: 'c1', clients: { name: 'Acme Co' } },
    ]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: 'Acme Co' });
  });

  it('returns the client name when PostgREST emits clients as an array', async () => {
    const { admin } = makeAdmin([
      { client_id: 'c1', clients: [{ name: 'Acme Co' }] },
    ]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: 'Acme Co' });
  });

  it('returns null when the embedded clients relation is null', async () => {
    const { admin } = makeAdmin([{ client_id: 'c1', clients: null }]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: null });
  });

  it('returns null when the embedded clients array is empty', async () => {
    const { admin } = makeAdmin([{ client_id: 'c1', clients: [] }]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: null });
  });

  it('returns null when the single clients row has a null name', async () => {
    const { admin } = makeAdmin([{ client_id: 'c1', clients: { name: null } }]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: null });
  });

  it('returns null client name when the recipient has 2+ access rows (no arbitrary pick)', async () => {
    const { admin } = makeAdmin([
      { client_id: 'c1', clients: { name: 'Acme Co' } },
      { client_id: 'c2', clients: { name: 'Beta Inc' } },
    ]);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: null });
  });

  it('returns null when the query resolves with null data (defensive default)', async () => {
    const { admin } = makeAdmin(null);
    const out = await resolveMergeContext(admin, recipient, sender);
    expect(out.client).toEqual({ name: null });
  });
});

describe('resolveMergeContext — query shape', () => {
  it('hits user_client_access scoped to recipient.id and selects clients(name)', async () => {
    const { admin, builder } = makeAdmin([]);
    await resolveMergeContext(admin, recipient, sender);
    expect(admin.from).toHaveBeenCalledWith('user_client_access');
    expect(builder.select).toHaveBeenCalledWith('client_id, clients(name)');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'r1');
  });
});

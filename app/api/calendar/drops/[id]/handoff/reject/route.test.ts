import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route-level tests for the SMM reject POST. See CUP-01 T08/T10.
 */

interface DropRow {
  id: string;
  handoff_state: string;
  handoff_history: unknown[] | null;
}

interface AdminState {
  drop: DropRow | null;
  capturedUpdate?: Record<string, unknown>;
}

const adminState = vi.hoisted(() => ({ drop: null } as AdminState));

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isAdmin: true,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authState.user } }) },
  }),
}));

vi.mock('@/lib/auth/permissions', () => ({
  isAdmin: async () => authState.isAdmin,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'content_drops') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: adminState.drop, error: adminState.drop ? null : { message: 'missing' } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            adminState.capturedUpdate = payload;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { POST } from './route';

const DROP_ID = '33333333-3333-3333-3333-333333333333';

function buildRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/calendar/drops/${DROP_ID}/handoff/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: DROP_ID }) };
}

beforeEach(() => {
  adminState.drop = null;
  adminState.capturedUpdate = undefined;
  authState.user = { id: 'user-admin-3' };
  authState.isAdmin = true;
});

describe('POST /api/calendar/drops/[id]/handoff/reject', () => {
  it('returns 400 when note is missing or empty', async () => {
    const res = await POST(buildRequest({ note: '' }), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 401 when no user is logged in', async () => {
    authState.user = null;
    const res = await POST(buildRequest({ note: 'nope' }), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not an admin', async () => {
    authState.isAdmin = false;
    const res = await POST(buildRequest({ note: 'nope' }), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 404 when drop is missing', async () => {
    adminState.drop = null;
    const res = await POST(buildRequest({ note: 'nope' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 409 when drop is in client_sent (already shipped)', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'client_sent', handoff_history: [] };
    const res = await POST(buildRequest({ note: 'nope' }), ctx());
    expect(res.status).toBe(409);
  });

  it('returns 409 when drop is in editing (nothing to reject yet)', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'editing', handoff_history: [] };
    const res = await POST(buildRequest({ note: 'nope' }), ctx());
    expect(res.status).toBe(409);
  });

  it('rejects smm_review -> smm_rejected (default targetState) and appends history', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'smm_review', handoff_history: [] };
    const res = await POST(buildRequest({ note: 'fix the captions' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drop.handoff_state).toBe('smm_rejected');
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({ state: 'smm_rejected', note: 'fix the captions' });
    expect(adminState.capturedUpdate?.handoff_state).toBe('smm_rejected');
  });

  it('rejects smm_approved -> editing when targetState is editing', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'smm_approved', handoff_history: [] };
    const res = await POST(buildRequest({ note: 'rebuild', targetState: 'editing' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drop.handoff_state).toBe('editing');
  });
});

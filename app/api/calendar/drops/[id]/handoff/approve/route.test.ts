import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route-level tests for the SMM approve POST. See CUP-01 T07/T10.
 */

interface DropRow {
  id: string;
  client_id: string;
  handoff_state: string;
  handoff_history: unknown[] | null;
  clients: { agency: string | null } | null;
}

interface AdminState {
  drop: DropRow | null;
  videos: { scheduled_post_id: string | null }[];
  reviewLinks: { id: string; post_id: string }[];
  insertError: { message: string } | null;
  capturedUpdates: Record<string, unknown>[];
}

const adminState = vi.hoisted(
  () => ({
    drop: null,
    videos: [],
    reviewLinks: [],
    insertError: null,
    capturedUpdates: [],
  } as AdminState),
);

const authState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  role: 'admin' as 'admin' | 'super_admin' | 'viewer',
}));

const mintCalls = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authState.user } }) },
  }),
}));

vi.mock('@/lib/auth/permissions', () => ({
  getUserAuth: async () =>
    authState.user
      ? {
          id: authState.user.id,
          role: authState.role,
          isSuperAdmin: authState.role === 'super_admin',
          organizationId: null,
        }
      : null,
}));

vi.mock('@/lib/calendar/share-link', () => ({
  mintOrRefreshShareLink: async (...args: unknown[]) => {
    mintCalls.calls.push(args[1]);
    return {
      id: 'link-1',
      token: 'tok-abc',
      expires_at: '2026-12-31T00:00:00Z',
      refreshed: false,
      cancelledOrphans: 0,
      unpublishableOrphans: 0,
    };
  },
}));

vi.mock('@/lib/agency/detect', () => ({
  getBrandFromAgency: () => 'nativz' as const,
}));

vi.mock('@/lib/agency/cortex-url', () => ({
  getCortexAppUrl: () => 'https://cortex.nativz.io',
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => buildAdminClient(),
}));

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === 'content_drops') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: adminState.drop, error: adminState.drop ? null : { message: 'missing' } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            adminState.capturedUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'content_drop_videos') {
        return {
          select: () => ({
            eq: () => ({
              not: async () => ({ data: adminState.videos, error: null }),
            }),
          }),
        };
      }
      if (table === 'post_review_links') {
        return {
          insert: () => ({
            select: async () => ({ data: adminState.reviewLinks, error: adminState.insertError }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

import { POST } from './route';

const DROP_ID = '22222222-2222-2222-2222-222222222222';

function buildRequest(body: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/api/calendar/drops/${DROP_ID}/handoff/approve`, {
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
  adminState.videos = [];
  adminState.reviewLinks = [];
  adminState.insertError = null;
  adminState.capturedUpdates = [];
  authState.user = { id: 'user-admin-2', email: 'jack@nativz.io' };
  authState.role = 'admin';
  mintCalls.calls = [];
});

describe('POST /api/calendar/drops/[id]/handoff/approve', () => {
  it('returns 401 when no user is logged in', async () => {
    authState.user = null;
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is a viewer', async () => {
    authState.role = 'viewer';
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 409 when drop is not in smm_review', async () => {
    adminState.drop = {
      id: DROP_ID,
      client_id: 'client-1',
      handoff_state: 'editing',
      handoff_history: [],
      clients: { agency: null },
    };
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
  });

  it('flips smm_review -> smm_approved without minting on default body', async () => {
    adminState.drop = {
      id: DROP_ID,
      client_id: 'client-1',
      handoff_state: 'smm_review',
      handoff_history: [{ state: 'smm_review', at: '2026-05-16T00:00:00Z', actor: 'editor' }],
      clients: { agency: null },
    };
    const res = await POST(buildRequest({ note: 'looks good' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drop.handoff_state).toBe('smm_approved');
    expect(body.shareLink).toBeUndefined();
    expect(body.history).toHaveLength(2);
    expect(body.history[1]).toMatchObject({ state: 'smm_approved', note: 'looks good' });
    expect(mintCalls.calls).toHaveLength(0);
  });

  it('mintAndSend mints a share link and flips to client_sent', async () => {
    adminState.drop = {
      id: DROP_ID,
      client_id: 'client-1',
      handoff_state: 'smm_review',
      handoff_history: [],
      clients: { agency: null },
    };
    adminState.videos = [{ scheduled_post_id: 'post-1' }, { scheduled_post_id: 'post-2' }];
    adminState.reviewLinks = [
      { id: 'rl-1', post_id: 'post-1' },
      { id: 'rl-2', post_id: 'post-2' },
    ];
    const res = await POST(
      buildRequest({ mintAndSend: true, clientMessage: 'ship it' }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drop.handoff_state).toBe('client_sent');
    expect(body.shareLink.token).toBe('tok-abc');
    expect(body.shareLink.url).toContain('/s/tok-abc');
    expect(mintCalls.calls).toHaveLength(1);
    expect(adminState.capturedUpdates.length).toBeGreaterThanOrEqual(2);
    const finalUpdate = adminState.capturedUpdates[adminState.capturedUpdates.length - 1];
    expect(finalUpdate.handoff_state).toBe('client_sent');
  });

  it('mintAndSend returns 409 when the drop has zero posts', async () => {
    adminState.drop = {
      id: DROP_ID,
      client_id: 'client-1',
      handoff_state: 'smm_review',
      handoff_history: [],
      clients: { agency: null },
    };
    adminState.videos = [];
    const res = await POST(buildRequest({ mintAndSend: true }), ctx());
    expect(res.status).toBe(409);
  });
});

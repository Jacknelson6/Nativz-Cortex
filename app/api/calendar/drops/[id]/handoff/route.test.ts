import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route-level tests for the editor handoff POST. See CUP-01 T06/T10.
 * We mock the supabase server + admin clients + isAdmin so the handler
 * can exercise its happy + failure branches without a real DB.
 */

type FromTable =
  | 'content_drops'
  | 'content_drop_videos';

interface DropRow {
  id: string;
  handoff_state: string;
  handoff_history: unknown[] | null;
}

interface VideoRow {
  scheduled_post_id: string | null;
  scheduled_posts: { status: string } | null;
}

interface AdminState {
  drop: DropRow | null;
  videos: VideoRow[];
  updateError: { message: string } | null;
  capturedUpdate?: Record<string, unknown>;
}

const adminState = vi.hoisted(
  () => ({ drop: null, videos: [], updateError: null } as AdminState),
);

const authState = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
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
  createAdminClient: () => buildAdminClient(),
}));

function buildAdminClient() {
  return {
    from(table: FromTable) {
      if (table === 'content_drops') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: adminState.drop, error: adminState.drop ? null : { message: 'missing' } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            adminState.capturedUpdate = payload;
            return { eq: async () => ({ error: adminState.updateError }) };
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
      throw new Error(`unexpected table ${table}`);
    },
  };
}

import { POST } from './route';

const DROP_ID = '11111111-1111-1111-1111-111111111111';

function buildRequest(body: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/api/calendar/drops/${DROP_ID}/handoff`, {
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
  adminState.updateError = null;
  adminState.capturedUpdate = undefined;
  authState.user = { id: 'user-admin-1', email: 'jack@nativz.io' };
  authState.isAdmin = true;
});

describe('POST /api/calendar/drops/[id]/handoff', () => {
  it('returns 401 when no user is logged in', async () => {
    authState.user = null;
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not an admin', async () => {
    authState.isAdmin = false;
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 404 when the drop does not exist', async () => {
    adminState.drop = null;
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 409 when the drop is already past smm_review', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'client_sent', handoff_history: [] };
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.handoff_state).toBe('client_sent');
  });

  it('returns 409 when the drop has zero scheduled posts', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'editing', handoff_history: [] };
    adminState.videos = [];
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
  });

  it('returns 409 when every post is already published', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'editing', handoff_history: [] };
    adminState.videos = [
      { scheduled_post_id: 'p1', scheduled_posts: { status: 'published' } },
      { scheduled_post_id: 'p2', scheduled_posts: { status: 'published' } },
    ];
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
  });

  it('flips editing -> smm_review and appends history on the happy path', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'editing', handoff_history: [] };
    adminState.videos = [{ scheduled_post_id: 'p1', scheduled_posts: { status: 'pending' } }];
    const res = await POST(buildRequest({ note: 'ready for review' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drop.handoff_state).toBe('smm_review');
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({ state: 'smm_review', actor: 'user-admin-1', note: 'ready for review' });
    expect(adminState.capturedUpdate?.handoff_state).toBe('smm_review');
  });

  it('also flips smm_rejected -> smm_review (editor re-submit)', async () => {
    adminState.drop = { id: DROP_ID, handoff_state: 'smm_rejected', handoff_history: [] };
    adminState.videos = [{ scheduled_post_id: 'p1', scheduled_posts: { status: 'pending' } }];
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drop.handoff_state).toBe('smm_review');
  });
});

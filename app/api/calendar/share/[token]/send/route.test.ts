import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route-level tests for the share-link send POST guard (CUP-01 T09/T10).
 * Mocks every external dep so the handler can exercise:
 *   - 409 when drop is still in editing / smm_review / smm_rejected
 *   - happy path that flips drop -> client_sent and stamps history
 *   - idempotent re-send when drop is already client_sent
 */

interface ShareLinkRow {
  id: string;
  drop_id: string;
  expires_at: string;
  first_sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  included_post_ids: string[];
}

interface DropRow {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  handoff_state: string;
  handoff_history: unknown[] | null;
  clients: { id: string; name: string; agency: string | null } | null;
}

interface AdminState {
  link: ShareLinkRow | null;
  drop: DropRow | null;
  capturedDropUpdates: Record<string, unknown>[];
  capturedLinkUpdates: Record<string, unknown>[];
}

const adminState = vi.hoisted(
  () => ({
    link: null,
    drop: null,
    capturedDropUpdates: [],
    capturedLinkUpdates: [],
  } as AdminState),
);

const authState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  isAdmin: true,
}));

const resendState = vi.hoisted(() => ({
  shouldSucceed: true,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authState.user } }) },
  }),
}));

vi.mock('@/lib/auth/permissions', () => ({
  isAdmin: async () => authState.isAdmin,
}));

vi.mock('@/lib/agency/detect', () => ({
  getBrandFromAgency: () => 'nativz' as const,
}));

vi.mock('@/lib/agency/cortex-url', () => ({
  getCortexAppUrl: () => 'https://cortex.nativz.io',
}));

vi.mock('@/lib/email/notification-recipients', () => ({
  getClientNotificationRecipients: async () => [
    { email: 'client@example.com', name: 'Client Person' },
  ],
}));

vi.mock('@/lib/email/resend', () => ({
  buildCalendarShareSendDraft: () => ({
    subject: 'subject',
    message: 'msg',
    eyebrow: 'eyebrow',
    heroTitle: 'hero',
    ctaLabel: 'CTA',
    footerNote: 'footer',
  }),
  buildCalendarShareSendHtml: () => '<html></html>',
  sendCalendarShareSendEmail: async () =>
    resendState.shouldSucceed ? { ok: true, html: '<html></html>' } : { ok: false, error: 'mock fail' },
}));

vi.mock('@/lib/content-tools/archive-share-email', () => ({
  archiveShareLinkEmail: async () => undefined,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'content_drop_share_links') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: adminState.link, error: adminState.link ? null : { message: 'missing' } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            adminState.capturedLinkUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'content_drops') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: adminState.drop, error: adminState.drop ? null : { message: 'missing' } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            adminState.capturedDropUpdates.push(payload);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import type { NextResponse } from 'next/server';
import { POST as RAW_POST } from './route';

// POST's inferred return type widens to NextResponse | undefined because the
// loadSendContext helper's union-narrowing doesn't propagate through 'in'
// the way TS expects. In practice POST always returns a NextResponse, so we
// re-type it here for the tests.
const POST = RAW_POST as (
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) => Promise<NextResponse>;

const TOKEN = 'tok-test';

function buildRequest(): Request {
  return new Request(`http://localhost/api/calendar/share/${TOKEN}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ variant: 'initial' }),
  });
}

function ctx() {
  return { params: Promise.resolve({ token: TOKEN }) };
}

beforeEach(() => {
  adminState.link = {
    id: 'link-1',
    drop_id: 'drop-1',
    expires_at: '2030-01-01T00:00:00Z',
    first_sent_at: null,
    last_sent_at: null,
    send_count: 0,
    included_post_ids: ['p1'],
  };
  adminState.drop = {
    id: 'drop-1',
    client_id: 'client-1',
    start_date: '2026-06-01',
    end_date: '2026-06-07',
    handoff_state: 'smm_approved',
    handoff_history: [],
    clients: { id: 'client-1', name: 'Acme', agency: null },
  };
  adminState.capturedDropUpdates = [];
  adminState.capturedLinkUpdates = [];
  authState.user = { id: 'user-admin-9', email: 'jack@nativz.io' };
  authState.isAdmin = true;
  resendState.shouldSucceed = true;
});

describe('POST /api/calendar/share/[token]/send (handoff guard)', () => {
  it('returns 409 when drop is in editing', async () => {
    adminState.drop!.handoff_state = 'editing';
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.handoff_state).toBe('editing');
  });

  it('returns 409 when drop is in smm_review', async () => {
    adminState.drop!.handoff_state = 'smm_review';
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
  });

  it('returns 409 when drop is in smm_rejected', async () => {
    adminState.drop!.handoff_state = 'smm_rejected';
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(409);
  });

  it('sends + flips drop to client_sent on the happy path', async () => {
    adminState.drop!.handoff_state = 'smm_approved';
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const dropUpdate = adminState.capturedDropUpdates.find(
      (u) => u.handoff_state === 'client_sent',
    );
    expect(dropUpdate).toBeDefined();
    const history = dropUpdate?.handoff_history as Array<{ state: string }>;
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].state).toBe('client_sent');
  });

  it('appends an idempotent history entry when drop is already client_sent', async () => {
    adminState.drop!.handoff_state = 'client_sent';
    const res = await POST(buildRequest(), ctx());
    expect(res.status).toBe(200);

    // No state flip - the update payload should only carry the new history
    // (and updated_at), never handoff_state.
    const flipUpdate = adminState.capturedDropUpdates.find(
      (u) => u.handoff_state !== undefined,
    );
    expect(flipUpdate).toBeUndefined();
    const historyUpdate = adminState.capturedDropUpdates.find(
      (u) => u.handoff_history !== undefined,
    );
    expect(historyUpdate).toBeDefined();
  });
});

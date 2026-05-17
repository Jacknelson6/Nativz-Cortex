import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CUP-02 T14 unit test for the daily SMM review digest cron.
 * Mocks the admin client + Slack helper so we exercise auth, off-mode
 * no-op, and on-mode grouping/posting/stamping branches.
 */

interface AwaitingDropRow {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  last_smm_review_notified_at: string | null;
  clients: { name: string | null; organization_id: string | null } | null;
}

interface AdminState {
  drops: AwaitingDropRow[];
  capturedUpdates: Array<{ ids: string[]; payload: Record<string, unknown> }>;
}

const adminState = vi.hoisted(
  () => ({ drops: [], capturedUpdates: [] } as AdminState),
);

const postOpsSlackMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock('@/lib/social/slack-webhook', async () => {
  const actual = await vi.importActual<typeof import('@/lib/social/slack-webhook')>(
    '@/lib/social/slack-webhook',
  );
  return { ...actual, postOpsSlack: postOpsSlackMock };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => buildAdminClient(),
}));

vi.mock('@/lib/observability/with-cron-telemetry', () => ({
  withCronTelemetry: (_opts: unknown, handler: (req: Request) => Promise<Response>) =>
    handler,
}));

function buildAdminClient() {
  return {
    from(table: string) {
      if (table === 'content_drops') {
        return {
          select: () => ({
            eq: async () => ({ data: adminState.drops, error: null }),
          }),
          update: (payload: Record<string, unknown>) => ({
            in: async (_col: string, ids: string[]) => {
              adminState.capturedUpdates.push({ ids, payload });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

import { GET as GETExported } from './route';

const GET = GETExported as unknown as (req: Request) => Promise<Response>;

function buildRequest(token: string | null = 'cron-secret-123'): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/cron/smm-review-digest', { headers });
}

beforeEach(() => {
  adminState.drops = [];
  adminState.capturedUpdates = [];
  postOpsSlackMock.mockReset();
  postOpsSlackMock.mockResolvedValue({ ok: true });
  process.env.CRON_SECRET = 'cron-secret-123';
  delete process.env.SMM_REVIEW_DIGEST_MODE;
  delete process.env.SLACK_OPS_WEBHOOK_ENABLED;
  delete process.env.SLACK_OPS_WEBHOOK_URL;
});

describe('GET /api/cron/smm-review-digest', () => {
  it('returns 401 without bearer token', async () => {
    const res = await GET(buildRequest(null));
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong bearer token', async () => {
    const res = await GET(buildRequest('nope'));
    expect(res.status).toBe(401);
  });

  it('no-ops with reason digest_mode_off when env flag is unset', async () => {
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body).toEqual({
      digestSent: false,
      dropCount: 0,
      orgCount: 0,
      reason: 'digest_mode_off',
    });
    expect(postOpsSlackMock).not.toHaveBeenCalled();
  });

  it('no-ops with reason slack_not_configured when digest is on but Slack creds missing', async () => {
    process.env.SMM_REVIEW_DIGEST_MODE = 'on';
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.reason).toBe('slack_not_configured');
    expect(body.digestSent).toBe(false);
    expect(postOpsSlackMock).not.toHaveBeenCalled();
  });

  it('returns zero counts when no drops are awaiting review', async () => {
    process.env.SMM_REVIEW_DIGEST_MODE = 'on';
    process.env.SLACK_OPS_WEBHOOK_ENABLED = 'true';
    process.env.SLACK_OPS_WEBHOOK_URL = 'https://hooks.slack.com/x';
    adminState.drops = [];

    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body).toEqual({ digestSent: false, dropCount: 0, orgCount: 0 });
    expect(postOpsSlackMock).not.toHaveBeenCalled();
  });

  it('groups awaiting drops by org, posts one card per org, stamps timestamps', async () => {
    process.env.SMM_REVIEW_DIGEST_MODE = 'on';
    process.env.SLACK_OPS_WEBHOOK_ENABLED = 'true';
    process.env.SLACK_OPS_WEBHOOK_URL = 'https://hooks.slack.com/x';
    adminState.drops = [
      {
        id: 'd1',
        client_id: 'c1',
        start_date: '2026-06-01',
        end_date: '2026-06-07',
        last_smm_review_notified_at: null,
        clients: { name: 'Nike', organization_id: 'org-1' },
      },
      {
        id: 'd2',
        client_id: 'c2',
        start_date: '2026-06-08',
        end_date: '2026-06-14',
        last_smm_review_notified_at: null,
        clients: { name: 'Adidas', organization_id: 'org-1' },
      },
      {
        id: 'd3',
        client_id: 'c3',
        start_date: '2026-06-05',
        end_date: null,
        last_smm_review_notified_at: null,
        clients: { name: 'Beaux', organization_id: 'org-2' },
      },
    ];

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.digestSent).toBe(true);
    expect(body.dropCount).toBe(3);
    expect(body.orgCount).toBe(2);
    expect(body.cardsFired).toBe(2);

    expect(postOpsSlackMock).toHaveBeenCalledTimes(2);
    expect(postOpsSlackMock.mock.calls[0][0]).toMatchObject({
      webhookUrl: 'https://hooks.slack.com/x',
      text: expect.stringContaining('Daily SMM review digest'),
    });

    expect(adminState.capturedUpdates).toHaveLength(2);
    const allStampedIds = adminState.capturedUpdates.flatMap((u) => u.ids);
    expect(allStampedIds.sort()).toEqual(['d1', 'd2', 'd3']);
    for (const u of adminState.capturedUpdates) {
      expect(u.payload).toEqual(
        expect.objectContaining({ last_smm_review_notified_at: expect.any(String) }),
      );
    }
  });
});

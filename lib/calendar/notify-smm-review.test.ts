import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createNotificationMock, postOpsSlackMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(),
  postOpsSlackMock: vi.fn(),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: createNotificationMock,
}));

vi.mock('@/lib/social/slack-webhook', async () => {
  const actual = await vi.importActual<typeof import('@/lib/social/slack-webhook')>(
    '@/lib/social/slack-webhook',
  );
  return { ...actual, postOpsSlack: postOpsSlackMock };
});

import { notifySmmReviewReady } from './notify-smm-review';

type DropRow = {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  handoff_history: Array<{ state: string; at: string; actor: string; note?: string }> | null;
  last_smm_review_notified_at: string | null;
  clients: {
    name: string | null;
    organization_id: string | null;
    smm_reviewer_user_id: string | null;
  } | null;
};

function makeAdmin(opts: {
  drop: DropRow | null;
  postCount?: number;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      if (table === 'content_drops') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: opts.drop, error: null }),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'content_drop_videos') {
        return {
          select() {
            return {
              eq: () => Promise.resolve({ count: opts.postCount ?? 0, error: null }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _updates: updates,
  };
  return admin as unknown as Parameters<typeof notifySmmReviewReady>[0] & { _updates: typeof updates };
}

const baseDrop: DropRow = {
  id: 'drop-1',
  client_id: 'client-1',
  start_date: '2026-06-01',
  end_date: '2026-06-07',
  handoff_history: [{ state: 'smm_review', at: '2026-06-01T00:00:00Z', actor: 'editor-1' }],
  last_smm_review_notified_at: null,
  clients: { name: 'Nike', organization_id: 'org-1', smm_reviewer_user_id: null },
};

describe('notifySmmReviewReady', () => {
  beforeEach(() => {
    createNotificationMock.mockReset();
    postOpsSlackMock.mockReset();
    delete process.env.SLACK_OPS_WEBHOOK_ENABLED;
    delete process.env.SLACK_OPS_WEBHOOK_URL;
    delete process.env.SMM_REVIEW_DIGEST_MODE;
    process.env.ZERNIO_WEBHOOK_NOTIFY_USER_IDS = 'user-a,user-b';
  });

  it('happy path: in-app to env recipients + slack post + stamps drop', async () => {
    process.env.SLACK_OPS_WEBHOOK_ENABLED = 'true';
    process.env.SLACK_OPS_WEBHOOK_URL = 'https://hooks.slack.com/x';
    postOpsSlackMock.mockResolvedValue({ ok: true });
    const admin = makeAdmin({ drop: baseDrop, postCount: 8 });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out).toEqual({ inAppNotified: 2, slackPosted: true });
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'user-a',
        type: 'drop_smm_review_ready',
        title: 'Nike: calendar ready for review',
        body: '8 posts, 2026-06-01 to 2026-06-07',
        linkPath: '/admin/calendar/review/drop/drop-1',
      }),
    );
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1);
    expect(admin._updates).toEqual([
      expect.objectContaining({ last_smm_review_notified_at: expect.any(String) }),
    ]);
  });

  it('prefers per-client smm_reviewer_user_id over env list', async () => {
    const admin = makeAdmin({
      drop: {
        ...baseDrop,
        clients: { ...baseDrop.clients!, smm_reviewer_user_id: 'user-z' },
      },
      postCount: 3,
    });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out.inAppNotified).toBe(1);
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(createNotificationMock.mock.calls[0][0].recipientUserId).toBe('user-z');
  });

  it('slack failure does not throw and is surfaced as slackError', async () => {
    process.env.SLACK_OPS_WEBHOOK_ENABLED = 'true';
    process.env.SLACK_OPS_WEBHOOK_URL = 'https://hooks.slack.com/x';
    postOpsSlackMock.mockResolvedValue({ ok: false, error: 'slack 500' });
    const admin = makeAdmin({ drop: baseDrop, postCount: 4 });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out.slackPosted).toBe(false);
    expect(out.slackError).toBe('slack 500');
    expect(out.inAppNotified).toBe(2);
  });

  it('honours the 60s dedup window', async () => {
    const recent = new Date(Date.now() - 10_000).toISOString();
    const admin = makeAdmin({
      drop: { ...baseDrop, last_smm_review_notified_at: recent },
      postCount: 4,
    });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out.skipped).toBe('dedup');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('bypasses dedup when the previous handoff_history entry was smm_rejected', async () => {
    const recent = new Date(Date.now() - 10_000).toISOString();
    const admin = makeAdmin({
      drop: {
        ...baseDrop,
        last_smm_review_notified_at: recent,
        handoff_history: [
          { state: 'smm_review', at: 't0', actor: 'editor-1' },
          { state: 'smm_rejected', at: 't1', actor: 'smm-1', note: 'tweak post 3' },
          { state: 'smm_review', at: 't2', actor: 'editor-1' },
        ],
      },
      postCount: 4,
    });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out.skipped).toBeUndefined();
    expect(out.inAppNotified).toBe(2);
  });

  it('returns no_recipients when env list is empty and no per-client reviewer', async () => {
    process.env.ZERNIO_WEBHOOK_NOTIFY_USER_IDS = '';
    const admin = makeAdmin({ drop: baseDrop, postCount: 4 });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out).toEqual({ inAppNotified: 0, slackPosted: false, skipped: 'no_recipients' });
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns missing_drop when the drop row is gone', async () => {
    const admin = makeAdmin({ drop: null });

    const out = await notifySmmReviewReady(admin, { dropId: 'gone', actorUserId: 'editor-1' });

    expect(out).toEqual({ inAppNotified: 0, slackPosted: false, skipped: 'missing_drop' });
  });

  it('does not post to slack when digest mode is on', async () => {
    process.env.SLACK_OPS_WEBHOOK_ENABLED = 'true';
    process.env.SLACK_OPS_WEBHOOK_URL = 'https://hooks.slack.com/x';
    process.env.SMM_REVIEW_DIGEST_MODE = 'on';
    const admin = makeAdmin({ drop: baseDrop, postCount: 4 });

    const out = await notifySmmReviewReady(admin, { dropId: 'drop-1', actorUserId: 'editor-1' });

    expect(out.slackPosted).toBe(false);
    expect(postOpsSlackMock).not.toHaveBeenCalled();
    expect(out.inAppNotified).toBe(2);
  });
});

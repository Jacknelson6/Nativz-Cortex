import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `lib/notifications.ts` is the only path that writes to the
 * `notifications` table from server code. Every in-app bell entry, every
 * sync-failure ping, every "post needs approval" the team sees flows
 * through these helpers. Three contracts to pin:
 *
 *   1. Body truncation never exceeds NOTIFICATION_BODY_MAX_LENGTH.
 *      `notifications.body` is bounded at 2000 chars to keep the bell
 *      readable; an unbounded write would render the dropdown unscrollable
 *      and could blow the row size on large sync errors. The slice + '…'
 *      replacement must produce a string of length <= 2000, exactly.
 *
 *   2. Preference gating is master-then-type. `prefs.inApp = false` is a
 *      hard kill switch for every notification type; the per-type toggle
 *      (engagement outlier, follower milestone, etc.) only applies when
 *      inApp is on. A regression that flipped the order would let a user
 *      who muted notifications still get bell entries because their
 *      per-type toggle defaulted true.
 *
 *   3. notifyAdmins scopes by client_assignments + owners when clientId is
 *      provided, and broadcasts to all admins otherwise. Owners (is_owner
 *      = true) ALWAYS receive scoped pings even if they're not in
 *      client_assignments — this is the "owners see everything" rule. A
 *      regression that dropped the owner OR-branch would silently exclude
 *      Jack from client-scoped alerts.
 *
 * The Supabase chain is mocked at the createAdminClient boundary. Each
 * test rewires `from()` to return a per-call chain that records the
 * filter sequence and resolves to the configured rows. Inserts are
 * captured in `inserted[]` for assertion of the row payload.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chain = any;

type AdminStub = {
  fromCalls: string[];
  inserted: Array<{ table: string; rows: unknown }>;
  from: (table: string) => Chain;
};

let adminStub: AdminStub;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminStub,
}));

let notifications: typeof import('./notifications');

beforeEach(async () => {
  vi.resetModules();
  notifications = await import('./notifications');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buildAdmin(routes: Record<string, () => Chain>): AdminStub {
  const fromCalls: string[] = [];
  const inserted: Array<{ table: string; rows: unknown }> = [];
  const from = (table: string) => {
    fromCalls.push(table);
    const chain = routes[table]?.() ?? defaultSelectChain([]);
    chain.insert = (rows: unknown) => {
      inserted.push({ table, rows });
      return Promise.resolve({ error: null });
    };
    return chain;
  };
  return { fromCalls, inserted, from };
}

function defaultSelectChain(data: unknown): Chain {
  // Supabase fluent selects: chain returns itself for every filter and
  // resolves to { data } when awaited or .single()'d.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve({ data }));
  chain.then = (resolve: (v: { data: unknown }) => unknown) =>
    Promise.resolve({ data }).then(resolve);
  return chain;
}

describe('truncateNotificationBody — body length contract', () => {
  it('returns the input unchanged when at or under the limit', () => {
    const exact = 'a'.repeat(2000);
    expect(notifications.truncateNotificationBody(exact)).toBe(exact);
    expect(notifications.truncateNotificationBody('short').length).toBe(5);
  });

  it('truncates strings over the limit and ends with a single-character ellipsis', () => {
    // Pin: result must be <= 2000 chars total. Using '...' would push
    // the result to 2002 chars; the implementation uses '…' (U+2026).
    const big = 'a'.repeat(5000);
    const out = notifications.truncateNotificationBody(big);
    expect(out.length).toBe(notifications.NOTIFICATION_BODY_MAX_LENGTH);
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1)).toBe('a'.repeat(1999));
  });

  it('does NOT add an ellipsis when the input is exactly at the limit', () => {
    // Edge case: at length === 2000 the function returns as-is (no
    // ellipsis appended). A regression that always appended would push
    // this to 2001.
    const exact = 'b'.repeat(2000);
    expect(notifications.truncateNotificationBody(exact)).toBe(exact);
    expect(notifications.truncateNotificationBody(exact).length).toBe(2000);
  });

  it('handles empty string without crashing', () => {
    expect(notifications.truncateNotificationBody('')).toBe('');
  });

  it('exposes the constant publicly so callers can size their inputs', () => {
    expect(notifications.NOTIFICATION_BODY_MAX_LENGTH).toBe(2000);
  });
});

describe('createNotification — insert payload shape', () => {
  it('writes the basic row with body falling back to message then null', async () => {
    adminStub = buildAdmin({});
    await notifications.createNotification({
      userId: 'user-1',
      type: 'sync_failed',
      title: 'Sync failed',
      message: 'Instagram token expired',
    });
    expect(adminStub.inserted).toHaveLength(1);
    const row = adminStub.inserted[0].rows as Record<string, unknown>;
    expect(row).toMatchObject({
      recipient_user_id: 'user-1',
      type: 'sync_failed',
      title: 'Sync failed',
      body: 'Instagram token expired',
      link_path: null,
      is_read: false,
      email_sent: false,
    });
  });

  it('prefers `body` over `message` when both are provided', async () => {
    // Defensive: callers in flight migration from `message` -> `body`.
    // Body wins so the new field is authoritative.
    adminStub = buildAdmin({});
    await notifications.createNotification({
      userId: 'u',
      type: 'post_published',
      title: 'Live',
      body: 'real body',
      message: 'legacy message',
    });
    const row = adminStub.inserted[0].rows as Record<string, unknown>;
    expect(row.body).toBe('real body');
  });

  it('writes null body when neither body nor message is provided', async () => {
    adminStub = buildAdmin({});
    await notifications.createNotification({
      userId: 'u',
      type: 'post_published',
      title: 'Live',
    });
    const row = adminStub.inserted[0].rows as Record<string, unknown>;
    expect(row.body).toBeNull();
  });

  it('passes linkPath through verbatim', async () => {
    adminStub = buildAdmin({});
    await notifications.createNotification({
      userId: 'u',
      type: 'post_needs_approval',
      title: 'Needs approval',
      linkPath: '/admin/calendar?post=abc',
    });
    const row = adminStub.inserted[0].rows as Record<string, unknown>;
    expect(row.link_path).toBe('/admin/calendar?post=abc');
  });
});

describe('getUserNotificationPreferences — defaults merge', () => {
  it('returns full defaults when the user has no stored preferences', async () => {
    adminStub = buildAdmin({
      users: () => defaultSelectChain({ notification_preferences: null }),
    });
    const prefs = await notifications.getUserNotificationPreferences('u');
    expect(prefs.inApp).toBe(true);
    expect(prefs.email).toBe(true);
    expect(prefs.engagementOutlier.enabled).toBe(false);
    expect(prefs.engagementOutlier.threshold).toBe(2);
  });

  it('merges stored prefs over defaults (user overrides win)', async () => {
    // Pin: a user who explicitly turned inApp off must stay off, even
    // though the default is true. A regression that did `{...stored,
    // ...defaults}` would silently re-enable mute.
    adminStub = buildAdmin({
      users: () =>
        defaultSelectChain({
          notification_preferences: { inApp: false, email: true },
        }),
    });
    const prefs = await notifications.getUserNotificationPreferences('u');
    expect(prefs.inApp).toBe(false);
    expect(prefs.email).toBe(true);
  });

  it('returns defaults when the row itself is missing (deleted user race)', async () => {
    adminStub = buildAdmin({
      users: () => defaultSelectChain(null),
    });
    const prefs = await notifications.getUserNotificationPreferences('u');
    expect(prefs.inApp).toBe(true);
  });
});

describe('notifyAdmins — broadcast (no clientId)', () => {
  it('selects all admin users and inserts one row per opted-in admin', async () => {
    let usersCallCount = 0;
    adminStub = buildAdmin({
      users: () => {
        usersCallCount++;
        if (usersCallCount === 1) {
          // First call: list of admin ids
          return defaultSelectChain([{ id: 'a1' }, { id: 'a2' }]);
        }
        // Second call: prefs lookup for those ids
        return defaultSelectChain([
          { id: 'a1', notification_preferences: { inApp: true } },
          { id: 'a2', notification_preferences: { inApp: true } },
        ]);
      },
    });
    await notifications.notifyAdmins({
      type: 'sync_failed',
      title: 'Sync failed',
    });
    expect(adminStub.inserted).toHaveLength(1);
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id).sort()).toEqual(['a1', 'a2']);
  });

  it('returns early without inserting when there are no admins', async () => {
    adminStub = buildAdmin({
      users: () => defaultSelectChain([]),
    });
    await notifications.notifyAdmins({
      type: 'sync_failed',
      title: 'x',
    });
    expect(adminStub.inserted).toHaveLength(0);
  });

  it('drops admins whose inApp toggle is off', async () => {
    // Pin: master toggle off blocks all types.
    let count = 0;
    adminStub = buildAdmin({
      users: () => {
        count++;
        if (count === 1) return defaultSelectChain([{ id: 'a1' }, { id: 'a2' }]);
        return defaultSelectChain([
          { id: 'a1', notification_preferences: { inApp: false } },
          { id: 'a2', notification_preferences: { inApp: true } },
        ]);
      },
    });
    await notifications.notifyAdmins({ type: 'sync_failed', title: 'x' });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id)).toEqual(['a2']);
  });

  it('drops admins whose per-type toggle is off (engagement_spike)', async () => {
    // Pin: per-type gating. engagement_spike routes through
    // prefs.engagementSpike.enabled. Default is false for the
    // automatic-detection types, so a user with inApp:true but
    // engagementSpike unset gets filtered out.
    let count = 0;
    adminStub = buildAdmin({
      users: () => {
        count++;
        if (count === 1) return defaultSelectChain([{ id: 'a1' }, { id: 'a2' }]);
        return defaultSelectChain([
          {
            id: 'a1',
            notification_preferences: {
              inApp: true,
              engagementSpike: { enabled: false, percentIncrease: 50 },
            },
          },
          {
            id: 'a2',
            notification_preferences: {
              inApp: true,
              engagementSpike: { enabled: true, percentIncrease: 50 },
            },
          },
        ]);
      },
    });
    await notifications.notifyAdmins({ type: 'engagement_spike', title: 'x' });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id)).toEqual(['a2']);
  });

  it('lets non-conditional types (sync_failed, post_published, etc.) through with inApp:true', async () => {
    // Defensive: types that fall through the switch's default branch
    // (sync, post lifecycle, account disconnects) should always be
    // delivered to in-app subscribers regardless of the engagement
    // toggles. The default returning true is what makes that work.
    let count = 0;
    adminStub = buildAdmin({
      users: () => {
        count++;
        if (count === 1) return defaultSelectChain([{ id: 'a1' }]);
        return defaultSelectChain([{ id: 'a1', notification_preferences: { inApp: true } }]);
      },
    });
    await notifications.notifyAdmins({ type: 'post_needs_approval', title: 'Approve' });
    expect(adminStub.inserted).toHaveLength(1);
  });
});

describe('notifyAdmins — client-scoped (clientId provided)', () => {
  it('unions assigned team members and is_owner=true admins', async () => {
    // Pin: owners always see scoped pings even if they're not in
    // client_assignments. A regression that dropped the owners query
    // would exclude Jack from client-scoped alerts.
    adminStub = buildAdmin({
      client_assignments: () =>
        defaultSelectChain([
          { team_members: { user_id: 'tm-1' } },
          { team_members: { user_id: 'tm-2' } },
        ]),
      users: (() => {
        let count = 0;
        return () => {
          count++;
          if (count === 1) {
            // Owners list
            return defaultSelectChain([{ id: 'owner-1' }]);
          }
          // Prefs
          return defaultSelectChain([
            { id: 'tm-1', notification_preferences: { inApp: true } },
            { id: 'tm-2', notification_preferences: { inApp: true } },
            { id: 'owner-1', notification_preferences: { inApp: true } },
          ]);
        };
      })(),
    });
    await notifications.notifyAdmins({
      type: 'sync_failed',
      title: 'x',
      clientId: 'client-1',
    });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id).sort()).toEqual(['owner-1', 'tm-1', 'tm-2']);
  });

  it('deduplicates when an owner is also assigned via client_assignments', async () => {
    // Pin: the implementation uses a Set, so an owner who is also a
    // team member assigned to the client lands in recipientIds exactly
    // once. A regression that switched to an array concat would
    // double-insert the row.
    adminStub = buildAdmin({
      client_assignments: () =>
        defaultSelectChain([{ team_members: { user_id: 'jack' } }]),
      users: (() => {
        let count = 0;
        return () => {
          count++;
          if (count === 1) return defaultSelectChain([{ id: 'jack' }]);
          return defaultSelectChain([{ id: 'jack', notification_preferences: { inApp: true } }]);
        };
      })(),
    });
    await notifications.notifyAdmins({
      type: 'sync_failed',
      title: 'x',
      clientId: 'client-1',
    });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows).toHaveLength(1);
  });

  it('skips assignment rows where team_members.user_id is null', async () => {
    // Defensive: a team_member row with user_id=null (invited but
    // unaccepted seat) must not insert a row with recipient_user_id=null.
    adminStub = buildAdmin({
      client_assignments: () =>
        defaultSelectChain([
          { team_members: { user_id: null } },
          { team_members: { user_id: 'tm-real' } },
        ]),
      users: (() => {
        let count = 0;
        return () => {
          count++;
          if (count === 1) return defaultSelectChain([]);
          return defaultSelectChain([
            { id: 'tm-real', notification_preferences: { inApp: true } },
          ]);
        };
      })(),
    });
    await notifications.notifyAdmins({
      type: 'sync_failed',
      title: 'x',
      clientId: 'client-1',
    });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id)).toEqual(['tm-real']);
  });

  it('returns early when no team members and no owners are eligible', async () => {
    adminStub = buildAdmin({
      client_assignments: () => defaultSelectChain([]),
      users: () => defaultSelectChain([]),
    });
    await notifications.notifyAdmins({
      type: 'sync_failed',
      title: 'x',
      clientId: 'client-1',
    });
    expect(adminStub.inserted).toHaveLength(0);
  });
});

describe('notifyOrganization — portal-only delivery', () => {
  it('sends to viewer-role users in the org and skips others', async () => {
    // The select chain itself filters role='viewer', so the test-side
    // mock only returns the rows that survived. We assert we DID get
    // an insert and that none of the recipients are admin ids.
    adminStub = buildAdmin({
      users: () =>
        defaultSelectChain([
          { id: 'portal-1', notification_preferences: { inApp: true } },
          { id: 'portal-2', notification_preferences: { inApp: true } },
        ]),
    });
    await notifications.notifyOrganization({
      organizationId: 'org-1',
      type: 'post_published',
      title: 'Live',
    });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id).sort()).toEqual(['portal-1', 'portal-2']);
  });

  it('returns early when the org has no portal users', async () => {
    adminStub = buildAdmin({
      users: () => defaultSelectChain([]),
    });
    await notifications.notifyOrganization({
      organizationId: 'empty',
      type: 'post_published',
      title: 'Live',
    });
    expect(adminStub.inserted).toHaveLength(0);
  });

  it('respects per-user preferences (drops users with inApp:false)', async () => {
    adminStub = buildAdmin({
      users: () =>
        defaultSelectChain([
          { id: 'portal-1', notification_preferences: { inApp: false } },
          { id: 'portal-2', notification_preferences: { inApp: true } },
        ]),
    });
    await notifications.notifyOrganization({
      organizationId: 'org-1',
      type: 'post_published',
      title: 'Live',
    });
    const rows = adminStub.inserted[0].rows as Array<{ recipient_user_id: string }>;
    expect(rows.map((r) => r.recipient_user_id)).toEqual(['portal-2']);
  });

  it('does not insert when every recipient is filtered out', async () => {
    // Pin: the implementation guards against `rows.length === 0` to
    // avoid sending an empty array to .insert(), which would error in
    // the postgrest client.
    adminStub = buildAdmin({
      users: () =>
        defaultSelectChain([
          { id: 'portal-1', notification_preferences: { inApp: false } },
        ]),
    });
    await notifications.notifyOrganization({
      organizationId: 'org-1',
      type: 'post_published',
      title: 'Live',
    });
    expect(adminStub.inserted).toHaveLength(0);
  });
});

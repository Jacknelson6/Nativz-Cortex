import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/connections-matrix
 *
 * Returns a per-client, per-platform connection status grid for the
 * Connections tab on /admin/content-tools.
 *
 *   clients: [{ id, name, logoUrl, slug,
 *               profiles: { tiktok, instagram, facebook, youtube, linkedin } }]
 *
 * Each platform slot resolves to one of:
 *   - connected: `social_profiles` row with `is_active = true` and
 *     `late_account_id` set (Zernio OAuth completed; we can post via
 *     the API).
 *   - manual:    row exists + active but no `late_account_id`. The
 *     client confirmed manual access (no_account / website_scraped /
 *     legacy onboarding) but we can't post without their direct
 *     login.
 *   - disconnected: row exists but `is_active = false` OR
 *     `disconnect_alerted_at` is set, meaning Zernio reported the
 *     token has been revoked. Surface in red so the agency can re-
 *     auth before posts queue up.
 *   - missing:   no row at all. Client has never been onboarded for
 *     this platform.
 *
 * The five platforms surfaced match the calendar scheduling pipeline
 * (the four Zernio supports, plus LinkedIn which is manual-only by
 * design, Zernio has no LinkedIn flow). Anything else stored in
 * `social_profiles.platform` is intentionally ignored.
 *
 * Auth: admin-only. Cross-brand surface, no org filter.
 */

const PLATFORMS = ['tiktok', 'instagram', 'facebook', 'youtube', 'linkedin'] as const;
type Platform = (typeof PLATFORMS)[number];

type Status = 'connected' | 'manual' | 'disconnected' | 'missing';

interface PlatformSlot {
  status: Status;
  username: string | null;
  /** ISO timestamp of the most recent Zernio disconnect alert. Drives
   *  the "needs re-auth" copy under disconnected slots. */
  disconnectedAt: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  profiles: Record<Platform, PlatformSlot>;
}

interface ResponseBody {
  clients: ClientRow[];
  /** Snapshot summary for the header chip ("12 of 30 connected"). */
  totals: {
    connected: number;
    manual: number;
    disconnected: number;
    missing: number;
  };
}

function emptySlot(): PlatformSlot {
  return { status: 'missing', username: null, disconnectedAt: null };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Pull every active client + every social_profiles row in parallel.
  // Inactive clients don't surface, the matrix is meant to be the
  // operational view for ongoing brands, not an archive.
  const [clientsRes, profilesRes] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, logo_url')
      .order('name'),
    admin
      .from('social_profiles')
      .select(
        'client_id, platform, username, is_active, late_account_id, disconnect_alerted_at',
      ),
  ]);

  if (clientsRes.error) {
    return NextResponse.json(
      { error: 'db_error', detail: clientsRes.error.message },
      { status: 500 },
    );
  }
  if (profilesRes.error) {
    return NextResponse.json(
      { error: 'db_error', detail: profilesRes.error.message },
      { status: 500 },
    );
  }

  // Group profiles by client_id for O(1) lookup while building rows.
  // The same client + platform pair can have multiple rows in theory
  // (legacy migrations); pick the most informative one ("connected"
  // beats "manual" beats "disconnected" beats "missing").
  const profilesByClient = new Map<
    string,
    Map<Platform, PlatformSlot>
  >();
  for (const p of profilesRes.data ?? []) {
    const platform = p.platform as Platform;
    if (!PLATFORMS.includes(platform)) continue;

    const inner =
      profilesByClient.get(p.client_id) ?? new Map<Platform, PlatformSlot>();

    const existing = inner.get(platform);
    const next = resolveSlot(p);
    inner.set(platform, mergeSlot(existing, next));

    profilesByClient.set(p.client_id, inner);
  }

  const clients: ClientRow[] = (clientsRes.data ?? []).map((c) => {
    const inner = profilesByClient.get(c.id);
    const profiles = Object.fromEntries(
      PLATFORMS.map((p) => [p, inner?.get(p) ?? emptySlot()]),
    ) as Record<Platform, PlatformSlot>;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug ?? null,
      logoUrl: c.logo_url ?? null,
      profiles,
    };
  });

  const totals = { connected: 0, manual: 0, disconnected: 0, missing: 0 };
  for (const c of clients) {
    for (const p of PLATFORMS) {
      totals[c.profiles[p].status] += 1;
    }
  }

  const body: ResponseBody = { clients, totals };
  return NextResponse.json(body);
}

/** Read a single `social_profiles` row into the matrix vocabulary. */
function resolveSlot(p: {
  username: string | null;
  is_active: boolean | null;
  late_account_id: string | null;
  disconnect_alerted_at: string | null;
}): PlatformSlot {
  if (p.disconnect_alerted_at && p.is_active === false) {
    return {
      status: 'disconnected',
      username: p.username,
      disconnectedAt: p.disconnect_alerted_at,
    };
  }
  if (p.is_active === false) {
    return {
      status: 'disconnected',
      username: p.username,
      disconnectedAt: p.disconnect_alerted_at,
    };
  }
  if (p.late_account_id) {
    return { status: 'connected', username: p.username, disconnectedAt: null };
  }
  return { status: 'manual', username: p.username, disconnectedAt: null };
}

const STATUS_RANK: Record<Status, number> = {
  connected: 4,
  manual: 3,
  disconnected: 2,
  missing: 1,
};

/** When a (client, platform) has multiple rows, keep the strongest. */
function mergeSlot(
  existing: PlatformSlot | undefined,
  next: PlatformSlot,
): PlatformSlot {
  if (!existing) return next;
  return STATUS_RANK[next.status] >= STATUS_RANK[existing.status]
    ? next
    : existing;
}

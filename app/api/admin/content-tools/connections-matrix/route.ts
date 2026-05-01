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
 * Slot statuses (after the April 2026 simplification):
 *   - connected:    Zernio reports the account active and we have a
 *                   `late_account_id` on file. We can post.
 *   - disconnected: row exists but `is_active = false` OR
 *                   `disconnect_alerted_at` is set, meaning Zernio
 *                   reported the token revoked. Surface in red so
 *                   the agency can re-auth before posts queue up.
 *   - missing:      no Zernio-authed row at all. Either we never
 *                   onboarded the platform, or we have a profile URL
 *                   on file but no token (the legacy "manual" state).
 *                   In either case the operator can't post until the
 *                   client connects through Zernio.
 *
 * The 5 cores (TikTok, Instagram, Facebook, YouTube, LinkedIn) plus
 * the Zernio-supported extras (Google Business, Pinterest, X, Threads,
 * Bluesky) are surfaced. LinkedIn slots are always `missing` until the
 * client logs in directly; Zernio has no LinkedIn flow.
 *
 * Auth: admin-only. Cross-brand surface, no org filter.
 */

const CORE_PLATFORMS = ['tiktok', 'instagram', 'facebook', 'youtube', 'linkedin'] as const;
const EXTRA_PLATFORMS = ['googlebusiness', 'pinterest', 'x', 'threads', 'bluesky'] as const;
const PLATFORMS = [...CORE_PLATFORMS, ...EXTRA_PLATFORMS] as const;
type Platform = (typeof PLATFORMS)[number];

type Status = 'connected' | 'disconnected' | 'missing';

interface PlatformSlot {
  status: Status;
  username: string | null;
  /** ISO timestamp of the most recent Zernio disconnect alert. Drives
   *  the "needs re-auth" copy under disconnected slots. */
  disconnectedAt: string | null;
  /** Zernio-reported token expiry if synced; null if we haven't checked. */
  tokenExpiresAt: string | null;
  tokenStatus: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  services: string[];
  profiles: Record<Platform, PlatformSlot>;
}

interface ResponseBody {
  clients: ClientRow[];
  totals: {
    connected: number;
    disconnected: number;
    missing: number;
  };
}

function emptySlot(): PlatformSlot {
  return {
    status: 'missing',
    username: null,
    disconnectedAt: null,
    tokenExpiresAt: null,
    tokenStatus: null,
  };
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

  const [clientsRes, profilesRes] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, logo_url, services')
      .order('name'),
    admin
      .from('social_profiles')
      .select(
        'client_id, platform, username, is_active, late_account_id, disconnect_alerted_at, token_expires_at, token_status',
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

  const profilesByClient = new Map<string, Map<Platform, PlatformSlot>>();
  for (const p of profilesRes.data ?? []) {
    const platform = p.platform as Platform;
    if (!(PLATFORMS as readonly string[]).includes(platform)) continue;

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
      services: Array.isArray(c.services) ? (c.services as string[]) : [],
      profiles,
    };
  });

  const totals = { connected: 0, disconnected: 0, missing: 0 };
  for (const c of clients) {
    for (const p of PLATFORMS) {
      totals[c.profiles[p].status] += 1;
    }
  }

  const body: ResponseBody = { clients, totals };
  return NextResponse.json(body);
}

function resolveSlot(p: {
  username: string | null;
  is_active: boolean | null;
  late_account_id: string | null;
  disconnect_alerted_at: string | null;
  token_expires_at: string | null;
  token_status: string | null;
}): PlatformSlot {
  // Disconnected: Zernio either flagged a revoke, or we marked the row
  // inactive. Either way the agency needs the client to re-auth.
  if (p.disconnect_alerted_at || p.is_active === false) {
    return {
      status: 'disconnected',
      username: p.username,
      disconnectedAt: p.disconnect_alerted_at,
      tokenExpiresAt: p.token_expires_at,
      tokenStatus: p.token_status,
    };
  }
  // Connected: active row + Zernio account id on file.
  if (p.late_account_id) {
    return {
      status: 'connected',
      username: p.username,
      disconnectedAt: null,
      tokenExpiresAt: p.token_expires_at,
      tokenStatus: p.token_status,
    };
  }
  // Profile URL on file but no Zernio token — operator can't post.
  // Treated as missing so the matrix nudges them to send an invite.
  return {
    status: 'missing',
    username: p.username,
    disconnectedAt: null,
    tokenExpiresAt: null,
    tokenStatus: null,
  };
}

const STATUS_RANK: Record<Status, number> = {
  connected: 3,
  disconnected: 2,
  missing: 1,
};

function mergeSlot(
  existing: PlatformSlot | undefined,
  next: PlatformSlot,
): PlatformSlot {
  if (!existing) return next;
  return STATUS_RANK[next.status] >= STATUS_RANK[existing.status]
    ? next
    : existing;
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

// NAT-57 follow-up: brand-profile competitor list. Admins maintain a
// stable per-client list (brand_name + website_url + platform handles);
// competitor-spying tools auto-suggest from here before asking the
// admin to paste a fresh URL.

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;

const createSchema = z.object({
  brand_name: z.string().trim().min(1).max(200),
  website_url: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  // Per-platform handles captured at creation time; all optional — the
  // UI may save the brand first and fill handles incrementally.
  handles: z
    .object({
      instagram: z.string().trim().max(200).optional().nullable(),
      tiktok: z.string().trim().max(200).optional().nullable(),
      facebook: z.string().trim().max(200).optional().nullable(),
      youtube: z.string().trim().max(200).optional().nullable(),
    })
    .optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!userData || userData.role !== 'admin') return null;
  return user;
}

/**
 * GET /api/clients/[id]/competitors
 *
 * List all competitor brands for a client. Each row groups the per-
 * platform handles under one brand entity so the UI can render a
 * single card per competitor instead of four rows.
 *
 * @auth Admin OR a viewer scoped to this client (portal read-only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const ctx = await getEffectiveAccessContext(user, adminClient);
    if (ctx.clientIds !== null && !ctx.clientIds.includes(clientId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: parents, error: parentsErr } = await adminClient
      .from('competitors')
      .select('id, brand_name, website_url, notes, website_scraped, created_at, updated_at')
      .eq('client_id', clientId)
      .order('brand_name');
    if (parentsErr) {
      console.error('competitors:GET parents error', parentsErr);
      return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500 });
    }

    // Fetch all platform rows in one query, then group client-side.
    // Legacy client_competitors rows (competitor_id IS NULL) are
    // ungrouped and surface under a synthetic "ungrouped" bucket the
    // UI can prompt the admin to clean up.
    const { data: platformRows, error: platformErr } = await adminClient
      .from('client_competitors')
      .select('id, competitor_id, platform, username, display_name, profile_url, avatar_url')
      .eq('client_id', clientId);
    if (platformErr) {
      console.error('competitors:GET platform rows error', platformErr);
      return NextResponse.json({ error: 'Failed to fetch competitor handles' }, { status: 500 });
    }

    const byParent = new Map<string, typeof platformRows>();
    const ungrouped: typeof platformRows = [];
    for (const row of platformRows ?? []) {
      if (!row.competitor_id) {
        ungrouped.push(row);
        continue;
      }
      const list = byParent.get(row.competitor_id) ?? [];
      list.push(row);
      byParent.set(row.competitor_id, list);
    }

    const competitors = (parents ?? []).map((p) => {
      const rows = byParent.get(p.id) ?? [];
      // Flatten to a handles map keyed by platform so the UI doesn't
      // have to loop. Clients rarely have >1 handle per platform per
      // competitor; if they do, we keep the first alphabetically.
      const handles: Record<string, { handle: string; profile_url: string | null } | null> = {
        instagram: null, tiktok: null, facebook: null, youtube: null,
      };
      for (const r of rows) {
        if (!PLATFORMS.includes(r.platform as (typeof PLATFORMS)[number])) continue;
        if (handles[r.platform]) continue;
        handles[r.platform] = {
          handle: r.username,
          profile_url: r.profile_url ?? null,
        };
      }
      return {
        id: p.id,
        brand_name: p.brand_name,
        website_url: p.website_url,
        notes: p.notes,
        website_scraped: p.website_scraped,
        handles,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    return NextResponse.json({
      competitors,
      ungrouped_count: ungrouped.length,
    });
  } catch (err) {
    console.error('competitors:GET fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/clients/[id]/competitors
 *
 * Create a new competitor brand + optionally its per-platform handles.
 *
 * @auth Admin only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { brand_name, website_url, notes, handles } = parsed.data;

    const adminClient = createAdminClient();

    // Insert the parent row first so we have its id for the per-platform
    // rows. If any handle insert fails mid-way we roll back the parent
    // manually — no multi-statement transaction via supabase-js, so we
    // fake it with a compensating delete.
    const { data: parent, error: parentErr } = await adminClient
      .from('competitors')
      .insert({
        client_id: clientId,
        brand_name: brand_name.trim(),
        website_url: website_url?.trim() || null,
        notes: notes?.trim() || null,
        website_scraped: false,
        added_by: user.id,
      })
      .select('id, brand_name, website_url, notes, website_scraped, created_at, updated_at')
      .single();
    if (parentErr || !parent) {
      console.error('competitors:POST parent error', parentErr);
      return NextResponse.json({ error: 'Failed to create competitor' }, { status: 500 });
    }

    // Build the per-platform rows — skip any platform with a blank
    // handle. Users create the brand first, then fill handles as they
    // find them.
    const handleEntries = handles
      ? Object.entries(handles).filter(([, v]) => v && v.trim().length > 0)
      : [];

    if (handleEntries.length > 0) {
      const platformRows = handleEntries.map(([platform, username]) => {
        const clean = (username as string).trim();
        // profile_url is required NOT NULL on client_competitors — we
        // derive a best-effort canonical URL from the handle so the
        // downstream scraper has something to work with.
        const profileUrl = buildCanonicalProfileUrl(platform, clean);
        return {
          client_id: clientId,
          competitor_id: parent.id,
          platform,
          profile_url: profileUrl,
          username: clean,
          website_scraped: false,
          added_by: user.id,
        };
      });

      const { error: platformErr } = await adminClient
        .from('client_competitors')
        .insert(platformRows);
      if (platformErr) {
        console.error('competitors:POST platform rows error', platformErr);
        // Roll back the parent so the client doesn't get a half-saved entry.
        await adminClient.from('competitors').delete().eq('id', parent.id);
        return NextResponse.json({ error: 'Failed to save handles' }, { status: 500 });
      }
    }

    return NextResponse.json({ competitor: parent });
  } catch (err) {
    console.error('competitors:POST fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildCanonicalProfileUrl(platform: string, handle: string): string {
  // Strip a leading @ so manual entries work either way.
  const h = handle.replace(/^@+/, '');
  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${h}`;
    case 'tiktok':
      return `https://tiktok.com/@${h}`;
    case 'facebook':
      return `https://facebook.com/${h}`;
    case 'youtube':
      // Accept both @handle and channel-slug forms; default to @handle.
      return `https://youtube.com/@${h}`;
    default:
      return `https://${h}`;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveAccessContext } from '@/lib/portal/effective-access';

// NAT-57 follow-up: every client has one "slot" per platform. Admins
// manage slots from the brand profile (link handle, mark no-account,
// unset); portal users see them read-only on /brand-profile.

const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;
type Platform = (typeof PLATFORMS)[number];

const upsertSchema = z.object({
  platform: z.enum(PLATFORMS),
  // Three mutually-exclusive operations on a slot:
  //   { status: 'linked', handle: '...' }      → admin-pasted handle
  //   { status: 'no_account' }                 → declared absent
  //   { status: 'unset' }                      → clear the slot
  // The Zernio-OAuth path still writes directly to social_profiles via
  // the scheduler connect flow; this endpoint is the manual/admin path.
  status: z.enum(['linked', 'no_account', 'unset']),
  handle: z.string().trim().max(200).optional().nullable(),
  profile_url: z.string().trim().max(500).optional().nullable(),
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
 * GET /api/clients/[id]/social-slots
 *
 * Return one slot per platform (IG, TT, FB, YT). If no row exists for
 * a platform, returns `{ status: 'unset' }`. This guarantees the UI
 * always has four slots to render, even for brand-new clients.
 *
 * @auth Admin OR a viewer with access to this client (portal can read
 *       its own brand's slots for display).
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

    // Viewer access check — reuse the effective-access helper so
    // impersonation works identically to the rest of the /api/clients
    // tree. `clientIds === null` means the caller is a real admin not
    // impersonating; any non-null array is a scope restriction.
    const ctx = await getEffectiveAccessContext(user, adminClient);
    if (ctx.clientIds !== null && !ctx.clientIds.includes(clientId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: rows, error } = await adminClient
      .from('social_profiles')
      .select(
        'id, platform, username, avatar_url, no_account, website_scraped, late_account_id, is_active, updated_at',
      )
      .eq('client_id', clientId)
      .in('platform', PLATFORMS as unknown as string[]);
    if (error) {
      console.error('social-slots:GET list error', error);
      return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
    }

    const byPlatform = new Map<Platform, (typeof rows)[number]>();
    for (const r of rows ?? []) byPlatform.set(r.platform as Platform, r);

    const slots = PLATFORMS.map((platform) => {
      const row = byPlatform.get(platform);
      if (!row) {
        return {
          platform,
          status: 'unset' as const,
          handle: null,
          avatar_url: null,
          zernio_connected: false,
          website_scraped: false,
          updated_at: null,
        };
      }
      if (row.no_account) {
        return {
          platform,
          status: 'no_account' as const,
          handle: null,
          avatar_url: null,
          zernio_connected: false,
          website_scraped: !!row.website_scraped,
          updated_at: row.updated_at,
        };
      }
      return {
        platform,
        status: 'linked' as const,
        handle: row.username,
        avatar_url: row.avatar_url,
        // Portal never surfaces the source, but admin UI may want to
        // know (e.g. to avoid overwriting a Zernio-connected row with
        // a manual handle edit). We expose the boolean; the portal
        // view component ignores it.
        zernio_connected: !!row.late_account_id,
        website_scraped: !!row.website_scraped,
        updated_at: row.updated_at,
      };
    });

    return NextResponse.json({ slots });
  } catch (err) {
    console.error('social-slots:GET fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/clients/[id]/social-slots
 *
 * Upsert a single slot. One of three operations based on `status`:
 *   - `linked` + `handle` → set the manual-paste handle
 *   - `no_account`        → declare absent (clears handle/tokens)
 *   - `unset`             → delete the row entirely
 *
 * Never touches the access_token_ref or late_account_id columns for
 * linked slots — those are owned by the OAuth flow, and overwriting
 * them here would kick out a connected account.
 *
 * @auth Admin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await requireAdmin();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { platform, status, handle, profile_url } = parsed.data;
    const cleanHandle = handle?.trim() || null;

    const adminClient = createAdminClient();

    // Fetch any existing slot row so we can preserve OAuth tokens when
    // an admin edits a Zernio-connected handle.
    const { data: existing } = await adminClient
      .from('social_profiles')
      .select('id, late_account_id, access_token_ref')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .maybeSingle();

    if (status === 'unset') {
      if (!existing) return NextResponse.json({ ok: true });
      const { error } = await adminClient
        .from('social_profiles')
        .delete()
        .eq('id', existing.id);
      if (error) {
        console.error('social-slots:unset error', error);
        return NextResponse.json({ error: 'Failed to clear slot' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (status === 'no_account') {
      // CHECK constraint enforces all handle/token fields are NULL.
      const row = {
        client_id: clientId,
        platform,
        platform_user_id: null,
        username: null,
        avatar_url: null,
        access_token_ref: null,
        late_account_id: null,
        no_account: true,
        website_scraped: false,
        is_active: false,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await adminClient
          .from('social_profiles')
          .update(row)
          .eq('id', existing.id);
        if (error) {
          console.error('social-slots:no_account update error', error);
          return NextResponse.json({ error: 'Failed to mark no-account' }, { status: 500 });
        }
      } else {
        const { error } = await adminClient.from('social_profiles').insert(row);
        if (error) {
          console.error('social-slots:no_account insert error', error);
          return NextResponse.json({ error: 'Failed to mark no-account' }, { status: 500 });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // status === 'linked'
    if (!cleanHandle) {
      return NextResponse.json({ error: 'handle required for linked status' }, { status: 400 });
    }
    // Derive a stable platform_user_id from the manual handle. If the
    // row later gets Zernio-connected, the OAuth flow overwrites this
    // with the real platform user id.
    const syntheticUserId = `manual:${platform}:${cleanHandle.toLowerCase()}`;

    if (existing) {
      const update: Record<string, unknown> = {
        username: cleanHandle,
        avatar_url: null,
        no_account: false,
        updated_at: new Date().toISOString(),
      };
      // Only overwrite platform_user_id if the existing one is also a
      // synthetic marker — don't clobber a real OAuth-derived id.
      const { data: cur } = await adminClient
        .from('social_profiles')
        .select('platform_user_id')
        .eq('id', existing.id)
        .single();
      if (!cur?.platform_user_id || cur.platform_user_id.startsWith('manual:')) {
        update.platform_user_id = syntheticUserId;
      }
      if (profile_url) update.avatar_url = null; // reserved; we don't store profile URL yet
      const { error } = await adminClient
        .from('social_profiles')
        .update(update)
        .eq('id', existing.id);
      if (error) {
        console.error('social-slots:linked update error', error);
        return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 });
      }
    } else {
      const row = {
        client_id: clientId,
        platform,
        platform_user_id: syntheticUserId,
        username: cleanHandle,
        avatar_url: null,
        access_token_ref: null,
        late_account_id: null,
        no_account: false,
        website_scraped: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = await adminClient.from('social_profiles').insert(row);
      if (error) {
        console.error('social-slots:linked insert error', error);
        return NextResponse.json({ error: 'Failed to link handle' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('social-slots:PATCH fatal', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

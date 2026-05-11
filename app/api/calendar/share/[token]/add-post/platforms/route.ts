import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import type { SocialPlatform } from '@/lib/posting';

interface ShareLinkRow {
  client_id: string;
  expires_at: string;
}

interface ProfileRow {
  id: string;
  platform: SocialPlatform;
  username: string | null;
  avatar_url: string | null;
  late_account_id: string | null;
  is_active: boolean;
}

/**
 * GET /api/calendar/share/[token]/add-post/platforms
 *
 * Admin-only. Returns the connected Zernio profiles for the share link's
 * client so the "+ Add new video" modal can render platform checkboxes.
 * The editor picks which platforms the new draft should target — the
 * schedule endpoint filters scheduled_post_platforms by that selection.
 *
 * Only profiles with a non-empty late_account_id are returned; the rest
 * would fail at publish time as "not connected to Zernio."
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('client_id, expires_at')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const { data: rows } = await admin
    .from('social_profiles')
    .select('id, platform, username, avatar_url, late_account_id, is_active')
    .eq('client_id', link.client_id)
    .eq('is_active', true);

  const platforms = (rows ?? [])
    .filter(
      (r): r is ProfileRow =>
        typeof (r as { late_account_id?: unknown }).late_account_id === 'string' &&
        ((r as { late_account_id: string }).late_account_id ?? '').length > 0,
    )
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      username: r.username,
      avatarUrl: r.avatar_url,
    }));

  return NextResponse.json({ platforms });
}

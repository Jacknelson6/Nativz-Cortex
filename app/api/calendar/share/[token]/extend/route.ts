import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * POST /api/calendar/share/[token]/extend
 *
 * Refreshes a calendar share link by pushing `expires_at` 30 days from
 * now and clearing `abandoned_at`. Symmetric to the revoke endpoint
 * (which sets `expires_at` to now). Used by the dialog's "Refresh link"
 * button so admins can revive an expired or about-to-expire link
 * without recreating the token (preserves comments, views, history).
 *
 * Admin-only. Returns the new `expires_at` so the caller can patch
 * UI state without a refetch.
 */

const EXTEND_DAYS = 30;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id')
    .eq('token', token)
    .single();
  if (!link) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const newExpires = new Date(Date.now() + EXTEND_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('content_drop_share_links')
    .update({ expires_at: newExpires, abandoned_at: null })
    .eq('id', link.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expires_at: newExpires });
}

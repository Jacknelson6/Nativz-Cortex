import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * POST /api/calendar/share/[token]/revoke
 *
 * Admin-only "revoke link" — sets `expires_at` to now so the next visitor
 * gets the 410 expired-link page. Non-destructive: the link row, comments,
 * and underlying drop are all kept intact, so an admin who hits revoke by
 * mistake can extend the link from elsewhere if needed.
 */
export async function POST(
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
    .select('id')
    .eq('token', token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await admin
    .from('content_drop_share_links')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', link.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

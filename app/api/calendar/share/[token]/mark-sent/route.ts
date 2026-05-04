import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * POST /api/calendar/share/[token]/mark-sent
 *
 * Stamps `first_sent_at` (if null), `last_sent_at`, and bumps `send_count`
 * without firing an email. Mirrors `/followup/manual`: this is the audit
 * trail for an out-of-band send (admin pasted the link into Gmail, Slack,
 * a text, etc.) so the DATE SENT column reflects reality.
 */

interface ShareLinkRow {
  id: string;
  expires_at: string;
  first_sent_at: string | null;
  send_count: number | null;
}

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
    .select('id, expires_at, first_sent_at, send_count')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const nowIso = new Date().toISOString();
  const nextCount = (link.send_count ?? 0) + 1;
  const update: {
    last_sent_at: string;
    send_count: number;
    first_sent_at?: string;
  } = {
    last_sent_at: nowIso,
    send_count: nextCount,
  };
  if (!link.first_sent_at) update.first_sent_at = nowIso;

  const { error: stampError } = await admin
    .from('content_drop_share_links')
    .update(update)
    .eq('id', link.id);
  if (stampError) {
    return NextResponse.json({ error: stampError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    first_sent_at: link.first_sent_at ?? nowIso,
    last_sent_at: nowIso,
    send_count: nextCount,
  });
}

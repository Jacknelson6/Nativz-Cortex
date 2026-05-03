import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * POST /api/calendar/share/[token]/followup/manual
 *
 * Records an out-of-band followup (Slack DM, text, in-person nudge) so the
 * deliverables review table's "Last followup" column reflects reality. No
 * email is sent — this is the audit trail only. Stamps `last_followup_at`
 * to now and increments `followup_count`, mirroring what the email-send
 * endpoint at `/followup` does.
 *
 * Admin-only. Returns the new timestamp + count for optimistic table patch.
 */

interface ShareLinkRow {
  id: string;
  expires_at: string;
  followup_count: number | null;
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
    .select('id, expires_at, followup_count')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const nowIso = new Date().toISOString();
  const nextCount = (link.followup_count ?? 0) + 1;
  const { error: stampError } = await admin
    .from('content_drop_share_links')
    .update({ last_followup_at: nowIso, followup_count: nextCount })
    .eq('id', link.id);
  if (stampError) {
    return NextResponse.json({ error: stampError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    last_followup_at: nowIso,
    followup_count: nextCount,
  });
}

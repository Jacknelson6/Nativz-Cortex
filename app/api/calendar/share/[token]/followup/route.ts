import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { sendCalendarFollowupEmail } from '@/lib/email/resend';

/**
 * POST /api/calendar/share/[token]/followup
 *
 * Admin-only manual nudge. The /review table renders a "Last followup"
 * column with a days-since indicator and a Send button — clicking the
 * button hits this endpoint, which emails every POC with notifications
 * enabled on `content_drop_review_contacts`, stamps the share-link's
 * `last_followup_at` to now, and increments `followup_count`. The next
 * page-load reads those columns and the days-since clock resets.
 *
 * Returns the new `last_followup_at` + `followup_count` so the table
 * can update optimistically without a full refetch.
 */

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return (trimmed.split(/\s+/)[0] || trimmed).trim();
}

interface ShareLinkRow {
  id: string;
  drop_id: string;
  expires_at: string;
  followup_count: number;
}

interface DropRow {
  id: string;
  client_id: string;
  clients: {
    id: string;
    name: string;
    agency: string | null;
  } | null;
}

interface ReviewContactRow {
  email: string | null;
  name: string | null;
  notifications_enabled: boolean | null;
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
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, expires_at, followup_count')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, clients(id, name, agency)')
    .eq('id', link.drop_id)
    .single<DropRow>();
  if (!drop) return NextResponse.json({ error: 'drop missing' }, { status: 404 });

  const clientId = drop.clients?.id ?? drop.client_id;
  const clientName = drop.clients?.name ?? 'your brand';
  const agency = getBrandFromAgency(drop.clients?.agency ?? null);

  const { data: contacts } = await admin
    .from('content_drop_review_contacts')
    .select('email, name, notifications_enabled')
    .eq('client_id', clientId)
    .returns<ReviewContactRow[]>();

  const eligible = (contacts ?? []).filter(
    (c): c is { email: string; name: string | null; notifications_enabled: boolean } =>
      !!c.email && c.notifications_enabled !== false,
  );

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: 'no review contacts with notifications enabled for this brand' },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const shareUrl = `${appUrl}/c/${token}`;
  const recipients = eligible.map((c) => c.email);
  const pocFirstNames = eligible.map((c) => firstName(c.name));

  // Send the email first; only stamp `last_followup_at` if it actually
  // went out, so a Resend outage doesn't quietly reset the clock.
  const result = await sendCalendarFollowupEmail({
    to: recipients,
    pocFirstNames,
    clientName,
    shareUrl,
    agency,
    clientId,
    dropId: link.drop_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'email send failed' },
      { status: 502 },
    );
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
    recipients_count: recipients.length,
  });
}

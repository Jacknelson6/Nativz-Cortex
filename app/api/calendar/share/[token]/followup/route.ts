import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import {
  buildCalendarFollowupDraft,
  sendCalendarFollowupEmail,
} from '@/lib/email/resend';

/**
 * GET /api/calendar/share/[token]/followup
 *   Returns the composed draft (subject + message + recipients) so the
 *   admin can preview and edit before sending.
 *
 * POST /api/calendar/share/[token]/followup
 *   Admin-only manual nudge. Optionally accepts `{ subject, message }`
 *   overrides from the draft dialog. Emails every POC with
 *   notifications enabled on `content_drop_review_contacts`, stamps
 *   the share-link's `last_followup_at` to now, and increments
 *   `followup_count`. Returns the new timestamp + count so the table
 *   can update optimistically without a full refetch.
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

async function loadFollowupContext(token: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) } as const;
  }
  if (!(await isAdmin(user.id))) {
    return { error: NextResponse.json({ error: 'admin only' }, { status: 403 }) } as const;
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, drop_id, expires_at, followup_count')
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) {
    return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) } as const;
  }
  if (new Date(link.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'link expired' }, { status: 410 }) } as const;
  }

  const { data: drop } = await admin
    .from('content_drops')
    .select('id, client_id, clients(id, name, agency)')
    .eq('id', link.drop_id)
    .single<DropRow>();
  if (!drop) {
    return { error: NextResponse.json({ error: 'drop missing' }, { status: 404 }) } as const;
  }

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

  return {
    admin,
    link,
    clientId,
    clientName,
    agency,
    eligible,
  } as const;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ctxResult = await loadFollowupContext(token);
  if ('error' in ctxResult) return ctxResult.error;

  const { eligible, clientName } = ctxResult;
  if (eligible.length === 0) {
    return NextResponse.json(
      { error: 'no review contacts with notifications enabled for this brand' },
      { status: 400 },
    );
  }

  const pocFirstNames = eligible.map((c) => firstName(c.name));
  const draft = buildCalendarFollowupDraft({ pocFirstNames, clientName });

  return NextResponse.json({
    subject: draft.subject,
    message: draft.message,
    recipients: eligible.map((c) => ({ email: c.email, name: c.name })),
    client_name: clientName,
  });
}

const PostBodySchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    message: z.string().trim().min(1).max(5000).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  // Body is optional — clicking Send without opening the dialog still
  // works (sends the default copy).
  const raw = await req.json().catch(() => ({}));
  const parsed = PostBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid override payload' },
      { status: 400 },
    );
  }

  const ctxResult = await loadFollowupContext(token);
  if ('error' in ctxResult) return ctxResult.error;

  const { admin, link, clientId, clientName, agency, eligible } = ctxResult;

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
    subjectOverride: parsed.data.subject,
    messageOverride: parsed.data.message,
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

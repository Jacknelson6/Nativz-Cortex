import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import {
  buildCalendarShareSendDraft,
  buildCalendarShareSendHtml,
  sendCalendarShareSendEmail,
} from '@/lib/email/resend';

/**
 * GET /api/calendar/share/[token]/send?variant=initial|revised
 *   Returns the composed draft (subject, message, rendered HTML, recipients,
 *   detected default variant) so the admin dialog can preview and edit
 *   before sending. The default variant flips from 'initial' to 'revised'
 *   once `first_sent_at` is stamped.
 *
 * POST /api/calendar/share/[token]/send
 *   Admin-only. Body: { variant, subject?, message? }. Sends the email,
 *   stamps `first_sent_at` (if null), `last_sent_at`, increments
 *   `send_count`. Returns the new timestamps + count so the dialog can
 *   refresh without a full reload.
 */

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return (trimmed.split(/\s+/)[0] || trimmed).trim();
}

function resolveShareUrl(brand: 'nativz' | 'anderson', token: string): string {
  const appUrl =
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
  return `${appUrl}/c/${token}`;
}

const VariantSchema = z.enum(['initial', 'revised']);

interface ShareLinkRow {
  id: string;
  drop_id: string;
  expires_at: string;
  first_sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  included_post_ids: string[];
}

interface DropRow {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
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

async function loadSendContext(token: string) {
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
    .select(
      'id, drop_id, expires_at, first_sent_at, last_sent_at, send_count, included_post_ids',
    )
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
    .select('id, client_id, start_date, end_date, clients(id, name, agency)')
    .eq('id', link.drop_id)
    .single<DropRow>();
  if (!drop) {
    return { error: NextResponse.json({ error: 'drop missing' }, { status: 404 }) } as const;
  }

  const clientId = drop.clients?.id ?? drop.client_id;
  const clientName = drop.clients?.name ?? 'your brand';
  const agency = getBrandFromAgency(drop.clients?.agency ?? null);

  // Date range scoped to the share link's included posts. Falls back to
  // the parent drop's range when posts have no scheduled_at yet.
  const includedIds = link.included_post_ids ?? [];
  let startDate = drop.start_date ?? new Date().toISOString().slice(0, 10);
  let endDate = drop.end_date ?? startDate;
  if (includedIds.length > 0) {
    const { data: posts } = await admin
      .from('scheduled_posts')
      .select('scheduled_at')
      .in('id', includedIds);
    const dates = (posts ?? [])
      .map((p) => p.scheduled_at)
      .filter((d): d is string => !!d)
      .map((d) => d.slice(0, 10))
      .sort();
    if (dates.length > 0) {
      startDate = dates[0];
      endDate = dates[dates.length - 1];
    }
  }

  const { data: contacts } = await admin
    .from('content_drop_review_contacts')
    .select('email, name, notifications_enabled')
    .eq('client_id', clientId)
    .returns<ReviewContactRow[]>();

  let eligible = (contacts ?? []).filter(
    (c): c is { email: string; name: string | null; notifications_enabled: boolean } =>
      !!c.email && c.notifications_enabled !== false,
  );

  // Fallback to the brand's POC roster (`contacts` table) when no review-
  // specific contacts have been set up. Avoids forcing admins to re-enter
  // the same people they already added to the brand profile.
  if (eligible.length === 0) {
    const { data: brandContacts } = await admin
      .from('contacts')
      .select('email, name')
      .eq('client_id', clientId)
      .not('email', 'is', null);
    eligible = (brandContacts ?? [])
      .filter((c): c is { email: string; name: string | null } => !!c.email)
      .map((c) => ({ email: c.email, name: c.name, notifications_enabled: true }));
  }

  return {
    admin,
    link,
    clientId,
    clientName,
    agency,
    eligible,
    postCount: includedIds.length,
    startDate,
    endDate,
  } as const;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ctxResult = await loadSendContext(token);
  if ('error' in ctxResult) return ctxResult.error;

  const {
    link,
    clientName,
    agency,
    eligible,
    postCount,
    startDate,
    endDate,
  } = ctxResult;

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: 'no review contacts with notifications enabled for this brand' },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const variantParam = url.searchParams.get('variant');
  const defaultVariant: 'initial' | 'revised' = link.first_sent_at ? 'revised' : 'initial';
  const variantParse = VariantSchema.safeParse(variantParam);
  const variant = variantParse.success ? variantParse.data : defaultVariant;

  const pocFirstNames = eligible.map((c) => firstName(c.name));
  const draft = buildCalendarShareSendDraft({
    variant,
    pocFirstNames,
    clientName,
    postCount,
    startDate,
    endDate,
    agency,
  });

  const shareUrl = resolveShareUrl(agency, token);
  const html = buildCalendarShareSendHtml({
    variant,
    subject: draft.subject,
    message: draft.message,
    shareUrl,
    agency,
    startDate,
    postCount,
  });

  return NextResponse.json({
    variant,
    default_variant: defaultVariant,
    subject: draft.subject,
    message: draft.message,
    html,
    share_url: shareUrl,
    recipients: eligible.map((c) => ({ email: c.email, name: c.name })),
    client_name: clientName,
    post_count: postCount,
    start_date: startDate,
    end_date: endDate,
    first_sent_at: link.first_sent_at,
    last_sent_at: link.last_sent_at,
    send_count: link.send_count ?? 0,
  });
}

const PostBodySchema = z
  .object({
    variant: VariantSchema,
    subject: z.string().trim().min(1).max(200).optional(),
    message: z.string().trim().min(1).max(5000).optional(),
  })
  .strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const raw = await req.json().catch(() => ({}));
  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ctxResult = await loadSendContext(token);
  if ('error' in ctxResult) return ctxResult.error;

  const { admin, link, clientId, clientName, agency, eligible, postCount, startDate, endDate } = ctxResult;

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: 'no review contacts with notifications enabled for this brand' },
      { status: 400 },
    );
  }

  const shareUrl = resolveShareUrl(agency, token);
  const recipients = eligible.map((c) => c.email);
  const pocFirstNames = eligible.map((c) => firstName(c.name));

  // Send first; only stamp the timestamps if Resend actually accepted the
  // payload. A failed send must not pretend the calendar went out.
  const result = await sendCalendarShareSendEmail({
    to: recipients,
    pocFirstNames,
    clientName,
    shareUrl,
    variant: parsed.data.variant,
    postCount,
    startDate,
    endDate,
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
    recipients_count: recipients.length,
    variant: parsed.data.variant,
  });
}

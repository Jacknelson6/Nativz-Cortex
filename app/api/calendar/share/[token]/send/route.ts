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
import { getClientNotificationRecipients } from '@/lib/email/notification-recipients';
import { archiveShareLinkEmail } from '@/lib/content-tools/archive-share-email';

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
  return `${appUrl}/s/${token}`;
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

  // Use the drop's date range so the email matches the date shown in the
  // share-link dialog header (`drop.start_date`/`end_date` are Postgres
  // DATE columns, immune to the UTC-slice drift that bit scheduled_at).
  const includedIds = link.included_post_ids ?? [];
  const startDate = drop.start_date ?? new Date().toISOString().slice(0, 10);
  const endDate = drop.end_date ?? startDate;

  const eligible = await getClientNotificationRecipients(admin, clientId);

  return {
    admin,
    userId: user.id,
    userEmail: user.email ?? null,
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
      { error: 'no contacts on the brand profile to email' },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const variantParam = url.searchParams.get('variant');
  const defaultVariant: 'initial' | 'revised' = link.first_sent_at ? 'revised' : 'initial';
  const variantParse = VariantSchema.safeParse(variantParam);
  const variant = variantParse.success ? variantParse.data : defaultVariant;

  // Optional override params for the live rendered preview. The dialog
  // sends these as the admin types in the "Edit copy" tab so the iframe
  // mirrors what the recipient will see, including the eyebrow / hero /
  // CTA / footer surfaces that used to be hardcoded.
  const subjectParam = url.searchParams.get('subject');
  const messageParam = url.searchParams.get('message');
  const eyebrowParam = url.searchParams.get('eyebrow');
  const heroTitleParam = url.searchParams.get('headline');
  const ctaLabelParam = url.searchParams.get('cta_label');
  const footerNoteParam = url.searchParams.get('footer_note');

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

  const subjectForPreview = subjectParam?.trim() || draft.subject;
  const messageForPreview = messageParam?.trim() || draft.message;

  const shareUrl = resolveShareUrl(agency, token);
  const html = buildCalendarShareSendHtml({
    variant,
    subject: subjectForPreview,
    message: messageForPreview,
    shareUrl,
    agency,
    startDate,
    postCount,
    eyebrowOverride: eyebrowParam ?? undefined,
    heroTitleOverride: heroTitleParam ?? undefined,
    ctaLabelOverride: ctaLabelParam ?? undefined,
    footerNoteOverride: footerNoteParam ?? undefined,
  });

  return NextResponse.json({
    variant,
    default_variant: defaultVariant,
    subject: draft.subject,
    message: draft.message,
    eyebrow: draft.eyebrow,
    headline: draft.heroTitle,
    cta_label: draft.ctaLabel,
    footer_note: draft.footerNote,
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
    // Surrounding shell overrides. Empty strings are accepted (and cleared
    // to the default at render time for eyebrow/heroTitle/ctaLabel; the
    // footer line accepts an explicit empty string to suppress the
    // "Questions or want to chat..." footer entirely).
    eyebrow: z.string().trim().max(120).optional(),
    headline: z.string().trim().max(200).optional(),
    cta_label: z.string().trim().min(1).max(80).optional(),
    footer_note: z.string().max(500).optional(),
    cc: z.array(z.string().email()).max(10).optional(),
    // Server-resolved CC: when true, the admin who clicked Send is added
    // to the cc[] list. Avoids exposing the admin's email to the client
    // bundle just so the dialog can render a "CC me" checkbox.
    cc_self: z.boolean().optional(),
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

  const { admin, userId, userEmail, link, clientId, clientName, agency, eligible, postCount, startDate, endDate } = ctxResult;

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: 'no contacts on the brand profile to email' },
      { status: 400 },
    );
  }

  const shareUrl = resolveShareUrl(agency, token);
  const recipients = eligible.map((c) => c.email);
  const pocFirstNames = eligible.map((c) => firstName(c.name));

  // Build the cc[] list. Server-resolved `cc_self` adds the admin's own
  // email; we de-dupe against `to` so the admin doesn't double-receive
  // when they're already on the brand contacts list.
  const ccCandidates = new Set<string>();
  for (const addr of parsed.data.cc ?? []) ccCandidates.add(addr.toLowerCase());
  if (parsed.data.cc_self && userEmail) ccCandidates.add(userEmail.toLowerCase());
  for (const r of recipients) ccCandidates.delete(r.toLowerCase());
  const ccList = Array.from(ccCandidates);

  // Recompute the draft locally so we have the resolved subject for the
  // archive write below; the send helper applies the same fallback chain
  // (override → draft default), so this stays in sync.
  const draft = buildCalendarShareSendDraft({
    variant: parsed.data.variant,
    pocFirstNames,
    clientName,
    postCount,
    startDate,
    endDate,
    agency,
  });
  const resolvedSubject = parsed.data.subject?.trim() || draft.subject;

  // Send first; only stamp the timestamps if Resend actually accepted the
  // payload. A failed send must not pretend the calendar went out.
  const result = await sendCalendarShareSendEmail({
    to: recipients,
    cc: ccList.length > 0 ? ccList : undefined,
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
    eyebrowOverride: parsed.data.eyebrow,
    heroTitleOverride: parsed.data.headline,
    ctaLabelOverride: parsed.data.cta_label,
    footerNoteOverride: parsed.data.footer_note,
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

  // Best-effort archive of the rendered email so the unified review modal
  // can replay "what was actually said" against this share link. A failed
  // archive must not bubble: the send already happened.
  await archiveShareLinkEmail(admin, {
    shareLinkId: link.id,
    kind: link.first_sent_at ? 'resend' : 'initial',
    subject: resolvedSubject,
    htmlBody: result.html,
    recipients: eligible.map((c) => ({ email: c.email, name: c.name })),
    sentBy: userId,
  });

  return NextResponse.json({
    ok: true,
    first_sent_at: link.first_sent_at ?? nowIso,
    last_sent_at: nowIso,
    send_count: nextCount,
    recipients_count: recipients.length,
    variant: parsed.data.variant,
  });
}

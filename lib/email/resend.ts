import { Resend } from 'resend';
import { trackUsage } from '@/lib/ai/usage';
import { getEmailBrand, getEmailLogoUrl } from '@/lib/email/brand-tokens';
import { buildAffiliateWeeklyReportCardHtml } from '@/lib/email/templates/affiliate-weekly-report-html';
import { buildWeeklySocialReportCardHtml } from '@/lib/email/templates/weekly-social-report-html';
import { buildCompetitorReportCardHtml } from '@/lib/email/templates/competitor-report-html';
import { buildUserEmailHtml } from '@/lib/email/templates/user-email';
import type { CompetitorReportData } from '@/lib/reporting/competitor-report-types';
import { getSecret } from '@/lib/secrets/store';
import type { WeeklySocialReport } from '@/lib/reporting/weekly-social-report';
import type { AgencyBrand } from '@/lib/agency/detect';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Centralized send + log wrapper ─────────────────────────────────────────
//
// Every sender in this file goes through `sendAndLog`. It writes a row to
// `email_messages` with the fully rendered HTML *before* calling Resend, then
// patches the row with the resend message id + status afterwards. This gives
// the Email Hub UI a single feed across every email type (transactional,
// system, campaign) with an inline HTML preview, and the Resend webhook
// already updates rows here by `resend_id` so delivery/open/bounce events
// flow into the same row automatically.

export type EmailCategory = 'campaign' | 'transactional' | 'system';

export interface SendAndLogInput {
  category: EmailCategory;
  typeKey: string;
  agency: AgencyBrand;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  fromOverride?: string;
  replyToOverride?: string;
  recipientName?: string | null;
  recipientUserId?: string | null;
  clientId?: string | null;
  dropId?: string | null;
  campaignId?: string | null;
  contactId?: string | null;
  attachments?: Array<{ filename: string; content: Buffer }>;
  metadata?: Record<string, unknown>;
}

export interface SendAndLogResult {
  ok: boolean;
  id: string;
  messageId: string | null;
  html: string;
  error?: string;
}

function toArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function primaryRecipient(to: string | string[]): string {
  return Array.isArray(to) ? (to[0] ?? '') : to;
}

export async function sendAndLog(input: SendAndLogInput): Promise<SendAndLogResult> {
  const admin = createAdminClient();
  const fromAddress = input.fromOverride ?? getFromAddress(input.agency);
  const replyTo = input.replyToOverride ?? getReplyTo(input.agency);

  // Insert the message row first so the UI has a record even if Resend errors.
  const insertPayload = {
    category: input.category,
    type_key: input.typeKey,
    campaign_id: input.campaignId ?? null,
    contact_id: input.contactId ?? null,
    recipient_user_id: input.recipientUserId ?? null,
    recipient_email: primaryRecipient(input.to),
    recipient_name: input.recipientName ?? null,
    agency: input.agency,
    from_address: fromAddress,
    from_name: null,
    reply_to_address: replyTo,
    cc: toArray(input.cc) ?? null,
    bcc: toArray(input.bcc) ?? null,
    subject: input.subject,
    body_html: input.html,
    status: 'sending' as const,
    client_id: input.clientId ?? null,
    drop_id: input.dropId ?? null,
    metadata: (input.metadata ?? {}) as Record<string, unknown>,
  };

  const { data: row, error: insertErr } = await admin
    .from('email_messages')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertErr || !row) {
    console.warn('[sendAndLog] failed to insert email_messages row:', insertErr);
  }
  const rowId = row?.id ?? null;

  // Build the Resend payload. Attachments use the SDK's attachment shape.
  const sendPayload: Record<string, unknown> = {
    from: fromAddress,
    replyTo,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
  if (input.cc) sendPayload.cc = input.cc;
  if (input.bcc) sendPayload.bcc = input.bcc;
  if (input.attachments && input.attachments.length > 0) {
    sendPayload.attachments = input.attachments;
  }

  try {
    // @ts-expect-error - Resend SDK accepts attachments; typed as generic Record for flexibility
    const result = await (await getResend()).emails.send(sendPayload);
    const resendId = result?.data?.id ?? null;

    if (rowId) {
      await admin
        .from('email_messages')
        .update({
          resend_id: resendId,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', rowId);
    }

    trackUsage({
      service: 'resend',
      model: 'email-api',
      feature: input.category === 'campaign' ? 'email_delivery' : 'email_delivery',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });

    return { ok: true, id: rowId ?? '', messageId: resendId, html: input.html };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown send error';
    if (rowId) {
      await admin
        .from('email_messages')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: message,
        })
        .eq('id', rowId);
    }
    return { ok: false, id: rowId ?? '', messageId: null, html: input.html, error: message };
  }
}

// Cached Resend client keyed by the API key currently in use. When the admin
// rotates RESEND_API_KEY from the Setup UI, the next read from getSecret
// returns the new value and we build a fresh client. We never reuse a client
// built against a stale key.
let _resend: Resend | null = null;
let _resendKey: string | undefined;

async function getResend(): Promise<Resend> {
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!_resend || _resendKey !== apiKey) {
    _resend = new Resend(apiKey);
    _resendKey = apiKey;
  }
  return _resend;
}

export function getFromAddress(agency: AgencyBrand): string {
  if (agency === 'anderson') return 'AC Cortex <cortex@andersoncollaborative.com>';
  return 'Nativz Cortex <cortex@nativz.io>';
}

export function getReplyTo(agency: AgencyBrand): string {
  if (agency === 'anderson') return 'jack@andersoncollaborative.com';
  return 'jack@nativz.io';
}

// ── Shared layout ────────────────────────────────────────────────────────────

export function layout(content: string, agency: AgencyBrand = 'nativz') {
  const BRAND = getEmailBrand(agency);
  const logoSrc = getEmailLogoUrl(agency);
  const isAC = agency === 'anderson';

  // Both brands: logo on transparent background, no wrapper panel needed
  const brandName = isAC ? 'Anderson Collaborative' : 'Nativz';
  const logoPanel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:28px 40px;">
          <img src="${logoSrc}" width="180" height="60" alt="${brandName}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;max-width:180px;height:auto;width:auto;" />
        </td>
      </tr>
    </table>`;

  const footerCopy = isAC
    ? `<p>&copy; ${new Date().getFullYear()} Anderson Collaborative &middot; <a href="https://cortex.andersoncollaborative.com">cortex.andersoncollaborative.com</a></p>
       <p style="margin-top:8px;"><a href="https://andersoncollaborative.com">andersoncollaborative.com</a></p>`
    : `<p>&copy; ${new Date().getFullYear()} Nativz &middot; <a href="https://cortex.nativz.io">cortex.nativz.io</a></p>
       <p style="margin-top:8px;"><a href="https://nativz.io">nativz.io</a></p>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!--suppress CheckEmptyScriptTag -->
  <style>
    body { margin: 0; padding: 0; background: ${BRAND.bgDark}; font-family: ${BRAND.fontStack}; -webkit-font-smoothing: antialiased; }
    /* Card */
    .card { background: ${BRAND.bgCard}; border: 1px solid ${BRAND.borderCard}; border-radius: 16px; padding: 36px 32px; }

    /* Typography */
    .heading { color: ${BRAND.textPrimary}; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 12px; }
    .subtext { color: ${BRAND.textBody}; font-size: 14px; line-height: 1.7; margin: 0 0 24px; }
    .small { color: ${BRAND.textMuted}; font-size: 12px; line-height: 1.6; margin: 0; }

    /* CTA Button */
    .button-wrap { text-align: center; margin: 28px 0; }
    .button {
      display: inline-block;
      background: ${BRAND.blueCta};
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 14px 36px;
      border-radius: 10px;
      mso-padding-alt: 14px 36px;
    }

    /* Divider */
    .divider { border: none; border-top: 1px solid ${BRAND.borderCard}; margin: 28px 0; }

    /* Detail rows */
    .detail-label { color: ${BRAND.textMuted}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; margin: 0 0 4px; }
    .detail-value { color: ${BRAND.textBody}; font-size: 14px; margin: 0 0 16px; }

    /* Badges */
    .badge { display: inline-block; background: ${BRAND.blueSurface}; color: ${BRAND.blue}; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.02em; }

    /* Highlight */
    .highlight { color: ${BRAND.blue}; font-weight: 600; }

    /* Feature list */
    .features { margin: 0; padding: 0; list-style: none; }
    .features li { color: ${BRAND.textBody}; font-size: 13px; padding: 6px 0; padding-left: 20px; position: relative; }
    .features li::before { content: ""; position: absolute; left: 0; top: 13px; width: 8px; height: 8px; border-radius: 50%; background: ${BRAND.blue}; opacity: 0.5; }

    /* Footer */
    .footer { text-align: center; padding-top: 36px; }
    .footer p { color: ${BRAND.textFooter}; font-size: 11px; margin: 0 0 4px; }
    .footer a { color: ${BRAND.blue}; text-decoration: none; }
    .footer-line { display: block; width: 40px; height: 2px; background: ${BRAND.blue}; opacity: 0.2; margin: 0 auto 16px; border-radius: 1px; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgDark};">
  <!-- Table shell: Gmail strips body backgrounds; bgcolor + td styles keep the logo visible. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bgDark}" style="background-color:${BRAND.bgDark};">
    <tr>
      <td align="center" style="padding:48px 24px;background-color:${BRAND.bgDark};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:${BRAND.bgDark};">
          <tr>
            <td align="center" style="padding:0 0 16px;background-color:${BRAND.bgDark};">
              ${logoPanel}
            </td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.bgDark};">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="center" class="footer" style="background-color:${BRAND.bgDark};padding-top:36px;">
              <div class="footer-line"></div>
              ${footerCopy}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Team member invite ───────────────────────────────────────────────────────

export async function sendTeamInviteEmail(opts: {
  to: string;
  memberName: string;
  inviteUrl: string;
  invitedBy: string;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  const brandName = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
  return sendAndLog({
    category: 'transactional',
    typeKey: 'team_invite',
    agency,
    to: opts.to,
    recipientName: opts.memberName,
    subject: `You're invited to ${brandName} Cortex`,
    html: layout(`
      <div class="card">
        <h1 class="heading">You're invited, ${opts.memberName}.</h1>
        <p class="subtext">
          ${opts.invitedBy} has invited you to <span class="highlight">${brandName} Cortex</span>, your team's content intelligence platform.
        </p>
        <div class="button-wrap">
          <a href="${opts.inviteUrl}" class="button">Create your account &rarr;</a>
        </div>
        <hr class="divider" />
        <p class="small">
          This link expires in 7 days. If it expires, ask your admin for a new one.
        </p>
      </div>
    `, agency),
    metadata: { invitedBy: opts.invitedBy },
  });
}

// ── Client portal invite ─────────────────────────────────────────────────────

export function buildClientInviteEmailHtml(opts: {
  contactName: string;
  clientName: string;
  inviteUrl: string;
  invitedBy: string;
  agency?: AgencyBrand;
}): string {
  const agency = opts.agency ?? 'nativz';
  // An empty/whitespace-only contactName drops the ", Name." tail so the
  // headline reads naturally. Used when we can't auto-derive a real first
  // name from the email (e.g. group inboxes, shared aliases).
  const trimmedName = opts.contactName.trim();
  const heading = trimmedName
    ? `Your portal is ready, ${trimmedName}.`
    : 'Your portal is ready.';
  return layout(`
      <div class="card">
        <h1 class="heading">${heading}</h1>
        <p class="subtext">
          Your team at <span class="highlight">${agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}</span> has set up a dedicated Cortex portal for <strong>${opts.clientName}</strong>. Set up your account to get started.
        </p>
        <div class="button-wrap">
          <a href="${opts.inviteUrl}" class="button">Set up your account &rarr;</a>
        </div>
        <hr class="divider" />
        <p class="small">
          This link expires in 7 days. Contact ${opts.invitedBy} if you need a new one.
        </p>
      </div>
    `, agency);
}

export async function sendClientInviteEmail(opts: {
  to: string;
  contactName: string;
  clientName: string;
  inviteUrl: string;
  invitedBy: string;
  agency?: AgencyBrand;
  /** Optional CC recipients, useful when an account manager wants a copy
   *  of every portal invite they fire out to a client org. */
  cc?: string | string[];
  clientId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  return sendAndLog({
    category: 'transactional',
    typeKey: 'client_invite',
    agency,
    to: opts.to,
    cc: opts.cc,
    recipientName: opts.contactName,
    clientId: opts.clientId,
    subject: `Your ${opts.clientName} Cortex portal is ready`,
    html: buildClientInviteEmailHtml(opts),
    metadata: { invitedBy: opts.invitedBy, clientName: opts.clientName },
  });
}

// ── Welcome email (after account creation) ───────────────────────────────────

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  role: 'admin' | 'viewer';
  loginUrl: string;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  return sendAndLog({
    category: 'transactional',
    typeKey: 'welcome',
    agency,
    to: opts.to,
    recipientName: opts.name,
    subject: `Welcome to Cortex`,
    html: layout(`
      <div class="card">
        <h1 class="heading">You're all set, ${opts.name}.</h1>
        <p class="subtext">
          Your Cortex account is ready. Sign in to get started.
        </p>
        <div class="button-wrap">
          <a href="${opts.loginUrl}" class="button">Sign in &rarr;</a>
        </div>
        <hr class="divider" />
        <p class="small">
          Signed up as <strong>${opts.to}</strong>
        </p>
      </div>
    `, agency),
    metadata: { role: opts.role },
  });
}

// ── Weekly affiliate analytics report ─────────────────────────────────────────

export async function sendAffiliateWeeklyReportEmail(opts: {
  to: string[];
  clientName: string;
  rangeLabel: string;
  kpis: {
    newAffiliates: number;
    totalAffiliates: number;
    activeAffiliates: number;
    referralsInPeriod: number;
    periodRevenue: number;
    totalClicks: number;
  };
  topAffiliates: { name: string; revenue: number; referrals: number }[];
  isTestOverride: boolean;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  const subjectPrefix = opts.isTestOverride ? '[Test] ' : '';
  const subject = `${subjectPrefix}Weekly affiliate report for ${opts.clientName} (${opts.rangeLabel})`;

  const cardHtml = buildAffiliateWeeklyReportCardHtml({
    clientName: opts.clientName,
    rangeLabel: opts.rangeLabel,
    kpis: opts.kpis,
    topAffiliates: opts.topAffiliates,
    agency,
  });

  return sendAndLog({
    category: 'system',
    typeKey: 'affiliate_weekly_report',
    agency,
    to: opts.to,
    subject,
    html: layout(cardHtml, agency),
    metadata: {
      clientName: opts.clientName,
      rangeLabel: opts.rangeLabel,
      isTestOverride: opts.isTestOverride,
    },
  });
}

// ── Weekly branded social report ──────────────────────────────────────────

export async function sendWeeklySocialReportEmail(opts: {
  to: string[];
  report: WeeklySocialReport;
  rangeLabel: string;
  isTestOverride: boolean;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  const subjectPrefix = opts.isTestOverride ? '[Test] ' : '';
  const subject = `${subjectPrefix}Weekly recap for ${opts.report.clientName} (${opts.rangeLabel})`;

  const cardHtml = buildWeeklySocialReportCardHtml({
    report: opts.report,
    rangeLabel: opts.rangeLabel,
    agency,
  });

  return sendAndLog({
    category: 'system',
    typeKey: 'weekly_social_report',
    agency,
    to: opts.to,
    subject,
    html: layout(cardHtml, agency),
    metadata: {
      clientName: opts.report.clientName,
      rangeLabel: opts.rangeLabel,
      isTestOverride: opts.isTestOverride,
    },
  });
}

// ── Search completed notification ─────────────────────────────────────────

export async function sendSearchCompletedEmail(opts: {
  to: string;
  query: string;
  clientName: string | null;
  summaryPreview: string;
  resultsUrl: string;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  const clientLine = opts.clientName
    ? `<p class="detail-label">Client</p><p class="detail-value">${opts.clientName}</p>`
    : '';

  return sendAndLog({
    category: 'transactional',
    typeKey: 'search_completed',
    agency,
    to: opts.to,
    subject: `Research ready, ${opts.query}`,
    html: layout(`
      <div class="card">
        <h1 class="heading">Your research is ready.</h1>
        <p class="subtext">
          Results for <span class="highlight">&ldquo;${opts.query}&rdquo;</span> are in.
        </p>
        <p class="small" style="margin-bottom: 24px;">
          ${opts.summaryPreview}${opts.summaryPreview.length >= 200 ? '&hellip;' : ''}
        </p>
        ${clientLine}
        <div class="button-wrap">
          <a href="${opts.resultsUrl}" class="button">View report &rarr;</a>
        </div>
      </div>
    `, agency),
    metadata: { query: opts.query, clientName: opts.clientName },
  });
}

// ── Onboarding email (ad-hoc admin → client) ───────────────────────────────
// Fires a pre-interpolated onboarding email template through Resend. Subject
// and body markdown arrive already resolved against the tracker's context -
// this function is just the transport layer. Returns a discriminated union
// so the caller can log the result either way.

export async function sendOnboardingEmail(opts: {
  to: string;
  subject: string;
  /** Markdown body, used when `html` is not provided. */
  bodyMarkdown?: string;
  /** Pre-rendered HTML override. Block-rendered templates pass this in. */
  html?: string;
  agency?: AgencyBrand;
  clientId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!opts.to.trim()) return { ok: false, error: 'Recipient email is empty' };
  if (!opts.html && !opts.bodyMarkdown) {
    return { ok: false, error: 'Either html or bodyMarkdown is required' };
  }
  const agency = opts.agency ?? 'nativz';
  const html = opts.html ?? buildUserEmailHtml(opts.bodyMarkdown!, agency);

  const result = await sendAndLog({
    category: 'transactional',
    typeKey: 'onboarding',
    agency,
    to: opts.to,
    clientId: opts.clientId ?? undefined,
    subject: opts.subject,
    html,
  });

  if (!result.ok) return { ok: false, error: result.error ?? 'Resend error' };
  if (!result.messageId) return { ok: false, error: 'Resend returned no id' };
  return { ok: true, id: result.messageId };
}

// ── Recurring competitor report ────────────────────────────────────────────

export async function sendCompetitorReportEmail(opts: {
  to: string[];
  data: CompetitorReportData;
  analyticsUrl: string;
  pdfAttachment?: { filename: string; content: Buffer } | null;
  isTestOverride?: boolean;
  agency?: AgencyBrand;
}): Promise<{ ok: true; id: string; html: string } | { ok: false; error: string; html: string }> {
  const agency = opts.agency ?? (opts.data.client_agency === 'anderson' ? 'anderson' : 'nativz');
  const subjectPrefix = opts.isTestOverride ? '[Test] ' : '';
  const rangeLabel = (() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(opts.data.period_start)} to ${fmt(opts.data.period_end)}`;
  })();
  const subject = `${subjectPrefix}Competitor update for ${opts.data.client_name} (${rangeLabel})`;

  const cardHtml = buildCompetitorReportCardHtml({
    data: opts.data,
    agency,
    analyticsUrl: opts.analyticsUrl,
  });
  const html = layout(cardHtml, agency);

  const result = await sendAndLog({
    category: 'system',
    typeKey: 'competitor_report',
    agency,
    to: opts.to,
    subject,
    html,
    attachments: opts.pdfAttachment
      ? [{ filename: opts.pdfAttachment.filename, content: opts.pdfAttachment.content }]
      : undefined,
    metadata: {
      clientName: opts.data.client_name,
      periodStart: opts.data.period_start,
      periodEnd: opts.data.period_end,
      isTestOverride: opts.isTestOverride ?? false,
    },
  });

  if (!result.ok) return { ok: false, error: result.error ?? 'Resend error', html };
  return { ok: true, id: result.messageId ?? '', html };
}

// ── Content calendar share-link comment notification ─────────────────────

export async function sendDropCommentEmail(opts: {
  to: string;
  authorName: string;
  clientName: string;
  status: 'approved' | 'changes_requested' | 'comment';
  contentPreview: string;
  dropUrl: string;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const verbBySubject = {
    approved: 'approved a post',
    changes_requested: 'requested changes',
    comment: 'left a comment',
  } as const;
  const headlineByStatus = {
    approved: 'Approved.',
    changes_requested: 'Changes requested.',
    comment: 'New comment.',
  } as const;
  const subject = `${opts.authorName} ${verbBySubject[opts.status]} on ${opts.clientName}`;

  return sendAndLog({
    category: 'transactional',
    typeKey: `calendar_comment_${opts.status}`,
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">${headlineByStatus[opts.status]}</h1>
        <p class="subtext">
          <span class="highlight">${opts.authorName}</span> ${verbBySubject[opts.status]} on the ${opts.clientName} content calendar.
        </p>
        <p class="small" style="margin-bottom: 24px;">
          &ldquo;${opts.contentPreview}&rdquo;
        </p>
        <div class="button-wrap">
          <a href="${opts.dropUrl}" class="button">Open content calendar &rarr;</a>
        </div>
      </div>
    `, agency),
    metadata: {
      authorName: opts.authorName,
      clientName: opts.clientName,
      status: opts.status,
    },
  });
}

// ── Calendar comment daily digest ────────────────────────────────────────────

export interface CalendarDigestComment {
  authorName: string;
  status: 'approved' | 'changes_requested' | 'comment';
  contentPreview: string;
  captionPreview: string;
  createdAt: string;
}

export interface CalendarDigestClientGroup {
  clientName: string;
  dropUrl: string;
  comments: CalendarDigestComment[];
}

export async function sendCalendarCommentDigestEmail(opts: {
  to: string;
  groups: CalendarDigestClientGroup[];
  windowLabel: string;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  const totalComments = opts.groups.reduce((sum, g) => sum + g.comments.length, 0);
  const subject = `${totalComments} content calendar ${totalComments === 1 ? 'comment' : 'comments'}, ${opts.windowLabel}`;

  const verbByStatus = {
    approved: 'approved',
    changes_requested: 'requested changes',
    comment: 'commented',
  } as const;

  const sections = opts.groups
    .map((g) => {
      const rows = g.comments
        .map((c) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:13px;color:#fff;"><strong>${c.authorName}</strong> ${verbByStatus[c.status]}</div>
              <div style="font-size:12px;color:#9aa3b2;margin-top:2px;">on &ldquo;${c.captionPreview}&rdquo;</div>
              ${c.contentPreview ? `<div style="font-size:12px;color:#cbd2dd;margin-top:6px;font-style:italic;">&ldquo;${c.contentPreview}&rdquo;</div>` : ''}
            </td>
          </tr>`)
        .join('');
      return `
        <div style="margin-bottom:24px;">
          <h2 style="font-size:15px;font-weight:600;color:#fff;margin:0 0 8px;">${g.clientName}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          <div style="margin-top:12px;"><a href="${g.dropUrl}" style="font-size:12px;color:#5eb6ff;text-decoration:none;">Open ${g.clientName}'s calendar &rarr;</a></div>
        </div>`;
    })
    .join('');

  return sendAndLog({
    category: 'system',
    typeKey: 'calendar_comment_digest',
    agency,
    to: opts.to,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">Yesterday's calendar activity</h1>
        <p class="subtext">
          ${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${opts.groups.length} ${opts.groups.length === 1 ? 'client' : 'clients'}, ${opts.windowLabel}.
        </p>
        ${sections}
      </div>
    `, agency),
    metadata: {
      totalComments,
      windowLabel: opts.windowLabel,
      groupCount: opts.groups.length,
    },
  });
}

// ── Calendar reminder cadence (no-open / no-action / final-call) ────────────

export async function sendCalendarNoOpenReminderEmail(opts: {
  to: string;
  clientName: string;
  shareUrl: string;
  hours: number;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const subject = `Friendly nudge, your content calendar is ready to review`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_no_open_reminder',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">Your content calendar is waiting</h1>
        <p class="subtext">Hey ${opts.clientName}, we sent over your latest content calendar about ${opts.hours} hours ago and it hasn't been opened yet. Take a quick look and let us know if anything needs tweaking.</p>
        <div style="margin-top:18px;">
          <a href="${opts.shareUrl}" class="btn">Open your calendar</a>
        </div>
      </div>
    `, agency),
    metadata: { clientName: opts.clientName, hours: opts.hours },
  });
}

export async function sendCalendarNoActionReminderEmail(opts: {
  to: string;
  clientName: string;
  shareUrl: string;
  hours: number;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const subject = `Quick check-in on your content calendar`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_no_action_reminder',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">How's the calendar looking?</h1>
        <p class="subtext">Hey ${opts.clientName}, you opened the calendar but haven't approved or requested changes on any posts yet. We just want to make sure nothing's blocking you. Hit reply or drop comments directly on the posts.</p>
        <div style="margin-top:18px;">
          <a href="${opts.shareUrl}" class="btn">Review the posts</a>
        </div>
      </div>
    `, agency),
    metadata: { clientName: opts.clientName, hours: opts.hours },
  });
}

/**
 * Generic admin-triggered "checking in on the calendar" nudge. Powers the
 * /review table's "Send followup" button — the admin flips it manually
 * when the days-since-last-followup indicator hits yellow/red. Doesn't
 * assume a particular client state (open vs. unopened, viewed vs. acted
 * on), unlike the time-of-day reminder helpers above. Recipients get a
 * single shared email with their first names comma-joined in the
 * greeting so it doesn't read like an autoresponder.
 */
export async function sendCalendarFollowupEmail(opts: {
  to: string | string[];
  pocFirstNames: string[];
  clientName: string;
  shareUrl: string;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const greetingNames = opts.pocFirstNames.length
    ? opts.pocFirstNames.join(', ')
    : opts.clientName;
  const subject = `Checking in on your content calendar`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_followup',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">Quick check-in</h1>
        <p class="subtext">Hey ${greetingNames}, just circling back on the latest content calendar for ${opts.clientName}. Whenever you have a few minutes, take a look and either approve the posts or drop comments where anything needs to change.</p>
        <p class="subtext" style="margin-top:10px;">No rush — but the sooner we hear from you, the sooner the team can lock everything in.</p>
        <div style="margin-top:18px;">
          <a href="${opts.shareUrl}" class="btn">Open the calendar</a>
        </div>
      </div>
    `, agency),
    metadata: { clientName: opts.clientName, pocFirstNames: opts.pocFirstNames },
  });
}

export async function sendCalendarFinalCallEmail(opts: {
  to: string;
  clientName: string;
  shareUrl: string;
  firstPostAt: string;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const subject = `Heads up, first post goes live ${opts.firstPostAt}`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_final_call',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">Final call before we publish</h1>
        <p class="subtext">Hey ${opts.clientName}, your first scheduled post goes live ${opts.firstPostAt}. We haven't heard back yet, so unless you flag something we'll publish on the dates you saw in the calendar.</p>
        <p class="subtext" style="margin-top:10px;">If anything needs to change, drop a comment on the post or hit reply now.</p>
        <div style="margin-top:18px;">
          <a href="${opts.shareUrl}" class="btn">Open the calendar</a>
        </div>
      </div>
    `, agency),
    metadata: { clientName: opts.clientName, firstPostAt: opts.firstPostAt },
  });
}

/**
 * Initial "your content calendar is ready" delivery email.
 *
 * Copy is intentionally informal:
 *   • Greets POC by first name (or comma-joined first names if multiple)
 *   • Uses month name ("May") not ISO ("2026-05")
 *   • Optional `firstRoundIntro` paragraph for the inaugural email cycle
 *     where we tell clients calendars now arrive via email so the team can
 *     turn revisions faster
 */
export async function sendCalendarDeliveryEmail(opts: {
  to: string | string[];
  pocFirstNames: string[];
  clientName: string;
  postCount: number;
  /** YYYY-MM-DD, first scheduled post date, used to derive the month label */
  startDate: string;
  /** YYYY-MM-DD, last scheduled post date */
  endDate: string;
  shareUrl: string;
  /** Show the "calendars now arrive via email moving forward" intro */
  firstRoundIntro?: boolean;
  agency?: AgencyBrand;
  cc?: string | string[];
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const isAC = agency === 'anderson';
  const teamShort = isAC ? 'the AC team' : 'the Nativz team';
  const monthLabel = new Date(`${opts.startDate}T00:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const greeting = opts.pocFirstNames.length > 0
    ? `Hey ${humanizeNameList(opts.pocFirstNames)}`
    : `Hey ${opts.clientName}`;
  const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';

  const introBlock = opts.firstRoundIntro
    ? `<p class="subtext" style="text-align:center; margin-top:12px;">
         Quick heads up: content calendars are now landing in your inbox so we can
         turn revisions around faster. Reply, comment on a post, or approve everything in one click.
       </p>`
    : '';

  const subject = `Your ${monthLabel} content calendar from ${isAC ? 'Anderson Collaborative' : 'Nativz'} is ready`;

  const html = layout(`
    <div class="card">
      <h1 class="heading" style="text-align:center;">Your ${monthLabel} content calendar is ready</h1>
      <p class="subtext" style="text-align:center;">
        ${greeting}, ${teamShort} just dropped <span class="highlight">${opts.postCount} posts</span>
        for you to review, scheduled across ${formatDateLabel(opts.startDate)} to ${formatDateLabel(opts.endDate)}.
        Tap the button below to watch the videos, read the captions, and approve or
        request changes one post at a time.
      </p>
      ${introBlock}
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="button">Open content calendar &rarr;</a>
      </div>
      <p class="small" style="text-align:center; margin-top:24px;">
        Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
      </p>
    </div>
  `, agency);

  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_delivery',
    agency,
    to: opts.to,
    cc: opts.cc,
    subject,
    html,
    replyToOverride: replyTo,
    clientId: opts.clientId,
    dropId: opts.dropId,
    metadata: {
      clientName: opts.clientName,
      postCount: opts.postCount,
      startDate: opts.startDate,
      endDate: opts.endDate,
      firstRoundIntro: !!opts.firstRoundIntro,
      pocFirstNames: opts.pocFirstNames,
    },
  });
}

/**
 * Variant of sendCalendarDeliveryEmail for POCs who manage multiple brands.
 * Renders one shipment with a sub-section per calendar (own heading, post
 * count, date range, share button) so each calendar can be opened/approved
 * independently.
 */
export async function sendCombinedCalendarDeliveryEmail(opts: {
  to: string | string[];
  pocFirstNames: string[];
  calendars: Array<{
    clientName: string;
    postCount: number;
    startDate: string;
    endDate: string;
    shareUrl: string;
  }>;
  firstRoundIntro?: boolean;
  agency?: AgencyBrand;
  cc?: string | string[];
}) {
  if (opts.calendars.length === 0) throw new Error('calendars must not be empty');

  const agency = opts.agency ?? 'nativz';
  const isAC = agency === 'anderson';
  const teamShort = isAC ? 'the AC team' : 'the Nativz team';
  const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';

  const monthLabel = new Date(`${opts.calendars[0].startDate}T00:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const greeting = opts.pocFirstNames.length > 0
    ? `Hey ${humanizeNameList(opts.pocFirstNames)}`
    : 'Hey there';
  const brandList = humanizeNameList(opts.calendars.map((c) => c.clientName));

  const introBlock = opts.firstRoundIntro
    ? `<p class="subtext" style="text-align:center; margin-top:12px;">
         Quick heads up: content calendars are now landing in your inbox so we can
         turn revisions around faster. Reply, comment on a post, or approve everything in one click.
       </p>`
    : '';

  const calendarSections = opts.calendars
    .map(
      (c) => `
        <div class="card" style="margin-top:16px;">
          <h2 class="heading" style="text-align:center; font-size:20px;">${c.clientName}</h2>
          <p class="subtext" style="text-align:center;">
            <span class="highlight">${c.postCount} posts</span>
            scheduled ${formatDateLabel(c.startDate)} to ${formatDateLabel(c.endDate)}.
          </p>
          <div class="button-wrap">
            <a href="${c.shareUrl}" class="button">Open ${c.clientName} calendar &rarr;</a>
          </div>
        </div>
      `,
    )
    .join('');

  const subject = `Your ${monthLabel} content calendars from ${isAC ? 'Anderson Collaborative' : 'Nativz'} are ready`;

  const html = layout(`
    <div class="card">
      <h1 class="heading" style="text-align:center;">Your ${monthLabel} content calendars are ready</h1>
      <p class="subtext" style="text-align:center;">
        ${greeting}, ${teamShort} just dropped fresh calendars for ${brandList}.
        Each one has its own button below, tap in to watch the videos, read the
        captions, and approve or request changes one post at a time.
      </p>
      ${introBlock}
    </div>
    ${calendarSections}
    <div class="card" style="margin-top:16px;">
      <p class="small" style="text-align:center;">
        Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
      </p>
    </div>
  `, agency);

  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_delivery_combined',
    agency,
    to: opts.to,
    cc: opts.cc,
    subject,
    html,
    replyToOverride: replyTo,
    metadata: {
      pocFirstNames: opts.pocFirstNames,
      calendars: opts.calendars,
      firstRoundIntro: !!opts.firstRoundIntro,
    },
  });
}

function humanizeNameList(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length <= 1) return cleaned[0] ?? '';
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

function formatDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export async function sendCalendarRevisionsCompleteEmail(opts: {
  to: string;
  clientName: string;
  shareUrl: string;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const subject = 'Your revisions are ready to review';
  const html = layout(`
    <div class="card">
      <h1 class="heading">Revisions complete</h1>
      <p class="subtext">Hey ${opts.clientName}, we've worked through every change you flagged. Hop back in to take a final look and approve the posts you're happy with.</p>
      <div style="margin-top:18px;">
        <a href="${opts.shareUrl}" class="btn">Review the updated posts</a>
      </div>
    </div>
  `, agency);

  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_revisions_complete',
    agency,
    to: opts.to,
    subject,
    html,
    clientId: opts.clientId,
    dropId: opts.dropId,
    metadata: {
      clientName: opts.clientName,
    },
  });
}

// ── Revised videos ready (manual "Notify client" from share link) ─────────
//
// Fires when an editor uploads new cuts in response to changes_requested
// rows and clicks the "Notify client" toast on /c/[token]. The body
// summarizes what was asked + (implicitly) addressed, so reviewers can
// open the link knowing exactly which posts to re-watch.
//
// Per-post `changes` is the raw text of every `changes_requested` comment
// on that post's review_link, ordered oldest → newest. We render them as
// blockquoted bullets, quoting (rather than paraphrasing) keeps the email
// truthful: the reviewer sees their own words, so there's no "did you
// actually fix this?" ambiguity.

export async function sendCalendarRevisedVideosEmail(opts: {
  to: string | string[];
  cc?: string | string[];
  pocFirstNames: string[];
  clientName: string;
  shareUrl: string;
  /** Past-tense action bullets describing what the editing team did this
   *  round, already AI-rephrased upstream (see lib/calendar/summarize-
   *  revisions.ts). Pass [] when there were no recorded change requests -
   *  the email then ships without the "what we did" section. */
  summaryBullets: string[];
  /** How many videos were re-uploaded this round; drives subject + lead. */
  revisedCount: number;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
  /** Test-mode flag prepends "[Test]" to the subject so the recipient knows
   *  this isn't the real notification fired by their button click. */
  isTestOverride?: boolean;
}) {
  const agency = opts.agency ?? 'nativz';
  const isAC = agency === 'anderson';
  const teamLabel = isAC ? 'AC editing team' : 'Nativz editing team';
  const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
  const greeting = opts.pocFirstNames.length > 0
    ? `Hey ${humanizeNameList(opts.pocFirstNames)}`
    : `Hey ${opts.clientName}`;
  const count = opts.revisedCount;
  const word = count === 1 ? 'video' : 'videos';
  const subjectPrefix = opts.isTestOverride ? '[Test] ' : '';
  const subject = `${subjectPrefix}${opts.clientName}: revised ${word} ready for review`;

  // The bulleted "what we did" list is wrapped in an inline-block so the list
  // itself stays left-aligned (readable) while the wrapper sits centered on
  // the row. Without this, centering the card would also center each bullet,
  // which looks chaotic when bullets vary in length.
  const summarySection = opts.summaryBullets.length > 0
    ? `
        <p class="subtext" style="margin-top:18px;text-align:center;">Here's what we did:</p>
        <div style="text-align:center;">
          <ul style="margin:8px 0 0;padding:0 0 0 20px;display:inline-block;text-align:left;">
            ${opts.summaryBullets
              .map(
                (b) =>
                  `<li style="color:#cbd2dd;font-size:14px;line-height:1.55;margin:0 0 6px;">${escapeAlertHtml(b)}</li>`,
              )
              .join('')}
          </ul>
        </div>
      `
    : '';

  const html = layout(`
    <div class="card" style="text-align:center;">
      <h1 class="heading" style="text-align:center;">Revised ${word} ready for review</h1>
      <p class="subtext" style="text-align:center;">
        ${greeting},
      </p>
      <p class="subtext" style="text-align:center;">
        The ${teamLabel} has implemented the requested changes and the revised
        calendar is ready for review!
      </p>
      ${summarySection}
      <div class="button-wrap" style="margin-top:24px;text-align:center;">
        <a href="${opts.shareUrl}" class="button">Re-review the calendar &rarr;</a>
      </div>
      <p class="subtext" style="margin-top:24px;text-align:center;">
        If there's any more feedback please let us know, or mark each post as
        approved if it matches what you were looking for.
      </p>
      <p class="small" style="text-align:center; margin-top:24px;">
        Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
      </p>
    </div>
  `, agency);

  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_revised_videos',
    agency,
    to: opts.to,
    cc: opts.cc,
    subject,
    html,
    replyToOverride: replyTo,
    clientId: opts.clientId,
    dropId: opts.dropId,
    metadata: {
      clientName: opts.clientName,
      revisedCount: count,
      summaryBulletsCount: opts.summaryBullets.length,
      pocFirstNames: opts.pocFirstNames,
      isTestOverride: !!opts.isTestOverride,
    },
  });
}

// ── Post-health alert (ops digest) ────────────────────────────────────────────
//
// Sent by /api/cron/post-health when posts fail or social profiles disconnect.
// Always Nativz-branded, agency split would just add noise for an internal
// ops alert. Same body content also goes out via Google Chat + in-app.

export interface PostHealthFailedPost {
  postId: string;
  clientName: string;
  caption: string | null;
  scheduledFor: string | null;
  failureReason: string | null;
  retryCount: number;
}

export interface PostHealthDisconnect {
  profileId: string;
  clientName: string;
  platform: string;
  username: string | null;
}

export async function sendPostHealthAlertEmail(opts: {
  to: string;
  failedPosts: PostHealthFailedPost[];
  disconnects: PostHealthDisconnect[];
}) {
  const { failedPosts, disconnects } = opts;
  if (failedPosts.length === 0 && disconnects.length === 0) return null;

  const failedSection = failedPosts.length === 0 ? '' : `
    <h2 style="color:#fff;font-size:16px;font-weight:700;margin:0 0 12px;">Failed posts (${failedPosts.length})</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${failedPosts.map((p) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1f2937;">
            <p style="margin:0 0 4px;color:#fff;font-size:14px;font-weight:600;">${escapeAlertHtml(p.clientName)}</p>
            <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">
              ${p.scheduledFor ? new Date(p.scheduledFor).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'no scheduled time'} · retries: ${p.retryCount}
            </p>
            ${p.caption ? `<p style="margin:0 0 6px;color:#cbd5e1;font-size:13px;line-height:1.5;">${escapeAlertHtml(truncateAlert(p.caption, 120))}</p>` : ''}
            ${p.failureReason ? `<p style="margin:0;color:#fca5a5;font-size:12px;font-family:ui-monospace,Menlo,monospace;">${escapeAlertHtml(truncateAlert(p.failureReason, 240))}</p>` : ''}
          </td>
        </tr>
      `).join('')}
    </table>
  `;

  const disconnectSection = disconnects.length === 0 ? '' : `
    <h2 style="color:#fff;font-size:16px;font-weight:700;margin:0 0 12px;">Disconnected accounts (${disconnects.length})</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${disconnects.map((d) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1f2937;">
            <p style="margin:0 0 4px;color:#fff;font-size:14px;font-weight:600;">${escapeAlertHtml(d.clientName)}</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              ${escapeAlertHtml(d.platform)}${d.username ? ` · @${escapeAlertHtml(d.username)}` : ''}
            </p>
          </td>
        </tr>
      `).join('')}
    </table>
  `;

  const subjectParts: string[] = [];
  if (failedPosts.length > 0) subjectParts.push(`${failedPosts.length} failed post${failedPosts.length === 1 ? '' : 's'}`);
  if (disconnects.length > 0) subjectParts.push(`${disconnects.length} disconnect${disconnects.length === 1 ? '' : 's'}`);
  const subject = `[Cortex] ${subjectParts.join(' · ')}`;

  const html = layout(`
    <div class="card">
      <h1 class="heading">Posting health alert</h1>
      <p class="subtext">
        The post-health cron picked up new issues. Each row fires once, re-posts and reconnects clear automatically.
      </p>
      ${failedSection}
      ${disconnectSection}
      <div class="button-wrap">
        <a href="https://cortex.nativz.io/admin/calendar" class="button">Open the calendar &rarr;</a>
      </div>
    </div>
  `, 'nativz');

  return sendAndLog({
    category: 'system',
    typeKey: 'post_health_alert',
    agency: 'nativz',
    to: opts.to,
    subject,
    html,
    metadata: {
      failedCount: failedPosts.length,
      disconnectCount: disconnects.length,
      failedPosts: failedPosts.map((p) => ({
        postId: p.postId,
        clientName: p.clientName,
        retryCount: p.retryCount,
      })),
      disconnects: disconnects.map((d) => ({
        profileId: d.profileId,
        clientName: d.clientName,
        platform: d.platform,
      })),
    },
  });
}

function escapeAlertHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateAlert(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

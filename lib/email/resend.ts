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
  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
    subject: `You're invited to ${brandName} Cortex`,
    html: layout(`
      <div class="card">
        <h1 class="heading">You're invited, ${opts.memberName}.</h1>
        <p class="subtext">
          ${opts.invitedBy} has invited you to <span class="highlight">${brandName} Cortex</span> — your team's content intelligence platform.
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
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
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
  /** Optional CC recipients — useful when an account manager wants a copy
   *  of every portal invite they fire out to a client org. */
  cc?: string | string[];
}) {
  const agency = opts.agency ?? 'nativz';
  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
    cc: opts.cc,
    subject: `${opts.clientName} — Your Cortex portal is ready`,
    html: buildClientInviteEmailHtml(opts),
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
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
  const isTeam = opts.role === 'admin';
  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
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
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
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
  const subject = `${subjectPrefix}Weekly affiliate report — ${opts.clientName} (${opts.rangeLabel})`;

  const cardHtml = buildAffiliateWeeklyReportCardHtml({
    clientName: opts.clientName,
    rangeLabel: opts.rangeLabel,
    kpis: opts.kpis,
    topAffiliates: opts.topAffiliates,
    agency,
  });

  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
    subject,
    html: layout(cardHtml, agency),
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
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
  const subject = `${subjectPrefix}Weekly recap — ${opts.report.clientName} (${opts.rangeLabel})`;

  const cardHtml = buildWeeklySocialReportCardHtml({
    report: opts.report,
    rangeLabel: opts.rangeLabel,
    agency,
  });

  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: opts.to,
    subject,
    html: layout(cardHtml, agency),
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
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

  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
    subject: `Research ready — ${opts.query}`,
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
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
}

// ── Onboarding email (ad-hoc admin → client) ───────────────────────────────
// Fires a pre-interpolated onboarding email template through Resend. Subject
// and body markdown arrive already resolved against the tracker's context —
// this function is just the transport layer. Returns a discriminated union
// so the caller can log the result either way.

export async function sendOnboardingEmail(opts: {
  to: string;
  subject: string;
  /** Markdown body — used when `html` is not provided. */
  bodyMarkdown?: string;
  /** Pre-rendered HTML override. Block-rendered templates pass this in. */
  html?: string;
  agency?: AgencyBrand;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!opts.to.trim()) return { ok: false, error: 'Recipient email is empty' };
  if (!opts.html && !opts.bodyMarkdown) {
    return { ok: false, error: 'Either html or bodyMarkdown is required' };
  }
  const agency = opts.agency ?? 'nativz';

  try {
    const html = opts.html ?? buildUserEmailHtml(opts.bodyMarkdown!, agency);
    const result = await (await getResend()).emails.send({
      from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
      to: opts.to,
      subject: opts.subject,
      html,
    });
    if (result.error) return { ok: false, error: result.error.message || 'Resend error' };
    const id = result.data?.id;
    if (!id) return { ok: false, error: 'Resend returned no id' };

    trackUsage({
      service: 'resend',
      model: 'email-api',
      feature: 'onboarding_send',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });

    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown send error' };
  }
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
    return `${fmt(opts.data.period_start)} – ${fmt(opts.data.period_end)}`;
  })();
  const subject = `${subjectPrefix}Competitor update — ${opts.data.client_name} (${rangeLabel})`;

  const cardHtml = buildCompetitorReportCardHtml({
    data: opts.data,
    agency,
    analyticsUrl: opts.analyticsUrl,
  });
  const html = layout(cardHtml, agency);

  try {
    const sendPayload: Record<string, unknown> = {
      from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
      to: opts.to,
      subject,
      html,
    };
    if (opts.pdfAttachment) {
      sendPayload.attachments = [
        {
          filename: opts.pdfAttachment.filename,
          content: opts.pdfAttachment.content,
        },
      ];
    }
    // @ts-expect-error - Resend SDK accepts attachments; typed as generic Record for flexibility
    const result = await (await getResend()).emails.send(sendPayload);
    trackUsage({
      service: 'resend',
      model: 'email-api',
      feature: 'email_delivery',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
    const id = result?.data?.id ?? '';
    return { ok: true, id, html };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown send error',
      html,
    };
  }
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
  const subject = `${opts.authorName} ${verbBySubject[opts.status]} — ${opts.clientName}`;

  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: opts.to,
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
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
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
  const subject = `${totalComments} content calendar ${totalComments === 1 ? 'comment' : 'comments'} — ${opts.windowLabel}`;

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

  const result = await (await getResend()).emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: opts.to,
    subject,
    html: layout(`
      <div class="card">
        <h1 class="heading">Yesterday's calendar activity</h1>
        <p class="subtext">
          ${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${opts.groups.length} ${opts.groups.length === 1 ? 'client' : 'clients'} — ${opts.windowLabel}.
        </p>
        ${sections}
      </div>
    `, agency),
  });

  trackUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  });

  return result;
}

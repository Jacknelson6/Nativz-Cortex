import { Resend } from 'resend';
import { logUsage } from '@/lib/ai/usage';
import { getEmailBrand, getEmailLogoUrl } from '@/lib/email/brand-tokens';
import { buildAffiliateWeeklyReportCardHtml } from '@/lib/email/templates/affiliate-weekly-report-html';
import { buildWeeklySocialReportCardHtml } from '@/lib/email/templates/weekly-social-report-html';
import type { WeeklySocialReport } from '@/lib/reporting/weekly-social-report';
import type { AgencyBrand } from '@/lib/agency/detect';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
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
  const result = await getResend().emails.send({
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

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

  return result;
}

// ── Client portal invite ─────────────────────────────────────────────────────

export async function sendClientInviteEmail(opts: {
  to: string;
  contactName: string;
  clientName: string;
  inviteUrl: string;
  invitedBy: string;
  agency?: AgencyBrand;
}) {
  const agency = opts.agency ?? 'nativz';
  const result = await getResend().emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
    subject: `${opts.clientName} — Your Cortex portal is ready`,
    html: layout(`
      <div class="card">
        <h1 class="heading">Your portal is ready, ${opts.contactName}.</h1>
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
    `, agency),
  });

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

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
  const result = await getResend().emails.send({
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

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

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
  });

  const result = await getResend().emails.send({
    from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
    to: opts.to,
    subject,
    html: layout(cardHtml, agency),
  });

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

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

  const result = await getResend().emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: opts.to,
    subject,
    html: layout(cardHtml, agency),
  });

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

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

  const result = await getResend().emails.send({
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

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

  return result;
}

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
//
// Wraps inner email content in the canonical Trevor-designed shell:
//   - Light page background (#f4f6f9)
//   - White rounded card with shadow
//   - Dark gradient header (logo + accent stripe along the bottom)
//   - Body in the white card
//   - Footer below the card with tagline + address + website link
//
// Mirrors `emailShell()` in andersoncollab/nativz-docs and
// Anderson-Collaborative/ac-docs so every Cortex email is visually identical
// to Trevor's onboarding/agreement emails. Brand-specific tokens come from
// `getEmailBrand(agency)`.
//
// Existing class names (`.card`, `.heading`, `.subtext`, `.button`, etc.) are
// preserved for backward compatibility but their styles flip from the old
// dark-on-dark palette to the new light-card palette so existing senders
// inherit the Trevor look without per-template edits.

export function layout(
  content: string,
  agency: AgencyBrand = 'nativz',
  options: { eyebrow?: string | false; heroTitle?: string } = {},
) {
  const BRAND = getEmailBrand(agency);
  const logoSrc = getEmailLogoUrl(agency);

  // Eyebrow: explicit string overrides the default; `false` suppresses
  // entirely (used by Nativz where the logo PNG already includes the
  // wordmark, so reprinting "NATIVZ" reads as redundant). When omitted,
  // fall back to the brand name so the existing Trevor pattern still
  // renders for AC.
  const eyebrowText =
    options.eyebrow === false
      ? null
      : options.eyebrow ?? BRAND.brandName;

  // Hero title slot — when present, renders a large white H1 inside the
  // dark hero card below the eyebrow. Use this when you want the headline
  // to live on the dark gradient (premium / editorial feel) instead of
  // appearing on the white body card.
  const heroTitle = options.heroTitle ?? null;

  // Mirrors Trevor's docs-repo shell: load brand display fonts via Google
  // Fonts so the hero title + eyebrow render in the right typeface in clients
  // that allow webfonts (Apple Mail, iOS Mail, most desktop clients). Outlook
  // strips this and falls back to the system stack, which is fine.
  const fontHref =
    agency === 'anderson'
      ? 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&family=Rubik:wght@400;500;600&display=swap'
      : 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <!--[if !mso]><!--><link href="${fontHref}" rel="stylesheet" /><!--<![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; background: ${BRAND.pageBg}; font-family: ${BRAND.fontStack}; -webkit-font-smoothing: antialiased; }
    .wrap { max-width: 620px; margin: 0 auto; padding: 32px 16px; color: ${BRAND.textPrimary}; }

    /* Card with dark gradient header strip. Class is intentionally unique
       so existing inner blocks that use <div class="card"> stay harmless. */
    .nz-shell { background: ${BRAND.cardBg}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(10, 22, 40, 0.08); }
    .nz-shell-header { background: linear-gradient(135deg, ${BRAND.headerGradStart} 0%, ${BRAND.headerGradEnd} 100%); padding: ${BRAND.headerPadding}; position: relative; text-align: left; }
    .nz-shell-header::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(to right, ${BRAND.accent}, ${BRAND.accentDark}); }
    .logo { display: block; height: ${BRAND.logoHeight}; width: auto; margin: 0 0 ${BRAND.logoMarginBottom}; }
    .eyebrow { font-size: 11px; font-weight: ${BRAND.eyebrowWeight}; letter-spacing: ${BRAND.eyebrowLetterSpacing}; text-transform: uppercase; color: ${BRAND.accent} !important; margin: 0; text-align: left; }
    .hero-title { font-family: ${BRAND.titleFontStack}; color: #ffffff !important; font-size: ${BRAND.titleSize}; font-weight: ${BRAND.titleWeight}; letter-spacing: ${BRAND.titleLetterSpacing}; line-height: ${BRAND.titleLineHeight}; margin: 14px 0 0; max-width: 460px; text-align: left; mso-line-height-rule: exactly; }
    .hero-title font { color: #ffffff !important; }
    .nz-shell-body { padding: 32px 32px 28px; background: ${BRAND.cardBg}; text-align: left; }
    /* Strip any nested <div class="card"> styling so legacy templates passthrough. */
    .nz-shell-body .card { background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; border-radius: 0 !important; }

    /* Typography */
    .heading { font-family: ${BRAND.titleFontStack}; color: ${BRAND.textPrimary}; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 14px; line-height: 1.3; }
    .subtext { color: ${BRAND.textBody}; font-size: 14px; line-height: 1.7; margin: 0 0 18px; }
    .small { color: ${BRAND.textMuted}; font-size: 12px; line-height: 1.6; margin: 0; }

    /* CTA. Mirrors Trevor's docs-repo .cta rule (bright brand accent
       background, 14px / 32px padding, 10px radius, weight 700, 15px) but
       with white text per Jack's preference. */
    .button-wrap { text-align: center; margin: 24px 0 8px; }
    .button, .btn {
      display: inline-block;
      background: ${BRAND.accent};
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 10px;
      font-size: 15px;
      letter-spacing: 0.01em;
      mso-padding-alt: 14px 32px;
    }
    .button font, .btn font { color: #ffffff !important; }

    /* Divider */
    .divider { border: none; border-top: 1px solid ${BRAND.border}; margin: 24px 0; }

    /* Stats panel (used by transactional templates) */
    .stats { background: ${BRAND.panelBg}; border: 1px solid ${BRAND.border}; border-left: 3px solid ${BRAND.accent}; border-radius: 8px; padding: 16px 18px; margin: 18px 0 6px; }
    .stats table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .stats td { padding: 5px 0; vertical-align: top; }
    .stats td.k { color: ${BRAND.textMuted}; width: 140px; }
    .stats td.v { color: ${BRAND.textPrimary}; font-weight: 600; }

    /* Detail rows (legacy class) */
    .detail-label { color: ${BRAND.textMuted}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; margin: 0 0 4px; }
    .detail-value { color: ${BRAND.textBody}; font-size: 14px; margin: 0 0 16px; }

    /* Badges + highlights */
    .badge { display: inline-block; background: ${BRAND.accentSurface}; color: ${BRAND.accentDark}; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; letter-spacing: 0.02em; }
    .highlight { color: ${BRAND.accentDark}; font-weight: 600; }

    /* Feature list */
    .features { margin: 0; padding: 0; list-style: none; }
    .features li { color: ${BRAND.textBody}; font-size: 13px; padding: 6px 0; padding-left: 20px; position: relative; }
    .features li::before { content: ""; position: absolute; left: 0; top: 13px; width: 8px; height: 8px; border-radius: 50%; background: ${BRAND.accent}; opacity: 0.7; }

    /* Footer */
    .footer { text-align: center; padding-top: 0; margin-top: 16px; }
    .footer p { color: ${BRAND.textMuted}; font-size: 11px; margin: 0 0 4px; line-height: 1.55; }
    .footer a { color: ${BRAND.accentDark}; text-decoration: none; }
    .tagline { font-style: italic; color: ${BRAND.textMuted}; font-size: 11.5px; letter-spacing: 0.01em; margin: 14px 0 0; text-align: center; }

    /* Dark-mode preservation. Email clients (iOS Mail, Gmail, Outlook.com)
       auto-invert "light" content for dark UI. Our shell is already dark on
       purpose, so re-assert key colors and force the gradient header to keep
       its hue. [data-ogsc] / [data-ogsb] = Outlook.com web; u + .body styling
       = Apple Mail dark mode. */
    @media (prefers-color-scheme: dark) {
      body, .wrap, .nz-shell-body { background: ${BRAND.pageBg} !important; color: ${BRAND.textPrimary} !important; }
      .nz-shell-header { background: ${BRAND.headerGradStart} !important; background: linear-gradient(135deg, ${BRAND.headerGradStart} 0%, ${BRAND.headerGradEnd} 100%) !important; }
      .hero-title, .hero-title font { color: #ffffff !important; }
      .eyebrow { color: ${BRAND.accent} !important; }
      .heading { color: ${BRAND.textPrimary} !important; }
      .subtext { color: ${BRAND.textBody} !important; }
      .small, .footer p, .tagline { color: ${BRAND.textMuted} !important; }
      .button, .btn { background: ${BRAND.accent} !important; color: #ffffff !important; }
      .stats { background: ${BRAND.panelBg} !important; }
      .stats td.k { color: ${BRAND.textMuted} !important; }
      .stats td.v { color: ${BRAND.textPrimary} !important; }
      .highlight { color: ${BRAND.accentDark} !important; }
    }
    [data-ogsc] .hero-title, [data-ogsc] .hero-title font { color: #ffffff !important; }
    [data-ogsc] .eyebrow { color: ${BRAND.accent} !important; }
    [data-ogsb] .nz-shell-header { background: ${BRAND.headerGradStart} !important; }
    u + .body .hero-title, u + .body .hero-title font { color: #ffffff !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background-color:${BRAND.pageBg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.pageBg}" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:0;background-color:${BRAND.pageBg};">
        <div class="wrap">
          <div class="nz-shell" style="text-align:left;">
            <div class="nz-shell-header" bgcolor="${BRAND.headerGradStart}" style="text-align:left;background-color:${BRAND.headerGradStart};">
              <img class="logo" src="${logoSrc}" alt="${BRAND.brandName}" />
              ${eyebrowText ? `<p class="eyebrow" style="text-align:left;color:${BRAND.accent};">${eyebrowText}</p>` : ''}
              ${heroTitle ? `<h1 class="hero-title" style="text-align:left;color:#ffffff;"><font color="#FFFFFF" style="color:#ffffff;">${heroTitle}</font></h1>` : ''}
            </div>
            <div class="nz-shell-stripe" style="height:3px;line-height:3px;font-size:0;background:linear-gradient(to right, ${BRAND.accent}, ${BRAND.accentDark});background-color:${BRAND.accent};">&nbsp;</div>
            <div class="nz-shell-body" style="text-align:left;">
              ${content}
            </div>
          </div>
          <p class="tagline">${BRAND.tagline}</p>
          <p style="text-align:center;font-size:10.5px;color:${BRAND.textMuted};margin:6px 0 0;line-height:1.6;">
            ${BRAND.address}
            &nbsp;&middot;&nbsp;
            <a href="${BRAND.websiteUrl}" style="color:${BRAND.accentDark};text-decoration:none;">${BRAND.websiteUrl.replace(/^https?:\/\//, '')}</a>
          </p>
        </div>
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
    `, agency, {
      eyebrow: 'Team Invite',
      heroTitle: `You're invited, ${opts.memberName}.`,
    }),
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
  const heroTitle = trimmedName
    ? `Your portal is ready, ${trimmedName}.`
    : 'Your portal is ready.';
  return layout(`
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
    `, agency, {
      eyebrow: 'Portal Invite',
      heroTitle,
    });
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
    `, agency, {
      eyebrow: 'Welcome',
      heroTitle: `You're all set, ${opts.name}.`,
    }),
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
    html: layout(cardHtml, agency, {
      eyebrow: `Weekly affiliate report · ${opts.rangeLabel}`,
      heroTitle: `${opts.clientName} affiliates`,
    }),
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
    html: layout(cardHtml, agency, {
      eyebrow: `Weekly recap · ${opts.rangeLabel}`,
      heroTitle: `${opts.report.clientName} performance`,
    }),
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
  /**
   * One-paragraph teaser describing what's in the report. Keep it short,
   * punchy, and human. **Do NOT include the source/result count** ("across
   * 47 sources..." etc.) - the recipient is here for the angles, not the
   * scrape stats. Lead with the takeaways.
   */
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
    `, agency, {
      eyebrow: 'Research Complete',
      heroTitle: 'Your research is ready.',
    }),
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
  const html = layout(cardHtml, agency, {
    eyebrow: `Competitor update · ${rangeLabel}`,
    heroTitle: `${opts.data.client_name} vs. competitors`,
  });

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
    approved: `${opts.authorName} approved a post.`,
    changes_requested: `${opts.authorName} requested changes.`,
    comment: `New comment from ${opts.authorName}.`,
  } as const;
  const eyebrowByStatus = {
    approved: 'Calendar Approved',
    changes_requested: 'Changes Requested',
    comment: 'New Comment',
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
      <p class="subtext">
        <span class="highlight">${opts.authorName}</span> ${verbBySubject[opts.status]} on the ${opts.clientName} content calendar.
      </p>
      <p class="small" style="margin-bottom: 24px;">
        &ldquo;${opts.contentPreview}&rdquo;
      </p>
      <div class="button-wrap">
        <a href="${opts.dropUrl}" class="button">Open content calendar &rarr;</a>
      </div>
    `, agency, {
      eyebrow: eyebrowByStatus[opts.status],
      heroTitle: headlineByStatus[opts.status],
    }),
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
      <p class="subtext">
        ${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${opts.groups.length} ${opts.groups.length === 1 ? 'client' : 'clients'}, ${opts.windowLabel}.
      </p>
      ${sections}
    `, agency, {
      eyebrow: `Calendar Digest · ${opts.windowLabel}`,
      heroTitle: 'Yesterday’s calendar activity',
    }),
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
  pending: number;
  total: number;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const noun = opts.pending === 1 ? 'post' : 'posts';
  const subject = `${opts.pending} ${noun} still need your review`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_no_open_reminder',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <p class="subtext">Hey ${opts.clientName}, we sent over your latest content calendar about ${opts.hours} hours ago and haven't seen anyone open it yet. Take a quick look and either approve the posts or drop comments where anything needs to change.</p>
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="btn">Open your calendar</a>
      </div>
    `, agency, {
      eyebrow: 'Calendar Reminder',
      heroTitle: `${opts.pending} of ${opts.total} ${opts.pending === 1 ? 'post' : 'posts'} still need your review`,
    }),
    metadata: { clientName: opts.clientName, hours: opts.hours, pending: opts.pending, total: opts.total },
  });
}

export async function sendCalendarNoActionReminderEmail(opts: {
  to: string;
  clientName: string;
  shareUrl: string;
  hours: number;
  pending: number;
  total: number;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const noun = opts.pending === 1 ? 'post' : 'posts';
  const subject = `${opts.pending} ${noun} still need your review`;
  // Tone shifts based on whether they've started reviewing (partial action)
  // versus opened-but-untouched. Keeps the message honest in both cases.
  const partialAction = opts.pending < opts.total;
  const body = partialAction
    ? `Hey ${opts.clientName}, you've reviewed some of the calendar already, thanks for that. ${opts.pending} of ${opts.total} ${noun} still need your eyes. Hit reply or drop comments directly on the posts.`
    : `Hey ${opts.clientName}, you opened the calendar but the ${opts.total} ${opts.total === 1 ? 'post' : 'posts'} still need your review. Hit reply or drop comments directly on the posts.`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_no_action_reminder',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <p class="subtext">${body}</p>
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="btn">Review the posts</a>
      </div>
    `, agency, {
      eyebrow: 'Calendar Reminder',
      heroTitle: `${opts.pending} of ${opts.total} ${noun} still need your review`,
    }),
    metadata: { clientName: opts.clientName, hours: opts.hours, pending: opts.pending, total: opts.total },
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
/**
 * Build the default subject + message body for the followup nudge.
 * Returned to the /review draft dialog so admins can preview and tweak
 * the copy before sending.
 */
export function buildCalendarFollowupDraft(opts: {
  pocFirstNames: string[];
  clientName: string;
}): { subject: string; message: string } {
  const greetingNames = opts.pocFirstNames.length
    ? opts.pocFirstNames.join(', ')
    : opts.clientName;
  const subject = `Checking in on your content calendar`;
  const message =
    `Hey ${greetingNames}, just circling back on the latest content calendar for ${opts.clientName}. ` +
    `Whenever you have a few minutes, take a look and either approve the posts or drop comments where anything needs to change.\n\n` +
    `No rush, but the sooner we hear from you, the sooner the team can lock everything in.`;
  return { subject, message };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function messageToHtmlParagraphs(message: string): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs
    .map((p, i) => {
      const safe = escapeHtml(p).replace(/\n/g, '<br />');
      const margin = i === 0 ? '' : ' style="margin-top:10px;"';
      return `<p class="subtext"${margin}>${safe}</p>`;
    })
    .join('');
}

export async function sendCalendarFollowupEmail(opts: {
  to: string | string[];
  pocFirstNames: string[];
  clientName: string;
  shareUrl: string;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
  /** Admin-edited subject from the draft dialog. Falls back to the default. */
  subjectOverride?: string;
  /** Admin-edited body (plain text, blank-line separated paragraphs). */
  messageOverride?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const draft = buildCalendarFollowupDraft({
    pocFirstNames: opts.pocFirstNames,
    clientName: opts.clientName,
  });
  const subject = opts.subjectOverride?.trim() || draft.subject;
  const messageText = opts.messageOverride?.trim() || draft.message;
  const bodyHtml = messageToHtmlParagraphs(messageText);
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_followup',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      ${bodyHtml}
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="btn">Open the calendar</a>
      </div>
    `, agency, {
      eyebrow: 'Calendar Check-In',
      heroTitle: `Checking in on ${opts.clientName}'s calendar`,
    }),
    metadata: {
      clientName: opts.clientName,
      pocFirstNames: opts.pocFirstNames,
      edited: !!(opts.subjectOverride || opts.messageOverride),
    },
  });
}

export async function sendCalendarFinalCallEmail(opts: {
  to: string;
  clientName: string;
  shareUrl: string;
  firstPostAt: string;
  pending: number;
  total: number;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const noun = opts.pending === 1 ? 'post' : 'posts';
  const subject = `${opts.pending} ${noun} still pending, first post goes live ${opts.firstPostAt}`;
  return sendAndLog({
    category: 'transactional',
    typeKey: 'calendar_final_call',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    dropId: opts.dropId,
    subject,
    html: layout(`
      <p class="subtext">Hey ${opts.clientName}, your first scheduled post goes live ${opts.firstPostAt}. ${opts.pending} of ${opts.total} ${noun} still ${opts.pending === 1 ? 'needs' : 'need'} your sign-off, so unless you flag something we'll publish on the dates you saw in the calendar.</p>
      <p class="subtext" style="margin-top:10px;">If anything needs to change, drop a comment on the post or hit reply now.</p>
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="btn">Open the calendar</a>
      </div>
    `, agency, {
      eyebrow: 'Final Call',
      heroTitle: 'Final call before we publish',
    }),
    metadata: { clientName: opts.clientName, firstPostAt: opts.firstPostAt, pending: opts.pending, total: opts.total },
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
    <p class="subtext">
      ${greeting}, ${teamShort} just shipped <span class="highlight">${opts.postCount} posts</span>
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
  `, agency, {
    eyebrow: `${monthLabel} Calendar`,
    heroTitle: `Your ${monthLabel} content calendar is ready`,
  });

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
        <div style="margin-top:18px;padding:18px 20px;border:1px solid #e8ecf0;border-radius:10px;background:#f7f9fb;">
          <h2 style="font-family:inherit;font-size:18px;font-weight:700;color:inherit;margin:0 0 6px;">${c.clientName}</h2>
          <p class="small" style="margin:0 0 12px;">
            <span class="highlight">${c.postCount} posts</span>
            scheduled ${formatDateLabel(c.startDate)} to ${formatDateLabel(c.endDate)}.
          </p>
          <div>
            <a href="${c.shareUrl}" class="button">Open ${c.clientName} calendar &rarr;</a>
          </div>
        </div>
      `,
    )
    .join('');

  const subject = `Your ${monthLabel} content calendars from ${isAC ? 'Anderson Collaborative' : 'Nativz'} are ready`;

  const html = layout(`
    <p class="subtext">
      ${greeting}, ${teamShort} just shipped fresh calendars for ${brandList}.
      Each one has its own button below, tap in to watch the videos, read the
      captions, and approve or request changes one post at a time.
    </p>
    ${introBlock}
    ${calendarSections}
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `, agency, {
    eyebrow: `${monthLabel} Calendars`,
    heroTitle: `Your ${monthLabel} content calendars are ready`,
  });

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

// ── Manual share-link send (admin "Send share link" / "Resend revised") ──
//
// Fired from the calendar-link-detail dialog. Two variants:
//   - 'initial': first time we ship this calendar to the client. Subject
//                + body match sendCalendarDeliveryEmail's tone.
//   - 'revised': we updated something post-send. Subject + body tell the
//                client the calendar was revised and to re-review.
//
// Mirrors sendCalendarFollowupEmail: a build*Draft helper returns
// { subject, message } so the GET /send preview can render it, and the
// send function accepts subjectOverride/messageOverride from the modal so
// admins can tweak copy before hitting send.

export function buildCalendarShareSendDraft(opts: {
  variant: 'initial' | 'revised';
  pocFirstNames: string[];
  clientName: string;
  postCount: number;
  startDate: string;
  endDate: string;
  agency: AgencyBrand;
}): { subject: string; message: string } {
  const isAC = opts.agency === 'anderson';
  const brand = isAC ? 'Anderson Collaborative' : 'Nativz';
  const team = isAC ? 'the AC team' : 'the Nativz team';
  const monthLabel = new Date(`${opts.startDate}T00:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const greetingNames = opts.pocFirstNames.length > 0
    ? humanizeNameList(opts.pocFirstNames)
    : opts.clientName;
  const dateRange = `${formatDateLabel(opts.startDate)} to ${formatDateLabel(opts.endDate)}`;
  const postsWord = opts.postCount === 1 ? 'post' : 'posts';

  if (opts.variant === 'revised') {
    return {
      subject: `${opts.clientName}: revised content calendar ready for review`,
      message:
        `Hey ${greetingNames}, ${team} just made revisions to the ${monthLabel} content calendar.\n\n` +
        `Tap the button below to re-review the ${opts.postCount} ${postsWord} scheduled across ${dateRange}, then approve or leave another comment if anything still needs to change.`,
    };
  }

  return {
    subject: `Your ${monthLabel} content calendar from ${brand} is ready`,
    message:
      `Hey ${greetingNames}, ${team} just shipped ${opts.postCount} ${postsWord} for you to review, scheduled across ${dateRange}.\n\n` +
      `Tap the button below to watch the videos, read the captions, and approve or request changes one post at a time.`,
  };
}

export function buildCalendarShareSendHtml(opts: {
  variant: 'initial' | 'revised';
  subject: string;
  message: string;
  shareUrl: string;
  agency: AgencyBrand;
}): string {
  const isAC = opts.agency === 'anderson';
  const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
  const buttonLabel = opts.variant === 'revised'
    ? 'Re-review the calendar &rarr;'
    : 'Open content calendar &rarr;';
  const heading = opts.variant === 'revised'
    ? 'Revised content calendar ready'
    : 'Your content calendar is ready';
  const eyebrow = opts.variant === 'revised'
    ? 'Calendar Revised'
    : 'Calendar Delivery';
  const bodyHtml = messageToHtmlParagraphs(opts.message);
  return layout(`
    ${bodyHtml}
    <div class="button-wrap" style="margin-top:24px;text-align:center;">
      <a href="${opts.shareUrl}" class="button">${buttonLabel}</a>
    </div>
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `, opts.agency, {
    eyebrow,
    heroTitle: heading,
  });
}

export async function sendCalendarShareSendEmail(opts: {
  to: string | string[];
  cc?: string | string[];
  pocFirstNames: string[];
  clientName: string;
  shareUrl: string;
  variant: 'initial' | 'revised';
  postCount: number;
  startDate: string;
  endDate: string;
  agency?: AgencyBrand;
  clientId?: string;
  dropId?: string;
  /** Admin-edited subject from the preview modal. Falls back to the default. */
  subjectOverride?: string;
  /** Admin-edited body (plain text, blank-line separated paragraphs). */
  messageOverride?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const isAC = agency === 'anderson';
  const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
  const draft = buildCalendarShareSendDraft({
    variant: opts.variant,
    pocFirstNames: opts.pocFirstNames,
    clientName: opts.clientName,
    postCount: opts.postCount,
    startDate: opts.startDate,
    endDate: opts.endDate,
    agency,
  });
  const subject = opts.subjectOverride?.trim() || draft.subject;
  const message = opts.messageOverride?.trim() || draft.message;
  const html = buildCalendarShareSendHtml({
    variant: opts.variant,
    subject,
    message,
    shareUrl: opts.shareUrl,
    agency,
  });
  return sendAndLog({
    category: 'transactional',
    typeKey: opts.variant === 'revised' ? 'calendar_revised_videos' : 'calendar_delivery',
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
      pocFirstNames: opts.pocFirstNames,
      variant: opts.variant,
      postCount: opts.postCount,
      startDate: opts.startDate,
      endDate: opts.endDate,
      manualSend: true,
      edited: !!(opts.subjectOverride || opts.messageOverride),
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
    <p class="subtext">Hey ${opts.clientName}, we've worked through every change you flagged. Hop back in to take a final look and approve the posts you're happy with.</p>
    <div class="button-wrap">
      <a href="${opts.shareUrl}" class="btn">Review the updated posts</a>
    </div>
  `, agency, {
    eyebrow: 'Revisions Complete',
    heroTitle: 'Revisions complete',
  });

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
    <p class="subtext">
      ${greeting},
    </p>
    <p class="subtext">
      The ${teamLabel} has implemented the requested changes and the revised
      calendar is ready for review.
    </p>
    ${summarySection}
    <div class="button-wrap" style="margin-top:24px;text-align:center;">
      <a href="${opts.shareUrl}" class="button">Re-review the calendar &rarr;</a>
    </div>
    <p class="subtext" style="margin-top:24px;">
      If there's any more feedback please let us know, or mark each post as
      approved if it matches what you were looking for.
    </p>
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `, agency, {
    eyebrow: 'Revised Cuts Ready',
    heroTitle: `Revised ${word} ready for review`,
  });

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
    <p class="subtext">
      The post-health cron picked up new issues. Each row fires once, re-posts and reconnects clear automatically.
    </p>
    ${failedSection}
    ${disconnectSection}
    <div class="button-wrap">
      <a href="https://cortex.nativz.io/admin/calendar" class="button">Open the calendar &rarr;</a>
    </div>
  `, 'nativz', {
    eyebrow: `Health Alert · ${subjectParts.join(' · ')}`,
    heroTitle: 'Posting health alert',
  });

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

// ── Editing deliverable email ───────────────────────────────────────────────
//
// Mirrors the calendar followup pattern: a default subject + body the admin
// can preview and tweak in a draft dialog before sending. Triggered from the
// editing project share popover ("Send to client") so POCs receive the
// branded `/c/edit/<token>` link in their inbox instead of needing to copy +
// paste it into Slack or DMs. Logged via sendAndLog so the Email Hub UI
// shows delivery + open status alongside calendar emails.

export function buildEditingDeliverableDraft(opts: {
  pocFirstNames: string[];
  clientName: string;
  projectName: string;
}): { subject: string; message: string } {
  const greetingNames = opts.pocFirstNames.length
    ? opts.pocFirstNames.join(', ')
    : opts.clientName;
  const subject = `Your ${opts.projectName} cuts are ready for review`;
  const message =
    `Hey ${greetingNames}, the latest cuts for ${opts.projectName} are ready for your review. ` +
    `Tap the button below to watch each video and either approve it or drop comments where you'd like changes.\n\n` +
    `Once you've signed off we'll get everything packaged for delivery.`;
  return { subject, message };
}

export async function sendEditingDeliverableEmail(opts: {
  to: string | string[];
  pocFirstNames: string[];
  clientName: string;
  projectName: string;
  shareUrl: string;
  agency?: AgencyBrand;
  clientId?: string;
  projectId?: string;
  /** Admin-edited subject from the draft dialog. Falls back to the default. */
  subjectOverride?: string;
  /** Admin-edited body (plain text, blank-line separated paragraphs). */
  messageOverride?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const draft = buildEditingDeliverableDraft({
    pocFirstNames: opts.pocFirstNames,
    clientName: opts.clientName,
    projectName: opts.projectName,
  });
  const subject = opts.subjectOverride?.trim() || draft.subject;
  const messageText = opts.messageOverride?.trim() || draft.message;
  const bodyHtml = messageToHtmlParagraphs(messageText);
  return sendAndLog({
    category: 'transactional',
    typeKey: 'editing_deliverable',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    subject,
    html: layout(`
      ${bodyHtml}
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="btn">Watch the cuts</a>
      </div>
    `, agency, {
      eyebrow: 'Cuts Delivered',
      heroTitle: `${opts.projectName} cuts ready for review`,
    }),
    metadata: {
      clientName: opts.clientName,
      projectName: opts.projectName,
      projectId: opts.projectId,
      pocFirstNames: opts.pocFirstNames,
      edited: !!(opts.subjectOverride || opts.messageOverride),
    },
  });
}

// ── Editing re-review email ─────────────────────────────────────────────────
//
// After a client requests changes, the editor uploads new revisions, then
// asks Cortex to ping the same POCs again with a fresh subject + body so the
// inbox thread reads "v2 ready for review" rather than another delivery
// notice. Identical mechanics to the deliverable email (same recipient list,
// same share URL, same branded layout) — only the default subject + body
// copy + the metadata `kind` differ. Logged through `sendAndLog` so the Email
// Hub still groups by client + project, and the History tab can surface
// re-review sends as a distinct event.

export function buildEditingRereviewDraft(opts: {
  pocFirstNames: string[];
  clientName: string;
  projectName: string;
  pendingCount: number;
}): { subject: string; message: string } {
  const greetingNames = opts.pocFirstNames.length
    ? opts.pocFirstNames.join(', ')
    : opts.clientName;
  const cutWord = opts.pendingCount === 1 ? 'cut' : 'cuts';
  const subject =
    opts.pendingCount > 0
      ? `Revised ${opts.projectName} ${cutWord} ready for re-review`
      : `Re-review ready for ${opts.projectName}`;
  const body =
    opts.pendingCount > 0
      ? `Hey ${greetingNames}, we worked through the notes and re-uploaded ${opts.pendingCount} revised ${cutWord} for ${opts.projectName}. ` +
        `Tap the button below to watch the new versions and either approve them or drop more comments.\n\n` +
        `Thanks for the quick turn on the last round.`
      : `Hey ${greetingNames}, the revised ${opts.projectName} cuts are ready for another look. ` +
        `Tap the button below to watch the new versions and either approve them or drop more comments.`;
  return { subject, message: body };
}

export async function sendEditingRereviewEmail(opts: {
  to: string | string[];
  pocFirstNames: string[];
  clientName: string;
  projectName: string;
  shareUrl: string;
  pendingCount: number;
  agency?: AgencyBrand;
  clientId?: string;
  projectId?: string;
  /** Admin-edited subject from the draft dialog. Falls back to the default. */
  subjectOverride?: string;
  /** Admin-edited body (plain text, blank-line separated paragraphs). */
  messageOverride?: string;
}) {
  const agency = opts.agency ?? 'nativz';
  const draft = buildEditingRereviewDraft({
    pocFirstNames: opts.pocFirstNames,
    clientName: opts.clientName,
    projectName: opts.projectName,
    pendingCount: opts.pendingCount,
  });
  const subject = opts.subjectOverride?.trim() || draft.subject;
  const messageText = opts.messageOverride?.trim() || draft.message;
  const bodyHtml = messageToHtmlParagraphs(messageText);
  return sendAndLog({
    category: 'transactional',
    typeKey: 'editing_rereview',
    agency,
    to: opts.to,
    clientId: opts.clientId,
    subject,
    html: layout(`
      ${bodyHtml}
      <div class="button-wrap">
        <a href="${opts.shareUrl}" class="btn">Watch the revised cuts</a>
      </div>
    `, agency, {
      eyebrow: 'Revised Cuts Ready',
      heroTitle: `${opts.projectName} revisions ready`,
    }),
    metadata: {
      clientName: opts.clientName,
      projectName: opts.projectName,
      projectId: opts.projectId,
      pocFirstNames: opts.pocFirstNames,
      pendingCount: opts.pendingCount,
      edited: !!(opts.subjectOverride || opts.messageOverride),
    },
  });
}

// ── Shoot brief reminder (48h pre-shoot internal nudge) ──────────────────

function formatShootDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} at ${timePart}`;
}

export async function sendShootBriefReminderEmail(opts: {
  to: string;
  memberFirstName: string;
  clientName: string | null;
  shootTitle: string;
  shootDateISO: string;
  location: string | null;
  contentLabUrl: string;
  agency?: AgencyBrand;
  clientId?: string | null;
  shootId?: string | null;
}) {
  const agency = opts.agency ?? 'nativz';
  const safeName = escapeHtml(opts.memberFirstName.trim() || 'team');
  const when = escapeHtml(formatShootDateTime(opts.shootDateISO));
  const safeTitle = escapeHtml(opts.shootTitle);
  const safeLocation = opts.location ? escapeHtml(opts.location) : null;

  const subject = opts.clientName
    ? `Shoot in 48 hours: ${opts.clientName}, send a brief`
    : `Shoot in 48 hours: ${opts.shootTitle}`;

  const heading = opts.clientName
    ? `${safeName}, you have a ${escapeHtml(opts.clientName)} shoot in 48 hours.`
    : `${safeName}, you have a shoot in 48 hours.`;

  const subtext = opts.clientName
    ? `<span class="highlight">${escapeHtml(opts.clientName)}</span> is on the calendar for <strong>${when}</strong>${safeLocation ? ` at ${safeLocation}` : ''}. Open Content Lab, switch to ${escapeHtml(opts.clientName)} in the brand pill, and put together a brief: script ideas, video angles, anything the crew needs to walk on set with.`
    : `<strong>${safeTitle}</strong> is on the calendar for <strong>${when}</strong>${safeLocation ? ` at ${safeLocation}` : ''}. We couldn't auto-match a client to this event. Take a look at the shoot and write a brief in Content Lab so the crew shows up ready.`;

  return sendAndLog({
    category: 'transactional',
    typeKey: 'shoot_brief_reminder',
    agency,
    to: opts.to,
    recipientName: opts.memberFirstName,
    clientId: opts.clientId ?? null,
    subject,
    html: layout(`
      <p class="subtext">${subtext}</p>
      <div class="button-wrap">
        <a href="${opts.contentLabUrl}" class="button">Open Content Lab &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        This is an internal heads-up, no client sees it. Fired 48 hours before every shoot on the team calendar.
      </p>
    `, agency, {
      eyebrow: 'Shoot in 48 Hours',
      heroTitle: heading,
    }),
    metadata: {
      shootId: opts.shootId,
      shootTitle: opts.shootTitle,
      shootDate: opts.shootDateISO,
      clientName: opts.clientName,
      hadLocation: !!opts.location,
    },
  });
}

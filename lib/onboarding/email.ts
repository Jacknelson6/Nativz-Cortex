/**
 * Onboarding email senders. Two exports:
 *
 *   sendOnboardingWelcomeEmail  - fired the moment an onboarding is created
 *   sendOnboardingNudgeEmail    - admin-triggered manual nudge / step reminder /
 *                                 lagging-nudge milestone
 *
 * Both:
 *   - resolve the brand (`nativz` | `anderson`) from the client's `agency`
 *     column
 *   - resolve the recipient via brand-profile POCs (or fall back to
 *     `recipient_email` arg)
 *   - render through `layout()` from `@/lib/email/resend` so the dark hero,
 *     wordmark, eyebrow, hero title, and footer are identical to every other
 *     Cortex email
 *   - return `{ to, subject, body_preview, resend_id, ok, error }` so the
 *     calling API route can log a row to `onboarding_emails_log`
 *
 * Authoring rules from `docs/email-style.md` are non-negotiable:
 *   - sentence case body copy
 *   - "posts" not "drops" in client-facing copy
 *   - no em-dashes (U+2013, U+2014); ASCII hyphen only
 *   - one primary pill CTA per email
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { layout, sendAndLog, type SendAndLogResult } from '@/lib/email/resend';
import { getEmailBrand } from '@/lib/email/brand-tokens';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { getBrandFromAgency, type AgencyBrand } from '@/lib/agency/detect';
import { getClientNotificationRecipients } from '@/lib/email/notification-recipients';
import type { OnboardingRow } from './types';
import { SCREENS, screenAt, type OnboardingKind } from './screens';

// ── Public return shape ───────────────────────────────────────────────────

export interface OnboardingEmailResult {
  to: string;
  subject: string;
  body_preview: string;
  resend_id: string | null;
  ok: boolean;
  error: string | null;
}

interface ClientCtx {
  client_id: string;
  client_name: string;
  agency: AgencyBrand;
}

interface RecipientCtx {
  email: string;
  first_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function firstName(full: string | null): string | null {
  if (!full) return null;
  const trimmed = full.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function greeting(name: string | null): string {
  return name ? `Hey ${name}` : 'Hi there';
}

function preview(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shareUrl(agency: AgencyBrand, token: string): string {
  const base = process.env.NODE_ENV !== 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    : getCortexAppUrl(agency);
  return `${base}/s/${token}`;
}

async function loadClient(clientId: string): Promise<ClientCtx> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('clients')
    .select('id, name, agency')
    .eq('id', clientId)
    .single<{ id: string; name: string; agency: string | null }>();
  if (error || !data) {
    throw new Error(`client not found: ${clientId}`);
  }
  return {
    client_id: data.id,
    client_name: data.name ?? 'your brand',
    agency: getBrandFromAgency(data.agency),
  };
}

/**
 * Resolve every brand-profile POC we should email for this onboarding.
 * Falls back to the explicit `override` (single recipient) when the caller
 * passed one, since admin-triggered nudges accept a "send to" override field.
 */
async function resolveRecipients(
  clientId: string,
  override: string | undefined,
): Promise<RecipientCtx[]> {
  if (override) {
    return [{ email: override, first_name: null }];
  }
  const admin = createAdminClient();
  const pocs = await getClientNotificationRecipients(admin, clientId);
  if (pocs.length === 0) {
    throw new Error(
      'no contacts on the brand profile to email. Add a POC on the brand profile or pass `recipient_email`.',
    );
  }
  return pocs.map((p) => ({ email: p.email, first_name: firstName(p.name) }));
}

function progressLine(kind: OnboardingKind, currentStep: number): string {
  const total = SCREENS[kind].length - 1; // exclude `done`
  const idx = Math.min(currentStep, total);
  const screen = screenAt(kind, idx);
  if (!screen || screen.key === 'done') {
    return `Step ${total} of ${total} - all set.`;
  }
  return `Step ${idx + 1} of ${total + 1}: ${screen.label}.`;
}

function shellResult(
  to: string,
  subject: string,
  bodyPreview: string,
  sent: SendAndLogResult,
): OnboardingEmailResult {
  return {
    to,
    subject,
    body_preview: bodyPreview,
    resend_id: sent.messageId,
    ok: sent.ok,
    error: sent.error ?? null,
  };
}

// ── Welcome ───────────────────────────────────────────────────────────────

export async function sendOnboardingWelcomeEmail(opts: {
  onboarding: OnboardingRow;
  recipient_email?: string;
  triggered_by?: string;
}): Promise<OnboardingEmailResult[]> {
  const client = await loadClient(opts.onboarding.client_id);
  const recipients = await resolveRecipients(client.client_id, opts.recipient_email);
  const brand = getEmailBrand(client.agency);
  const url = shareUrl(client.agency, opts.onboarding.share_token);

  const isSmm = opts.onboarding.kind === 'smm';
  const intro = isSmm
    ? `We're getting ${escape(client.client_name)} set up for short-form social. The link below opens a quick guided walkthrough so we can lock down your brand basics, connect your social accounts, and capture the points of contact we should loop in.`
    : `We're getting ${escape(client.client_name)} set up for editing. The link below opens a short guided walkthrough so we can confirm your brand basics and grab links to any raw footage or reference edits the team should look at.`;

  const subject = isSmm
    ? `Let's kick off ${client.client_name} on Cortex`
    : `Let's get ${client.client_name} editing started`;

  // Personalise greeting per POC. Body, hero, CTA stay identical across the
  // fan-out so all recipients land on the same shared onboarding link.
  const results: OnboardingEmailResult[] = [];
  for (const recipient of recipients) {
    const body = `
      <p class="subtext">${greeting(recipient.first_name)},</p>
      <p class="subtext">${intro}</p>
      <p class="subtext">It takes about 5 minutes. You can pause and come back; the link saves your progress automatically.</p>
      <div class="button-wrap" style="text-align:center;">
        <a href="${url}" class="button">Start onboarding</a>
      </div>
      <hr class="divider" />
      <p class="small" style="text-align:center;">
        If the button doesn't work, paste this into your browser:<br />
        <a href="${url}" style="color:${brand.blue};">${url}</a>
      </p>
    `;

    const html = layout(body, client.agency, {
      eyebrow: 'Onboarding',
      heroTitle: `Welcome to ${brand.brandName}, ${client.client_name}.`,
    });

    const sent = await sendAndLog({
      category: 'transactional',
      typeKey: `onboarding_welcome_${opts.onboarding.kind}`,
      agency: client.agency,
      to: recipient.email,
      recipientName: recipient.first_name,
      subject,
      html,
      clientId: client.client_id,
      metadata: {
        onboarding_id: opts.onboarding.id,
        kind: opts.onboarding.kind,
        triggered_by: opts.triggered_by ?? null,
      },
    });

    results.push(shellResult(recipient.email, subject, preview(intro), sent));
  }

  return results;
}

// ── Nudge (manual / step reminder / lagging) ─────────────────────────────

type NudgeKind = 'manual' | 'step_reminder' | 'lagging_nudge';

export async function sendOnboardingNudgeEmail(opts: {
  onboarding: OnboardingRow;
  kind: NudgeKind;
  recipient_email?: string;
  /** Optional admin-authored note. If present, replaces the default body copy. */
  message?: string;
  triggered_by?: string;
}): Promise<OnboardingEmailResult[]> {
  const client = await loadClient(opts.onboarding.client_id);
  const recipients = await resolveRecipients(client.client_id, opts.recipient_email);
  const brand = getEmailBrand(client.agency);
  const url = shareUrl(client.agency, opts.onboarding.share_token);

  const progress = progressLine(opts.onboarding.kind, opts.onboarding.current_step);

  let eyebrow: string;
  let heroTitle: string;
  let subject: string;
  let intro: string;
  let cta: string;

  if (opts.kind === 'lagging_nudge') {
    eyebrow = 'Quick check-in';
    heroTitle = `${client.client_name} - we still need a few details`;
    subject = `Quick check-in on ${client.client_name} onboarding`;
    intro = `It's been a few days since we kicked off onboarding for ${escape(client.client_name)}. Picking it back up takes 5 minutes; the link saves your progress.`;
    cta = 'Pick up where you left off';
  } else if (opts.kind === 'step_reminder') {
    eyebrow = 'Reminder';
    heroTitle = `Next step: ${escape(progress)}`;
    subject = `Next step for ${client.client_name} onboarding`;
    intro = `One step left in your onboarding before we can get rolling on ${escape(client.client_name)}.`;
    cta = 'Continue onboarding';
  } else {
    eyebrow = 'A quick note';
    heroTitle = `Re: ${client.client_name} onboarding`;
    subject = `Quick note about ${client.client_name} onboarding`;
    intro = opts.message
      ? escape(opts.message).replace(/\n/g, '<br />')
      : `Just bumping this up in your inbox so we can wrap onboarding for ${escape(client.client_name)}.`;
    cta = 'Open onboarding';
  }

  const previewBody = opts.message
    ? preview(opts.message)
    : preview(intro.replace(/<[^>]+>/g, ''));

  const results: OnboardingEmailResult[] = [];
  for (const recipient of recipients) {
    const body = `
      <p class="subtext">${greeting(recipient.first_name)},</p>
      <p class="subtext">${intro}</p>
      <p class="subtext"><em>${escape(progress)}</em></p>
      <div class="button-wrap" style="text-align:center;">
        <a href="${url}" class="button">${cta}</a>
      </div>
      <hr class="divider" />
      <p class="small" style="text-align:center;">
        If the button doesn't work, paste this into your browser:<br />
        <a href="${url}" style="color:${brand.blue};">${url}</a>
      </p>
    `;

    const html = layout(body, client.agency, { eyebrow, heroTitle });

    const sent = await sendAndLog({
      category: 'transactional',
      typeKey: `onboarding_${opts.kind}`,
      agency: client.agency,
      to: recipient.email,
      recipientName: recipient.first_name,
      subject,
      html,
      clientId: client.client_id,
      metadata: {
        onboarding_id: opts.onboarding.id,
        kind: opts.onboarding.kind,
        nudge_kind: opts.kind,
        triggered_by: opts.triggered_by ?? null,
        has_message: !!opts.message,
      },
    });

    results.push(shellResult(recipient.email, subject, previewBody, sent));
  }

  return results;
}

// ── Completion (sent once when status flips to 'completed') ──────────────

export async function sendOnboardingCompleteEmail(opts: {
  onboarding: OnboardingRow;
  recipient_email?: string;
  triggered_by?: string;
}): Promise<OnboardingEmailResult[]> {
  const client = await loadClient(opts.onboarding.client_id);
  const recipients = await resolveRecipients(client.client_id, opts.recipient_email);
  const isSmm = opts.onboarding.kind === 'smm';

  const intro = isSmm
    ? `That's a wrap on onboarding for ${escape(client.client_name)}. Brand basics, socials, and points of contact are all in. Your account lead will be in touch shortly to confirm next steps and walk through the first batch of posts.`
    : `That's a wrap on onboarding for ${escape(client.client_name)}. Brand basics and your footage references are all in. Your editor will reach out to book a quick kickoff call and confirm the first deliverable timeline.`;

  const subject = isSmm
    ? `${client.client_name} onboarding is complete`
    : `${client.client_name} editing brief received`;

  const eyebrow = 'All set';
  const heroTitle = `Thanks, ${client.client_name}.`;

  const results: OnboardingEmailResult[] = [];
  for (const recipient of recipients) {
    const body = `
      <p class="subtext">${greeting(recipient.first_name)},</p>
      <p class="subtext">${intro}</p>
      <p class="subtext">No action needed on your end right now. We'll be in touch with next steps.</p>
    `;

    const html = layout(body, client.agency, { eyebrow, heroTitle });

    const sent = await sendAndLog({
      category: 'transactional',
      typeKey: `onboarding_complete_${opts.onboarding.kind}`,
      agency: client.agency,
      to: recipient.email,
      recipientName: recipient.first_name,
      subject,
      html,
      clientId: client.client_id,
      metadata: {
        onboarding_id: opts.onboarding.id,
        kind: opts.onboarding.kind,
        triggered_by: opts.triggered_by ?? null,
      },
    });

    results.push(shellResult(recipient.email, subject, preview(intro), sent));
  }

  return results;
}

// ── Ops handoff (silent agency-side notification on completion) ───────────

/**
 * Internal-only: ping the agency ops inbox when a client wraps onboarding,
 * with a one-line summary of what was captured. Editing onboardings prompt
 * ops to schedule the 7-step kickoff call; SMM onboardings just notify.
 *
 * `to` is the agency theme's `opsEmail`, falling back to `supportEmail`.
 */
export async function sendOnboardingOpsHandoffEmail(opts: {
  onboarding: OnboardingRow;
  triggered_by?: string;
}): Promise<OnboardingEmailResult> {
  const { getTheme } = await import('@/lib/branding');
  const client = await loadClient(opts.onboarding.client_id);
  const theme = getTheme(client.agency);
  const to = theme.opsEmail ?? theme.supportEmail;
  const isSmm = opts.onboarding.kind === 'smm';

  const eyebrow = 'Ops handoff';
  const heroTitle = `${client.client_name} wrapped onboarding`;
  const subject = `[${theme.shortName}] ${client.client_name} finished ${isSmm ? 'SMM' : 'editing'} onboarding`;

  const summary = isSmm
    ? `Brand basics, social connections, and points of contact are all in. Loop the strategist in on the next touchpoint.`
    : `Brand basics and footage references are in. Book the kickoff call to walk through the 7-step cadence.`;

  const adminLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io'}/admin/onboarding/${opts.onboarding.id}`;

  const body = `
    <p class="subtext">${escape(client.client_name)} just finished their ${isSmm ? 'SMM' : 'editing'} onboarding.</p>
    <p class="subtext">${escape(summary)}</p>
    <div class="button-wrap" style="text-align:center;">
      <a href="${adminLink}" class="button">Open in Cortex</a>
    </div>
  `;

  const html = layout(body, client.agency, { eyebrow, heroTitle });

  const sent = await sendAndLog({
    category: 'transactional',
    typeKey: `onboarding_ops_handoff_${opts.onboarding.kind}`,
    agency: client.agency,
    to,
    recipientName: null,
    subject,
    html,
    clientId: client.client_id,
    metadata: {
      onboarding_id: opts.onboarding.id,
      kind: opts.onboarding.kind,
      triggered_by: opts.triggered_by ?? null,
    },
  });

  return shellResult(to, subject, preview(summary), sent);
}

// ── POC invite (client-triggered: send the link to a teammate) ────────────

/**
 * Sent when a client uses "send onboarding link" on the points_of_contact
 * screen to forward the share URL to a teammate. Body is a short personal
 * note; the recipient lands on the same shared stepper.
 */
export async function sendOnboardingPocInviteEmail(opts: {
  onboarding: OnboardingRow;
  to: string;
  invitee_name?: string | null;
  /** Free-text note from the sender. Optional. */
  message?: string;
  triggered_by?: string;
}): Promise<OnboardingEmailResult> {
  const client = await loadClient(opts.onboarding.client_id);
  const brand = getEmailBrand(client.agency);
  const url = shareUrl(client.agency, opts.onboarding.share_token);

  const subject = `${client.client_name} onboarding - your teammate shared a link`;
  const eyebrow = 'You were added';
  const heroTitle = `Help finish ${client.client_name}'s onboarding`;

  const note = opts.message?.trim()
    ? `<p class="subtext"><em>"${escape(opts.message.trim())}"</em></p>`
    : '';

  const body = `
    <p class="subtext">${greeting(firstName(opts.invitee_name ?? null))},</p>
    <p class="subtext">A teammate at ${escape(client.client_name)} just added you to their ${brand.brandName} onboarding. The link below opens a short guided walkthrough so you can fill in any pieces only you have visibility on.</p>
    ${note}
    <div class="button-wrap" style="text-align:center;">
      <a href="${url}" class="button">Open onboarding</a>
    </div>
    <hr class="divider" />
    <p class="small" style="text-align:center;">
      If the button doesn't work, paste this into your browser:<br />
      <a href="${url}" style="color:${brand.blue};">${url}</a>
    </p>
  `;

  const html = layout(body, client.agency, { eyebrow, heroTitle });

  const sent = await sendAndLog({
    category: 'transactional',
    typeKey: `onboarding_poc_invite_${opts.onboarding.kind}`,
    agency: client.agency,
    to: opts.to,
    recipientName: opts.invitee_name ?? null,
    subject,
    html,
    clientId: client.client_id,
    metadata: {
      onboarding_id: opts.onboarding.id,
      kind: opts.onboarding.kind,
      triggered_by: opts.triggered_by ?? null,
    },
  });

  return shellResult(opts.to, subject, preview(`Forwarded onboarding link to ${opts.to}`), sent);
}

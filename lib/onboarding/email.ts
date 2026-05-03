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
  return `${base}/onboarding/${token}`;
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
    ? `We're getting ${escape(client.client_name)} set up for short-form social. The link below opens a quick guided walkthrough so we can lock down your brand basics, social accounts, content preferences, and a kickoff time.`
    : `We're getting ${escape(client.client_name)} set up for editing. The link below opens a short guided walkthrough so we can capture your project brief, raw footage, and turnaround expectations.`;

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
    ? `That's a wrap on onboarding for ${escape(client.client_name)}. We've got everything we need to start scheduling content. Your account lead will reach out shortly to lock in the kickoff call and walk through the first batch of posts.`
    : `That's a wrap on onboarding for ${escape(client.client_name)}. We've got the brief, your raw assets, and the turnaround expectations. Editing kicks off now; expect a first cut within 5-7 business days.`;

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

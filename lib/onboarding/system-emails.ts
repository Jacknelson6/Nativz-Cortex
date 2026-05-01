import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import { getEmailLogoUrl } from '@/lib/email/brand-tokens';
import { getSecret } from '@/lib/secrets/store';
import type { AgencyBrand } from '@/lib/agency/detect';
import { SEGMENT_KIND_LABEL, type SegmentKind } from '@/lib/onboarding/flows';

/**
 * Onboarding flow system emails — four hardcoded brand-aware templates
 * that replace the editable email-templates manager we deleted in
 * Phase 0. The user explicitly opted out of admin-edited templates here:
 * the system owns these so the tone, cadence, and content stay
 * consistent across every onboarding.
 *
 *  1. flow.poc.invite          fires once when a flow goes active
 *                              (proposal.paid webhook in lib/proposals/on-paid)
 *  2. flow.poc.reminder        fires every 48h to the POC if no activity,
 *                              capped at 1/48h. cron at /api/cron/onboarding-reminders.
 *  3. flow.stakeholder.milestone
 *                              fires on invoice paid, segment completion,
 *                              onboarding complete to opted-in stakeholders.
 *  4. flow.stakeholder.no_progress
 *                              fires after 5 days of POC inactivity, capped
 *                              at one ping per 5-day window.
 *
 * All four are resolved against the flow's agency (clients.agency or
 * proposals.agency, defaulting to 'nativz') so Anderson clients see
 * Anderson branding and Nativz clients see Nativz branding.
 */

type AdminClient = SupabaseClient;

// ────────────────────────────────────────────────────────────────────────
// Brand resolution + send helper
// ────────────────────────────────────────────────────────────────────────

async function getAgencyForFlow(admin: AdminClient, flowId: string): Promise<AgencyBrand> {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('clients!inner(agency)')
    .eq('id', flowId)
    .maybeSingle();
  type FlowAgency = { clients: { agency: string | null } | Array<{ agency: string | null }> };
  const c = (flow as FlowAgency | null)?.clients;
  const agency = (Array.isArray(c) ? c[0]?.agency : c?.agency) ?? 'nativz';
  return agency === 'anderson' ? 'anderson' : 'nativz';
}

function flowShareUrl(agency: AgencyBrand, slug: string, token: string): string {
  const host = agency === 'anderson'
    ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ?? 'https://cortex.andersoncollaborative.com'
    : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ?? 'https://cortex.nativz.io';
  return `${host.replace(/\/+$/, '')}/onboarding/${encodeURIComponent(slug)}?token=${token}`;
}

function kickoffPickerUrl(agency: AgencyBrand, token: string): string {
  const host = agency === 'anderson'
    ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ?? 'https://cortex.andersoncollaborative.com'
    : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ?? 'https://cortex.nativz.io';
  return `${host.replace(/\/+$/, '')}/schedule/${token}`;
}

async function getResendClient(): Promise<Resend | null> {
  const key = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!key) return null;
  return new Resend(key);
}

type SystemEmailKind = 'poc_invite' | 'poc_reminder' | 'stakeholder_milestone' | 'stakeholder_no_progress';

async function logSend(
  admin: AdminClient,
  flowId: string,
  kind: SystemEmailKind,
  to: string,
  subject: string,
  outcome: 'sent' | 'failed',
  errorMsg?: string,
) {
  // onboarding_email_sends columns: tracker_id, flow_id (added in 163),
  // kind (added in 163), template_id, sent_by, to_email, subject, body,
  // success, error.
  await admin
    .from('onboarding_email_sends')
    .insert({
      tracker_id: null,
      flow_id: flowId,
      kind,
      template_id: null,
      to_email: to,
      subject,
      body: `[${kind}] system email`,
      success: outcome === 'sent',
      error: errorMsg ?? null,
    } as never)
    .then(
      () => undefined,
      () => undefined,
    );
}

// ────────────────────────────────────────────────────────────────────────
// 1. POC invite
// ────────────────────────────────────────────────────────────────────────

export async function sendFlowPocInvite(admin: AdminClient, flowId: string): Promise<void> {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, share_token, poc_emails, clients!inner(name, slug, agency)')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow) return;
  type FlowRow = {
    id: string;
    share_token: string;
    poc_emails: string[] | null;
    clients: { name: string; slug: string; agency: string | null } | Array<{ name: string; slug: string; agency: string | null }>;
  };
  const f = flow as FlowRow;
  const recipients = (f.poc_emails ?? []).filter((e): e is string => !!e);
  if (recipients.length === 0) return;

  const c = Array.isArray(f.clients) ? f.clients[0] : f.clients;
  const agency: AgencyBrand = c?.agency === 'anderson' ? 'anderson' : 'nativz';
  const url = flowShareUrl(agency, c?.slug ?? 'flow', f.share_token);

  const resend = await getResendClient();
  if (!resend) {
    console.warn('[onboarding/email] RESEND_API_KEY missing — POC invite skipped');
    return;
  }

  const subject = `Welcome to ${c?.name ?? 'your onboarding'} — let's get you set up`;
  const html = pocInviteHtml({ clientName: c?.name ?? 'there', url, agency });

  for (const to of recipients) {
    try {
      await resend.emails.send({
        from: getFromAddress(agency),
        replyTo: getReplyTo(agency),
        to,
        subject,
        html,
      });
      await logSend(admin, flowId, 'poc_invite', to, subject, 'sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      await logSend(admin, flowId, 'poc_invite', to, subject, 'failed', msg);
    }
  }
}

function pocInviteHtml({
  clientName,
  url,
  agency,
}: {
  clientName: string;
  url: string;
  agency: AgencyBrand;
}): string {
  const inner = `
    <p class="subtext">
      Your agreement is signed and the deposit cleared, thank you. The next
      step is a short setup checklist. It takes about 15 minutes and unlocks
      every single thing we'll do together.
    </p>
    <div class="button-wrap">
      <a class="button" href="${esc(url)}">Open your setup checklist &rarr;</a>
    </div>
    <hr class="divider" />
    <p class="small">
      Questions? Just reply to this email. We are watching, every box you
      tick lights up our dashboard in real time.
    </p>`;
  return layout(inner, agency, {
    eyebrow: 'Onboarding Kickoff',
    heroTitle: `Welcome aboard, ${esc(clientName)}.`,
  });
}

// ────────────────────────────────────────────────────────────────────────
// 2. POC reminder (48h cadence, capped at 1/48h)
// ────────────────────────────────────────────────────────────────────────

export async function sendFlowPocReminder(admin: AdminClient, flowId: string): Promise<void> {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, share_token, poc_emails, last_reminder_sent_at, last_poc_activity_at, clients!inner(name, slug, agency)')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow) return;
  type FlowRow = {
    id: string;
    share_token: string;
    poc_emails: string[] | null;
    last_reminder_sent_at: string | null;
    last_poc_activity_at: string | null;
    clients: { name: string; slug: string; agency: string | null } | Array<{ name: string; slug: string; agency: string | null }>;
  };
  const f = flow as FlowRow;
  const recipients = (f.poc_emails ?? []).filter((e): e is string => !!e);
  if (recipients.length === 0) return;

  const c = Array.isArray(f.clients) ? f.clients[0] : f.clients;
  const agency: AgencyBrand = c?.agency === 'anderson' ? 'anderson' : 'nativz';
  const url = flowShareUrl(agency, c?.slug ?? 'flow', f.share_token);

  const resend = await getResendClient();
  if (!resend) return;

  const subject = `Quick nudge — your ${c?.name ?? ''} setup checklist`;
  const html = pocReminderHtml({ clientName: c?.name ?? 'there', url, agency });

  const now = new Date().toISOString();
  for (const to of recipients) {
    try {
      await resend.emails.send({
        from: getFromAddress(agency),
        replyTo: getReplyTo(agency),
        to,
        subject,
        html,
      });
      await logSend(admin, flowId, 'poc_reminder', to, subject, 'sent');
    } catch (err) {
      await logSend(admin, flowId, 'poc_reminder', to, subject, 'failed', err instanceof Error ? err.message : 'send failed');
    }
  }
  await admin
    .from('onboarding_flows')
    .update({ last_reminder_sent_at: now })
    .eq('id', flowId);
}

function pocReminderHtml({
  clientName,
  url,
  agency,
}: {
  clientName: string;
  url: string;
  agency: AgencyBrand;
}): string {
  const inner = `
    <p class="subtext">
      Just bumping this to the top of your inbox. Your setup checklist
      still has a few open items. The faster you get them in, the
      faster we start producing for you.
    </p>
    <div class="button-wrap">
      <a class="button" href="${esc(url)}">Pick up where you left off &rarr;</a>
    </div>
    <hr class="divider" />
    <p class="small">
      Stuck on a step? Reply to this email and we'll jump on a call or
      screen-share whatever's blocking you.
    </p>`;
  return layout(inner, agency, {
    eyebrow: 'Quick Nudge',
    heroTitle: `Hey ${esc(clientName)}, quick nudge.`,
  });
}

// ────────────────────────────────────────────────────────────────────────
// 3. Stakeholder milestone
// ────────────────────────────────────────────────────────────────────────

export type Milestone = 'invoice_paid' | 'segment_completed' | 'onboarding_complete';

export async function sendFlowStakeholderMilestone(
  admin: AdminClient,
  flowId: string,
  milestone: Milestone,
  detail?: { segmentKind?: SegmentKind; amountCents?: number | null },
): Promise<void> {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, clients!inner(name, slug, agency)')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow) return;
  type FlowRow = {
    id: string;
    clients: { name: string; slug: string; agency: string | null } | Array<{ name: string; slug: string; agency: string | null }>;
  };
  const f = flow as FlowRow;
  const c = Array.isArray(f.clients) ? f.clients[0] : f.clients;
  const agency: AgencyBrand = c?.agency === 'anderson' ? 'anderson' : 'nativz';

  const filterCol =
    milestone === 'invoice_paid'
      ? 'notify_on_invoice_paid'
      : milestone === 'segment_completed'
      ? 'notify_on_segment_completed'
      : 'notify_on_onboarding_complete';

  const { data: stakeholders } = await admin
    .from('onboarding_flow_stakeholders')
    .select('id, email, display_name, role_label')
    .eq('flow_id', flowId)
    .eq(filterCol, true);
  const list = ((stakeholders ?? []) as Array<{ email: string; display_name: string | null; role_label: string | null }>);
  if (list.length === 0) return;

  const resend = await getResendClient();
  if (!resend) return;

  // For onboarding_complete, surface the auto-created kickoff picker as the
  // primary CTA. If auto-create-kickoff failed (no scheduling people, etc.)
  // the URL stays null and the email falls back to "Open the flow →" so it
  // still reaches stakeholders with something actionable.
  let kickoffShareUrl: string | null = null;
  if (milestone === 'onboarding_complete') {
    const { data: kickoff } = await admin
      .from('team_scheduling_events')
      .select('share_token')
      .eq('flow_id', flowId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const token = (kickoff as { share_token?: string | null } | null)?.share_token ?? null;
    if (token) kickoffShareUrl = kickoffPickerUrl(agency, token);
  }

  const headline = milestoneHeadline(milestone, detail, c?.name ?? null, !!kickoffShareUrl);
  const flowAdminUrl = flowAdminUrlFor(agency, flowId);
  const subject = `[${c?.name ?? 'Onboarding'}] ${headline}`;

  for (const s of list) {
    const html = stakeholderMilestoneHtml({
      stakeholderName: s.display_name ?? '',
      clientName: c?.name ?? 'this client',
      headline,
      milestone,
      flowUrl: flowAdminUrl,
      kickoffShareUrl,
      agency,
    });
    try {
      await resend.emails.send({
        from: getFromAddress(agency),
        replyTo: getReplyTo(agency),
        to: s.email,
        subject,
        html,
      });
      await logSend(admin, flowId, 'stakeholder_milestone', s.email, subject, 'sent');
    } catch (err) {
      await logSend(admin, flowId, 'stakeholder_milestone', s.email, subject, 'failed', err instanceof Error ? err.message : 'send failed');
    }
  }
}

function milestoneHeadline(
  milestone: Milestone,
  detail?: { segmentKind?: SegmentKind; amountCents?: number | null },
  clientName?: string | null,
  hasKickoffUrl?: boolean,
): string {
  if (milestone === 'invoice_paid') {
    const amt = detail?.amountCents ? `$${(detail.amountCents / 100).toFixed(2)} ` : '';
    return `${amt}invoice paid`;
  }
  if (milestone === 'segment_completed') {
    const seg = detail?.segmentKind ? SEGMENT_KIND_LABEL[detail.segmentKind] : 'A segment';
    return `${seg} completed`;
  }
  // onboarding_complete: when we have a kickoff picker URL, lead with the
  // action. Otherwise fall back to a status note.
  if (hasKickoffUrl) {
    return clientName ? `Schedule kickoff with ${clientName}` : 'Schedule kickoff';
  }
  return 'Onboarding complete, kickoff time';
}

function milestoneEyebrow(milestone: Milestone): string {
  if (milestone === 'invoice_paid') return 'Invoice Paid';
  if (milestone === 'segment_completed') return 'Segment Completed';
  return 'Onboarding Complete';
}

function flowAdminUrlFor(_agency: AgencyBrand, flowId: string): string {
  // Internal admin URL is the same Cortex deploy regardless of agency.
  // Use NEXT_PUBLIC_APP_URL if set; otherwise default to nativz host
  // (admin domain is shared).
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  return `${base.replace(/\/+$/, '')}/admin/onboarding/${flowId}`;
}

function stakeholderMilestoneHtml({
  stakeholderName,
  clientName,
  headline,
  milestone,
  flowUrl,
  kickoffShareUrl,
  agency,
}: {
  stakeholderName: string;
  clientName: string;
  headline: string;
  milestone: Milestone;
  flowUrl: string;
  kickoffShareUrl: string | null;
  agency: AgencyBrand;
}): string {
  const firstName = stakeholderName ? esc(stakeholderName.split(' ')[0]) : '';
  const subtext = kickoffShareUrl
    ? `${firstName ? `Hi ${firstName}, ` : ''}<strong>${esc(clientName)}</strong> finished onboarding. Pick a kickoff time when the team's free.`
    : `${firstName ? `Hi ${firstName}, ` : ''}<strong>${esc(clientName)}</strong> just hit a milestone you opted into.`;
  const primaryCta = kickoffShareUrl
    ? `<a class="button" href="${esc(kickoffShareUrl)}">Schedule kickoff &rarr;</a>`
    : `<a class="button" href="${esc(flowUrl)}">Open the flow &rarr;</a>`;
  const secondaryCta = kickoffShareUrl
    ? `<p class="subtext" style="margin-top:16px;font-size:13px;"><a href="${esc(flowUrl)}">Or open the onboarding tracker &rarr;</a></p>`
    : '';
  const inner = `
    <p class="subtext">${subtext}</p>
    <div class="button-wrap">${primaryCta}</div>
    ${secondaryCta}`;
  return layout(inner, agency, {
    eyebrow: milestoneEyebrow(milestone),
    heroTitle: `${esc(clientName)}: ${esc(headline)}`,
  });
}

// ────────────────────────────────────────────────────────────────────────
// 4. Stakeholder no-progress flag (5 day silence)
// ────────────────────────────────────────────────────────────────────────

export async function sendFlowNoProgressFlag(admin: AdminClient, flowId: string): Promise<void> {
  const { data: flow } = await admin
    .from('onboarding_flows')
    .select('id, last_poc_activity_at, last_no_progress_flag_at, clients!inner(name, slug, agency)')
    .eq('id', flowId)
    .maybeSingle();
  if (!flow) return;
  type FlowRow = {
    id: string;
    last_poc_activity_at: string | null;
    last_no_progress_flag_at: string | null;
    clients: { name: string; slug: string; agency: string | null } | Array<{ name: string; slug: string; agency: string | null }>;
  };
  const f = flow as FlowRow;
  const c = Array.isArray(f.clients) ? f.clients[0] : f.clients;
  const agency: AgencyBrand = c?.agency === 'anderson' ? 'anderson' : 'nativz';

  // Reuse the segment_completed channel: stakeholders opted into segment
  // milestones get the silence flag (it's a "something's stalled" alert
  // most useful to the same audience). If you want a separate toggle
  // later, add it to the stakeholders table.
  const { data: stakeholders } = await admin
    .from('onboarding_flow_stakeholders')
    .select('email, display_name')
    .eq('flow_id', flowId)
    .eq('notify_on_segment_completed', true);
  const list = ((stakeholders ?? []) as Array<{ email: string; display_name: string | null }>);
  if (list.length === 0) return;

  const resend = await getResendClient();
  if (!resend) return;

  const subject = `[${c?.name ?? 'Onboarding'}] No progress in 5 days`;
  const flowUrl = flowAdminUrlFor(agency, flowId);
  const html = stakeholderNoProgressHtml({ clientName: c?.name ?? 'this client', flowUrl, agency });

  for (const s of list) {
    try {
      await resend.emails.send({
        from: getFromAddress(agency),
        replyTo: getReplyTo(agency),
        to: s.email,
        subject,
        html,
      });
      await logSend(admin, flowId, 'stakeholder_no_progress', s.email, subject, 'sent');
    } catch (err) {
      await logSend(admin, flowId, 'stakeholder_no_progress', s.email, subject, 'failed', err instanceof Error ? err.message : 'send failed');
    }
  }

  await admin
    .from('onboarding_flows')
    .update({ last_no_progress_flag_at: new Date().toISOString() })
    .eq('id', flowId);
}

function stakeholderNoProgressHtml({
  clientName,
  flowUrl,
  agency,
}: {
  clientName: string;
  flowUrl: string;
  agency: AgencyBrand;
}): string {
  const inner = `
    <p class="subtext">
      No POC activity on this onboarding flow for 5 days. Worth a personal
      nudge. The auto-reminders have already fired, but a real human
      message moves the needle.
    </p>
    <div class="button-wrap">
      <a class="button" href="${esc(flowUrl)}">Open the flow &rarr;</a>
    </div>`;
  return layout(inner, agency, {
    eyebrow: 'No Progress · 5 Days',
    heroTitle: `${esc(clientName)} has gone quiet.`,
  });
}

// Suppress unused import warnings for future POC-invite logo overrides.
void getEmailLogoUrl;

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Re-export the agency resolver so cron can prefilter without re-importing
// the on-paid wiring.
export { getAgencyForFlow };

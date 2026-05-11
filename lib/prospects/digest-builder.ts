// SPY-10 T11: digest builder orchestrator.
//
// buildDraft(subscription) is the one-shot path called by the daily cron
// for each due subscription. Steps:
//   1. Apply D-05 hard cap (skip if last_sent_at within 72h).
//   2. Build the structured payload (weekly | monthly).
//   3. If weekly payload is null (no alerts), skip.
//   4. LLM-polish subject + opening (templated fallback on failure).
//   5. Resolve to_email + reply_to_email (sales rep > digest-from default).
//   6. Resolve CTA destination: latest minted presentation share-link, else
//      latest scorecard share-link, else /admin/prospects/<id>.
//   7. Render HTML + text.
//   8. Insert draft row with expires_at = now + 7d.
//
// Returns the inserted draft row + reason if skipped, never throws.

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { buildWeeklyCompetitorPayload } from './build-weekly-competitor-payload';
import { buildMonthlyFormatPayload } from './build-monthly-format-payload';
import { digestPolish } from './digest-polish';
import { renderDigest } from './digest-template';
import type {
  DigestKind,
  DigestSubscription,
  WeeklyCompetitorPayload,
  MonthlyFormatPayload,
} from './types';

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export interface BuildDraftResult {
  ok: boolean;
  draftId: string | null;
  skipped:
    | null
    | 'rate_limit_72h'
    | 'no_alerts'
    | 'no_contact_email'
    | 'collision_weekly_precedence'
    | 'prospect_missing'
    | 'subscription_inactive';
  error: string | null;
}

function pickContactEmail(rep?: {
  email: string | null;
} | null, fallback?: string | null): string | null {
  return rep?.email ?? fallback ?? null;
}

function ctaLabelForKind(kind: DigestKind): string {
  return kind === 'weekly_competitor'
    ? 'See the full report on Cortex'
    : 'See the full report on Cortex';
}

async function resolveCtaDestination(
  prospectId: string,
  baseUrl: string,
): Promise<string> {
  const admin = createAdminClient();
  // Prefer most recent active presentation link.
  const { data: pres } = await admin
    .from('prospect_share_links')
    .select('token, archived_at, expires_at')
    .eq('prospect_id', prospectId)
    .eq('kind', 'presentation')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  for (const row of pres ?? []) {
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) continue;
    return `${baseUrl}/present/${row.token}`;
  }
  const { data: card } = await admin
    .from('prospect_share_links')
    .select('token, archived_at, expires_at')
    .eq('prospect_id', prospectId)
    .neq('kind', 'presentation')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  for (const row of card ?? []) {
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) continue;
    return `${baseUrl}/shared/prospect/${row.token}`;
  }
  // Last resort: admin url (only the rep can open this).
  return `${baseUrl}/admin/prospects/${prospectId}`;
}

async function applyCollisionD01(subscription: DigestSubscription): Promise<boolean> {
  // D-01: when weekly + monthly fire same day, weekly takes precedence,
  // monthly defers. We're called for ONE subscription, so when this
  // subscription is monthly we check whether a weekly subscription would
  // also be due today; if so, we skip the monthly build.
  if (subscription.kind !== 'monthly_format') return false;

  const admin = createAdminClient();
  const { data: weekly } = await admin
    .from('prospect_digest_subscriptions')
    .select('id, last_built_at, active')
    .eq('prospect_id', subscription.prospect_id)
    .eq('kind', 'weekly_competitor')
    .eq('active', true)
    .maybeSingle();
  if (!weekly) return false;
  const lastBuilt = weekly.last_built_at ? new Date(weekly.last_built_at).getTime() : 0;
  const dueWeekly = !lastBuilt || Date.now() - lastBuilt >= 7 * 24 * 60 * 60 * 1000;
  return dueWeekly;
}

export async function buildDraft(
  subscription: DigestSubscription,
): Promise<BuildDraftResult> {
  const admin = createAdminClient();
  if (!subscription.active) {
    return { ok: false, draftId: null, skipped: 'subscription_inactive', error: null };
  }

  // D-05 hard cap.
  if (subscription.last_sent_at) {
    const since = Date.now() - new Date(subscription.last_sent_at).getTime();
    if (since < SEVENTY_TWO_HOURS_MS) {
      return { ok: false, draftId: null, skipped: 'rate_limit_72h', error: null };
    }
  }

  // D-01 collision.
  if (await applyCollisionD01(subscription)) {
    return {
      ok: false,
      draftId: null,
      skipped: 'collision_weekly_precedence',
      error: null,
    };
  }

  // Load prospect + owner.
  const { data: prospect } = await admin
    .from('prospects')
    .select('id, brand_name, owner_user_id, archived_at, lifecycle_state, primary_handle')
    .eq('id', subscription.prospect_id)
    .maybeSingle();
  if (!prospect || prospect.archived_at) {
    return { ok: false, draftId: null, skipped: 'prospect_missing', error: null };
  }

  // Resolve sales rep + their email.
  let salesRepName = 'Nativz team';
  let salesRepEmail = process.env.PROSPECT_DIGEST_FROM ?? 'digests@nativz.io';
  if (prospect.owner_user_id) {
    const { data: rep } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', prospect.owner_user_id)
      .maybeSingle();
    if (rep) {
      salesRepName = rep.full_name ?? salesRepName;
      const resolved = pickContactEmail(rep, salesRepEmail);
      if (resolved) salesRepEmail = resolved;
    }
  }

  // Recipient email: prospects don't carry a dedicated email column today,
  // so we look at touchpoints for a captured lead email (presentation lead
  // form drops `metadata.lead_email` on a 'note' touchpoint, and outbound
  // emails could carry their own lead identifier). Pull the most recent
  // one; if none, skip the build with no_contact_email so the rep sees
  // why the digest didn't fire.
  const { data: touchpoints } = await admin
    .from('prospect_touchpoints')
    .select('metadata, body, kind, occurred_at')
    .eq('prospect_id', subscription.prospect_id)
    .order('occurred_at', { ascending: false })
    .limit(20);

  let toEmail: string | null = null;
  for (const t of touchpoints ?? []) {
    const m = (t.metadata ?? {}) as Record<string, unknown>;
    const candidate =
      (typeof m.lead_email === 'string' && m.lead_email) ||
      (typeof m.recipient_email === 'string' && m.recipient_email) ||
      null;
    if (candidate) {
      toEmail = candidate;
      break;
    }
    // Last resort: pull the first email-looking token out of the body text.
    if (typeof t.body === 'string') {
      const match = t.body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (match) {
        toEmail = match[0];
        break;
      }
    }
  }
  if (!toEmail) {
    return { ok: false, draftId: null, skipped: 'no_contact_email', error: null };
  }

  // Resolve CTA destination.
  const baseUrl = getCortexAppUrl('nativz');
  const ctaUrl = await resolveCtaDestination(subscription.prospect_id, baseUrl);

  // Build payload.
  let payload: WeeklyCompetitorPayload | MonthlyFormatPayload | null;
  if (subscription.kind === 'weekly_competitor') {
    payload = await buildWeeklyCompetitorPayload({
      prospectId: subscription.prospect_id,
      ctaUrl,
    });
    if (!payload) {
      return { ok: false, draftId: null, skipped: 'no_alerts', error: null };
    }
  } else {
    payload = await buildMonthlyFormatPayload({
      prospectId: subscription.prospect_id,
      ctaUrl,
    });
  }

  // Polish.
  const polish = await digestPolish({
    brandName: prospect.brand_name,
    kind: subscription.kind,
    payload,
  });

  // Mint unsubscribe token if not present.
  let unsubToken = subscription.unsubscribe_token;
  if (!unsubToken) {
    unsubToken = crypto.randomBytes(24).toString('hex');
    await admin
      .from('prospect_digest_subscriptions')
      .update({ unsubscribe_token: unsubToken })
      .eq('id', subscription.id);
  }

  const unsubscribePerTypeUrl = `${baseUrl}/p/digest-unsubscribe/${unsubToken}?kind=${subscription.kind}`;
  const unsubscribeAllUrl = `${baseUrl}/p/digest-unsubscribe/${unsubToken}?kind=all`;

  // Tracked CTA gets minted at send time (we need draft_id). For now embed
  // the raw destination; the approve handler patches the HTML to wrap the
  // CTA href in /r/d/<event_id>?to=... so the click is logged.
  const { html, text } = renderDigest({
    brandName: prospect.brand_name,
    kind: subscription.kind,
    subject: polish.subject,
    opening: polish.opening,
    payload,
    ctaUrl,
    ctaLabel: ctaLabelForKind(subscription.kind),
    unsubscribePerTypeUrl,
    unsubscribeAllUrl,
    salesRepName,
    salesRepEmail,
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Tag payload with polish_fallback flag.
  const taggedPayload = {
    ...(payload as unknown as Record<string, unknown>),
    polish_fallback: polish.fallback,
  };

  const { data: draft, error: insertErr } = await admin
    .from('prospect_digest_drafts')
    .insert({
      subscription_id: subscription.id,
      prospect_id: subscription.prospect_id,
      kind: subscription.kind,
      subject: polish.subject,
      html,
      text,
      to_email: toEmail,
      reply_to_email: salesRepEmail,
      status: 'drafted',
      expires_at: expiresAt,
      payload: taggedPayload,
    })
    .select('id')
    .single();

  if (insertErr || !draft) {
    return {
      ok: false,
      draftId: null,
      skipped: null,
      error: insertErr?.message ?? 'insert failed',
    };
  }

  await admin
    .from('prospect_digest_subscriptions')
    .update({ last_built_at: new Date().toISOString() })
    .eq('id', subscription.id);

  return { ok: true, draftId: draft.id, skipped: null, error: null };
}

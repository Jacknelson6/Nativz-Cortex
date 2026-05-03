/**
 * GET /api/cron/onboarding-lagging-nudge
 *
 * Daily cron that finds in-flight onboardings where the client has gone
 * quiet for ~3 days and fires the `lagging_nudge` variant of the
 * onboarding nudge email. The actual stepper is share-token gated and
 * remembers progress, so the email's job is just to put the link back
 * in the inbox.
 *
 * Lag heuristic:
 *   - status = 'in_progress'
 *   - updated_at older than LAG_THRESHOLD_HOURS (72h)
 *
 * Cooldown:
 *   - we never send a lagging_nudge to the same onboarding twice
 *     inside COOLDOWN_HOURS (168h / 7d). The cooldown is enforced by
 *     reading the most recent `kind = 'lagging_nudge'` row from
 *     `onboarding_emails_log` per onboarding. No schema churn needed.
 *
 * Per-row send is multi-POC, mirroring the manual nudge route: the
 * sender returns one OnboardingEmailResult per recipient, and we log a
 * row per recipient to onboarding_emails_log.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { listOnboardings, logEmail } from '@/lib/onboarding/api';
import { sendOnboardingNudgeEmail } from '@/lib/onboarding/email';

export const runtime = 'nodejs';
export const maxDuration = 300;

const LAG_THRESHOLD_HOURS = 72; // 3 days quiet before we nudge
const COOLDOWN_HOURS = 168; // 7 days between consecutive lagging nudges

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const lagCutoff = new Date(now - LAG_THRESHOLD_HOURS * 3600 * 1000);
  const cooldownCutoff = new Date(now - COOLDOWN_HOURS * 3600 * 1000);

  // Pull every in_progress onboarding once. We expect a small set (tens
  // at most), so server-side filtering by updated_at after the load is
  // simpler than threading another helper through lib/onboarding/api.
  const allInFlight = await listOnboardings({ status: 'in_progress' });
  const stale = allInFlight.filter(
    (row) => new Date(row.updated_at).getTime() <= lagCutoff.getTime(),
  );

  if (stale.length === 0) {
    return NextResponse.json({
      message: 'No lagging onboardings',
      checked: allInFlight.length,
      stale: 0,
      sent: 0,
      skipped_cooldown: 0,
      errors: 0,
    });
  }

  // Resolve cooldown in one round trip: pull every recent
  // `lagging_nudge` log row for the stale set and bucket by onboarding_id.
  const staleIds = stale.map((r) => r.id);
  const { data: recentLogs } = await admin
    .from('onboarding_emails_log')
    .select('onboarding_id, sent_at')
    .in('onboarding_id', staleIds)
    .eq('kind', 'lagging_nudge')
    .gte('sent_at', cooldownCutoff.toISOString());
  const onCooldown = new Set<string>();
  for (const row of recentLogs ?? []) {
    onCooldown.add(row.onboarding_id as string);
  }

  let sent = 0;
  let skippedCooldown = 0;
  let errors = 0;

  for (const row of stale) {
    if (onCooldown.has(row.id)) {
      skippedCooldown += 1;
      continue;
    }

    try {
      const sentList = await sendOnboardingNudgeEmail({
        onboarding: row,
        kind: 'lagging_nudge',
      });

      for (const result of sentList) {
        await logEmail({
          onboarding_id: row.id,
          kind: 'lagging_nudge',
          to_email: result.to,
          subject: result.subject,
          body_preview: result.body_preview,
          resend_id: result.resend_id,
          ok: result.ok,
          error: result.error,
          triggered_by: null,
        });
        if (result.ok) sent += 1;
        else errors += 1;
      }
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.warn(
        `[cron/onboarding-lagging-nudge] send threw for onboarding ${row.id}:`,
        msg,
      );
    }
  }

  return NextResponse.json({
    message: `Lagging nudges processed: ${sent} sent, ${skippedCooldown} on cooldown, ${errors} errors`,
    checked: allInFlight.length,
    stale: stale.length,
    sent,
    skipped_cooldown: skippedCooldown,
    errors,
  });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/onboarding-lagging-nudge' },
  handleGet,
);

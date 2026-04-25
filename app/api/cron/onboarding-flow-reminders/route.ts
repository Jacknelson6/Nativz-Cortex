import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendFlowPocReminder,
  sendFlowNoProgressFlag,
} from '@/lib/onboarding/system-emails';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/onboarding-flow-reminders
 *
 * Hourly cron that fires two distinct nudges per onboarding flow:
 *
 *   1. POC reminder. If a flow is `active` and the POC hasn't ticked
 *      anything (or the share-link hasn't been viewed) in 48h AND the
 *      last reminder was sent > 48h ago, send another.
 *
 *   2. Stakeholder no-progress flag. If POC silence stretches past 5
 *      days, ping every stakeholder with the "segment completed"
 *      milestone toggled on. Capped to 1 ping per 5-day window.
 *
 * Both windows reference `last_poc_activity_at` — the column updated by
 * the public POC view (toggle/upload/connect) and by the proposal-paid
 * webhook on flow activation.
 *
 * Activity reference fields written by the public POC routes:
 *   - /api/onboarding/public/item-toggle  → bumps last_poc_activity_at
 *   - /api/onboarding/public/upload       → bumps last_poc_activity_at
 *   - /api/onboarding/public/connect      → bumps last_poc_activity_at
 *   - public POC GET                       → bumps last_poc_activity_at
 */
function isAuthorisedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev
  return auth === `Bearer ${secret}`;
}

const HOUR_MS = 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 48 * HOUR_MS;
const NO_PROGRESS_WINDOW_MS = 5 * 24 * HOUR_MS;

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date();

  const { data: flows } = await admin
    .from('onboarding_flows')
    .select('id, last_poc_activity_at, last_reminder_sent_at, last_no_progress_flag_at, started_at, poc_emails')
    .eq('status', 'active')
    .is('closed_at', null);

  type Row = {
    id: string;
    last_poc_activity_at: string | null;
    last_reminder_sent_at: string | null;
    last_no_progress_flag_at: string | null;
    started_at: string | null;
    poc_emails: string[] | null;
  };

  const result = {
    scanned: 0,
    reminders: 0,
    no_progress: 0,
  };

  for (const f of (flows ?? []) as Row[]) {
    result.scanned += 1;
    if (!f.poc_emails || f.poc_emails.length === 0) continue;

    // Reference for "silence": last activity > started > now - 1h fallback.
    const lastActivity = f.last_poc_activity_at
      ? new Date(f.last_poc_activity_at)
      : f.started_at
      ? new Date(f.started_at)
      : null;
    if (!lastActivity) continue;
    const silenceMs = now.getTime() - lastActivity.getTime();

    // 1. POC reminder
    if (silenceMs >= REMINDER_WINDOW_MS) {
      const lastReminder = f.last_reminder_sent_at ? new Date(f.last_reminder_sent_at) : null;
      const reminderAgeMs = lastReminder ? now.getTime() - lastReminder.getTime() : Infinity;
      if (reminderAgeMs >= REMINDER_WINDOW_MS) {
        try {
          await sendFlowPocReminder(admin, f.id);
          result.reminders += 1;
        } catch (err) {
          console.error('[cron/onboarding-flow-reminders] reminder failed', f.id, err);
        }
      }
    }

    // 2. Stakeholder no-progress flag
    if (silenceMs >= NO_PROGRESS_WINDOW_MS) {
      const lastFlag = f.last_no_progress_flag_at ? new Date(f.last_no_progress_flag_at) : null;
      const flagAgeMs = lastFlag ? now.getTime() - lastFlag.getTime() : Infinity;
      if (flagAgeMs >= NO_PROGRESS_WINDOW_MS) {
        try {
          await sendFlowNoProgressFlag(admin, f.id);
          result.no_progress += 1;
        } catch (err) {
          console.error('[cron/onboarding-flow-reminders] no-progress failed', f.id, err);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

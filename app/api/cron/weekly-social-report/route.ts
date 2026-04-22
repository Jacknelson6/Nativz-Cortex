import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAffiliateDigestRecipients } from '@/lib/affiliates/parse-digest-recipients';
import {
  isoWeekKeyForInstantInTimeZone,
  matchesAffiliateDigestSchedule,
} from '@/lib/affiliates/digest-schedule';
import {
  fetchWeeklySocialReport,
  rollingSevenDayRangeUtc,
} from '@/lib/reporting/weekly-social-report';
import { sendWeeklySocialReportEmail } from '@/lib/email/resend';
import { getSecret } from '@/lib/secrets/store';
import type { AgencyBrand } from '@/lib/agency/detect';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

function agencyFromClientName(agencyField: string | null): AgencyBrand {
  if (!agencyField) return 'nativz';
  const normalised = agencyField.trim().toLowerCase();
  if (normalised.includes('anderson')) return 'anderson';
  return 'nativz';
}

function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/**
 * GET /api/cron/weekly-social-report (Vercel cron — every 15 minutes)
 * POST /api/cron/weekly-social-report (manual — admin session or CRON_SECRET)
 *
 * Cron: for each client with `social_digest_email_enabled` + recipients,
 * sends only when local day/time matches the schedule and the ISO week key
 * differs from `social_digest_last_sent_week_key`. Manual POST sends
 * everyone immediately (no schedule dedup).
 *
 * Content per Jack (NAT-43):
 *   - Followers Δ (total + per-platform)
 *   - Aggregate views + engagement (absolute totals, no %)
 *   - Top 3 posts
 *   - Upcoming shoots (only shown when there's one in the next 7 days)
 *
 * Test redirect: set `WEEKLY_SOCIAL_REPORT_OVERRIDE_TO` outside Vercel
 * production to route every digest to one inbox.
 *
 * @auth Bearer CRON_SECRET or admin session
 */
async function handler(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const hasCronAuth =
      cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;

    if (!hasCronAuth) {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const admin = createAdminClient();
      const { data: userData } = await admin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      if (!userData || userData.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    const resendKey = await getSecret('RESEND_API_KEY');
    if (!resendKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const overrideToRaw = process.env.WEEKLY_SOCIAL_REPORT_OVERRIDE_TO?.trim();
    const testRedirect = !isVercelProduction() && overrideToRaw ? overrideToRaw : undefined;

    const admin = createAdminClient();
    const isCronTrigger = Boolean(hasCronAuth);
    const now = new Date();

    const { data: clients, error: qErr } = await admin
      .from('clients')
      .select(
        'id, name, agency, is_active, social_digest_email_enabled, social_digest_recipients, social_digest_timezone, social_digest_send_day_of_week, social_digest_send_hour, social_digest_send_minute, social_digest_last_sent_week_key',
      )
      .eq('is_active', true)
      .eq('social_digest_email_enabled', true);

    if (qErr) {
      console.error('[weekly-social-report] query error:', qErr);
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });
    }

    const targets = (clients ?? []).filter((c) => {
      const emails = parseAffiliateDigestRecipients(c.social_digest_recipients);
      return emails.length > 0;
    });

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No clients with social digest enabled + recipients.',
      });
    }

    const { start, end } = rollingSevenDayRangeUtc(now);
    const label = `${start} → ${end} (UTC)`;

    const results: Array<{
      clientId: string;
      name: string;
      ok: boolean;
      messageId?: string;
      recipients?: string[];
      error?: string;
      step?: string;
    }> = [];

    for (const c of targets) {
      const tz = (c.social_digest_timezone as string | null)?.trim() || 'America/Los_Angeles';
      const dow = Number(c.social_digest_send_day_of_week ?? 1);
      const hour = Number(c.social_digest_send_hour ?? 9);
      const minute = Number(c.social_digest_send_minute ?? 0);
      const lastWeek = (c.social_digest_last_sent_week_key as string | null)?.trim() ?? null;

      if (isCronTrigger) {
        const currentWeekKey = isoWeekKeyForInstantInTimeZone(now, tz);
        if (!currentWeekKey) {
          results.push({
            clientId: c.id,
            name: c.name ?? c.id,
            ok: false,
            step: 'schedule',
            error: 'Could not resolve digest week for timezone',
          });
          continue;
        }
        if (lastWeek === currentWeekKey) continue;
        if (!matchesAffiliateDigestSchedule(now, tz, dow, hour, minute)) continue;
      }

      const productionRecipients = parseAffiliateDigestRecipients(c.social_digest_recipients);
      const to = testRedirect ? [testRedirect] : productionRecipients;
      const isTestOverride = Boolean(testRedirect);
      const agency = agencyFromClientName(c.agency as string | null);

      try {
        const report = await fetchWeeklySocialReport(
          admin,
          c.id,
          c.name ?? 'Client',
          { start, end },
          now,
        );

        const sendResult = await sendWeeklySocialReportEmail({
          to,
          report,
          rangeLabel: label,
          isTestOverride,
          agency,
        });

        if (sendResult.error) {
          results.push({
            clientId: c.id,
            name: c.name ?? c.id,
            ok: false,
            step: 'email',
            error: sendResult.error.message,
          });
          continue;
        }

        results.push({
          clientId: c.id,
          name: c.name ?? c.id,
          ok: true,
          messageId: sendResult.data?.id,
          recipients: to,
        });

        if (isCronTrigger) {
          const weekKey = isoWeekKeyForInstantInTimeZone(new Date(), tz);
          if (weekKey) {
            await admin
              .from('clients')
              .update({ social_digest_last_sent_week_key: weekKey })
              .eq('id', c.id);
          }
        }
      } catch (err) {
        results.push({
          clientId: c.id,
          name: c.name ?? c.id,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({
      success: true,
      range: { start, end },
      sent,
      testRedirect: testRedirect ?? null,
      results,
    });
  } catch (error) {
    console.error('/api/cron/weekly-social-report error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export const GET = withCronTelemetry({ route: '/api/cron/weekly-social-report' }, handler);
export const POST = withCronTelemetry({ route: '/api/cron/weekly-social-report' }, handler);

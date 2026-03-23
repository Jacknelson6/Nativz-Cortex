import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAffiliateAnalyticsRange } from '@/lib/affiliates/fetch-affiliate-analytics-range';
import { parseAffiliateDigestRecipients } from '@/lib/affiliates/parse-digest-recipients';
import { syncClientAffiliates } from '@/lib/uppromote/sync';
import { sendAffiliateWeeklyReportEmail } from '@/lib/email/resend';

export const maxDuration = 300;

/**
 * Rolling last 7 calendar days in UTC (inclusive of today).
 */
function rollingSevenDayRangeUtc(): { start: string; end: string; label: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, label: `${start} → ${end} (UTC)` };
}

function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/**
 * GET /api/cron/weekly-affiliate-report (Vercel cron — Wednesdays)
 * POST /api/cron/weekly-affiliate-report (manual — admin session or CRON_SECRET)
 *
 * For each active client with UpPromote + `affiliate_digest_email_enabled` and non-empty
 * `affiliate_digest_recipients`: syncs UpPromote, then emails the past-7-day affiliate report.
 *
 * Test redirect: set `AFFILIATE_WEEKLY_REPORT_OVERRIDE_TO` only outside Vercel production
 * (ignored when VERCEL_ENV=production) so all digests go to one inbox.
 *
 * @auth Bearer CRON_SECRET or admin session
 */
async function handler(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const hasCronAuth = cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;

    if (!hasCronAuth) {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const admin = createAdminClient();
      const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
      if (!userData || userData.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 });
    }

    const overrideToRaw = process.env.AFFILIATE_WEEKLY_REPORT_OVERRIDE_TO?.trim();
    const testRedirect = !isVercelProduction() && overrideToRaw ? overrideToRaw : undefined;

    const admin = createAdminClient();

    const { data: clients, error: qErr } = await admin
      .from('clients')
      .select('id, name, uppromote_api_key, affiliate_digest_email_enabled, affiliate_digest_recipients')
      .eq('is_active', true)
      .eq('affiliate_digest_email_enabled', true)
      .not('uppromote_api_key', 'is', null);

    if (qErr) {
      console.error('[weekly-affiliate-report] query error:', qErr);
      return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });
    }

    const targets = (clients ?? []).filter((c) => {
      const emails = parseAffiliateDigestRecipients(c.affiliate_digest_recipients);
      return emails.length > 0 && c.uppromote_api_key;
    });

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No clients with affiliate digest enabled, recipients, and UpPromote connected.',
      });
    }

    const { start, end, label } = rollingSevenDayRangeUtc();
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
      const productionRecipients = parseAffiliateDigestRecipients(c.affiliate_digest_recipients);
      const to = testRedirect ? [testRedirect] : productionRecipients;
      const isTestOverride = Boolean(testRedirect);

      try {
        await syncClientAffiliates(c.id, c.uppromote_api_key!);
      } catch (syncErr) {
        console.error(`[weekly-affiliate-report] sync failed ${c.name}:`, syncErr);
        results.push({
          clientId: c.id,
          name: c.name ?? c.id,
          ok: false,
          step: 'sync',
          error: syncErr instanceof Error ? syncErr.message : 'Sync failed',
        });
        continue;
      }

      try {
        const analytics = await fetchAffiliateAnalyticsRange(admin, c.id, start, end);
        const sendResult = await sendAffiliateWeeklyReportEmail({
          to,
          clientName: c.name ?? 'Client',
          rangeLabel: label,
          kpis: {
            newAffiliates: analytics.kpis.newAffiliates,
            totalAffiliates: analytics.kpis.totalAffiliates,
            activeAffiliates: analytics.kpis.activeAffiliates,
            referralsInPeriod: analytics.kpis.referralsInPeriod,
            periodRevenue: analytics.kpis.periodRevenue,
            totalClicks: analytics.kpis.totalClicks,
          },
          topAffiliates: analytics.topAffiliates.map((a) => ({
            name: a.name,
            revenue: a.revenue,
            referrals: a.referrals,
          })),
          isTestOverride,
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
    console.error('/api/cron/weekly-affiliate-report error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export const GET = handler;
export const POST = handler;

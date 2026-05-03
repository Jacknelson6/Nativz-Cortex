import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { layout } from '@/lib/email/resend';
import { buildWeeklySocialReportCardHtml } from '@/lib/email/templates/weekly-social-report-html';
import { buildAffiliateWeeklyReportCardHtml } from '@/lib/email/templates/affiliate-weekly-report-html';
import { fetchWeeklySocialReport, rollingSevenDayRangeUtc } from '@/lib/reporting/weekly-social-report';
import { fetchAffiliateAnalyticsRange } from '@/lib/affiliates/fetch-affiliate-analytics-range';
import { resolveAgencyForRequest } from '@/lib/agency/detect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/email/preview
 *
 * Renders the exact HTML Resend would deliver for a given email kind, so
 * admins can preview in an iframe before scheduling or sending. Admin-only;
 * no side effects.
 *
 * Kinds:
 *   - weekly_social    real rolling-7d data; empty state acceptable
 *   - weekly_affiliate same
 *
 * The legacy `onboarding` kind was retired alongside the proposal/onboarding
 * rebuild; the new onboarding system owns its own preview surface.
 */
const Body = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('weekly_social'),
    client_id: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('weekly_affiliate'),
    client_id: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminClient();
    const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
    }

    const agency = resolveAgencyForRequest(request);

    switch (parsed.data.kind) {
      case 'weekly_social':
        return renderWeeklySocial(parsed.data, admin, agency);
      case 'weekly_affiliate':
        return renderWeeklyAffiliate(parsed.data, admin, agency);
    }
  } catch (error) {
    console.error('POST /api/email/preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;
type Agency = 'nativz' | 'anderson';

async function renderWeeklySocial(
  input: { client_id: string },
  admin: AdminClient,
  agency: Agency,
) {
  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', input.client_id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const range = rollingSevenDayRangeUtc();
  const rangeLabel = `${range.start} → ${range.end} (UTC)`;
  const report = await fetchWeeklySocialReport(admin, client.id, client.name, range);
  const card = buildWeeklySocialReportCardHtml({ report, rangeLabel, agency });
  const html = layout(card, agency);

  return NextResponse.json({
    subject: `Weekly social report ${client.name}`,
    html,
    unresolved: [],
  });
}

async function renderWeeklyAffiliate(
  input: { client_id: string },
  admin: AdminClient,
  agency: Agency,
) {
  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('id', input.client_id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const rangeFmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const rangeLabel = `${rangeFmt(startStr)} - ${rangeFmt(endStr)}`;

  const analytics = await fetchAffiliateAnalyticsRange(admin, client.id, startStr, endStr);
  const card = buildAffiliateWeeklyReportCardHtml({
    clientName: client.name,
    rangeLabel,
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
    agency,
  });
  const html = layout(card, agency);

  return NextResponse.json({
    subject: `Affiliate weekly report ${client.name}`,
    html,
    unresolved: [],
  });
}

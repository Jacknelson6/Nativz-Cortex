import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { layout } from '@/lib/email/resend';
import { buildUserEmailHtml } from '@/lib/email/templates/user-email';
import { buildWeeklySocialReportCardHtml } from '@/lib/email/templates/weekly-social-report-html';
import { buildAffiliateWeeklyReportCardHtml } from '@/lib/email/templates/affiliate-weekly-report-html';
import { fetchWeeklySocialReport, rollingSevenDayRangeUtc } from '@/lib/reporting/weekly-social-report';
import { fetchAffiliateAnalyticsRange } from '@/lib/affiliates/fetch-affiliate-analytics-range';
import { interpolateEmail } from '@/lib/onboarding/interpolate-email';
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
 *   - onboarding       body with placeholders, markdown-aware HTML
 *   - weekly_social    real rolling-7d data; empty state acceptable
 *   - weekly_affiliate same
 *
 * Response: { subject, html, unresolved: string[] } where unresolved lists
 * any placeholder tokens left in the rendered copy so admins can spot typos.
 */
const Body = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('onboarding'),
    subject: z.string().max(300),
    body: z.string().max(10_000),
    tracker_id: z.string().uuid().nullable().optional(),
  }),
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
      case 'onboarding':
        return renderOnboarding(parsed.data, admin, agency);
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

function findUnresolvedPlaceholders(subject: string, body: string): string[] {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const out = new Set<string>();
  for (const s of [subject, body]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      out.add(m[1]);
    }
  }
  return Array.from(out);
}

type AdminClient = ReturnType<typeof createAdminClient>;
type Agency = 'nativz' | 'anderson';

async function renderOnboarding(
  input: { subject: string; body: string; tracker_id?: string | null | undefined },
  admin: AdminClient,
  agency: Agency,
) {
  let ctx = {
    clientName: 'Sample Client',
    service: 'SMM',
    shareUrl: 'https://cortex.nativz.io/onboarding/sample?token=preview',
    contactFirstName: 'Jack',
  };

  if (input.tracker_id) {
    const { data: tracker } = await admin
      .from('onboarding_trackers')
      .select('id, client_id, service, share_token, clients(name, slug)')
      .eq('id', input.tracker_id)
      .maybeSingle();
    if (tracker) {
      const clients = (tracker as { clients: { name: string; slug: string } | { name: string; slug: string }[] | null }).clients;
      const c = Array.isArray(clients) ? clients[0] : clients;
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://cortex.nativz.io';
      let contactFirstName: string | null = null;
      if (tracker.client_id) {
        const { data: contact } = await admin
          .from('contacts')
          .select('name')
          .eq('client_id', tracker.client_id)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        contactFirstName = contact?.name?.trim().split(/\s+/)[0] ?? null;
      }
      ctx = {
        clientName: c?.name ?? 'Client',
        service: tracker.service,
        shareUrl: `${baseUrl}/onboarding/${c?.slug ?? 'onboarding'}?token=${tracker.share_token}`,
        contactFirstName: contactFirstName ?? 'there',
      };
    }
  }

  const resolvedSubject = interpolateEmail(input.subject, ctx);
  const resolvedBody = interpolateEmail(input.body, ctx);
  const html = buildUserEmailHtml(resolvedBody, agency);

  return NextResponse.json({
    subject: resolvedSubject,
    html,
    unresolved: findUnresolvedPlaceholders(resolvedSubject, resolvedBody),
  });
}

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
  const rangeLabel = `${range.start} \u2192 ${range.end} (UTC)`;
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

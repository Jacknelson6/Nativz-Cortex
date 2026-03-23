import type { SupabaseClient } from '@supabase/supabase-js';

export type AffiliateAnalyticsKpis = {
  newAffiliates: number;
  totalAffiliates: number;
  activeAffiliates: number;
  referralsInPeriod: number;
  periodRevenue: number;
  totalRevenue: number;
  periodCommission: number;
  totalClicks: number;
  totalPending: number;
};

export type AffiliateAnalyticsSnapshotRow = {
  snapshot_date: string;
  total_affiliates: number;
  active_affiliates: number;
  total_referrals: number;
  total_revenue: number;
  total_clicks: number;
  daily_sales_count: number;
  daily_revenue: number;
};

export type AffiliateTopAffiliateRow = {
  uppromote_id: number;
  name: string;
  email: string;
  status: string;
  program: string | null;
  revenue: number;
  commission: number;
  clicks: number;
  referrals: number;
  pending: number;
  joined: string | null;
};

export type AffiliateRecentReferralRow = {
  uppromote_id: number;
  orderNumber: string | null;
  affiliateName: string;
  totalSales: number;
  commission: number;
  status: string;
  trackingType: string | null;
  date: string | null;
};

export type AffiliatePendingPayoutRow = {
  name: string;
  email: string;
  pending: number;
  paid: number;
};

export type AffiliateAnalyticsRangeResult = {
  kpis: AffiliateAnalyticsKpis;
  snapshots: AffiliateAnalyticsSnapshotRow[];
  topAffiliates: AffiliateTopAffiliateRow[];
  recentReferrals: AffiliateRecentReferralRow[];
  pendingPayouts: AffiliatePendingPayoutRow[];
};

/**
 * Loads affiliate dashboard metrics for a client and UTC-inclusive date range (start/end YYYY-MM-DD).
 */
export async function fetchAffiliateAnalyticsRange(
  admin: SupabaseClient,
  clientId: string,
  start: string,
  end: string,
): Promise<AffiliateAnalyticsRangeResult> {
  const startTs = `${start}T00:00:00Z`;
  const endTs = `${end}T23:59:59Z`;

  const [
    { count: newAffiliates },
    { count: totalAffiliates },
    { count: activeAffiliates },
    { count: periodReferrals },
    { data: periodSalesData },
    { data: allTimeSalesData },
    { data: periodCommissionData },
    { data: clicksData },
    { data: snapshots },
    { data: topAffiliateMembers },
    { data: recentReferrals },
    { data: pendingPayouts },
  ] = await Promise.all([
    admin
      .from('affiliate_members')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at_upstream', startTs)
      .lte('created_at_upstream', endTs),

    admin
      .from('affiliate_members')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .lte('created_at_upstream', endTs),

    admin
      .from('affiliate_members')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'active')
      .lte('created_at_upstream', endTs),

    admin
      .from('affiliate_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at_upstream', startTs)
      .lte('created_at_upstream', endTs),

    admin
      .from('affiliate_referrals')
      .select('total_sales, created_at_upstream, affiliate_email, affiliate_name')
      .eq('client_id', clientId)
      .gte('created_at_upstream', startTs)
      .lte('created_at_upstream', endTs),

    admin.from('affiliate_referrals').select('total_sales').eq('client_id', clientId),

    admin
      .from('affiliate_referrals')
      .select('commission')
      .eq('client_id', clientId)
      .gte('created_at_upstream', startTs)
      .lte('created_at_upstream', endTs),

    admin.from('affiliate_members').select('clicks').eq('client_id', clientId),

    admin
      .from('affiliate_snapshots')
      .select('snapshot_date, total_affiliates, active_affiliates, total_referrals, total_revenue, total_clicks')
      .eq('client_id', clientId)
      .gte('snapshot_date', start)
      .lte('snapshot_date', end)
      .order('snapshot_date', { ascending: true }),

    admin
      .from('affiliate_members')
      .select(
        'uppromote_id, email, first_name, last_name, status, program_name, approved_amount, pending_amount, clicks, referral_count, total_sales_revenue, created_at_upstream',
      )
      .eq('client_id', clientId)
      .order('total_sales_revenue', { ascending: false }),

    admin
      .from('affiliate_referrals')
      .select(
        'uppromote_id, order_number, affiliate_name, affiliate_email, total_sales, commission, status, tracking_type, created_at_upstream',
      )
      .eq('client_id', clientId)
      .gte('created_at_upstream', startTs)
      .lte('created_at_upstream', endTs)
      .order('created_at_upstream', { ascending: false })
      .limit(20),

    admin
      .from('affiliate_members')
      .select('email, first_name, last_name, pending_amount, paid_amount')
      .eq('client_id', clientId)
      .gt('pending_amount', 0)
      .order('pending_amount', { ascending: false })
      .limit(10),
  ]);

  const periodRevenue = (periodSalesData ?? []).reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
  const totalRevenue = (allTimeSalesData ?? []).reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
  const periodCommission = (periodCommissionData ?? []).reduce((sum, r) => sum + (Number(r.commission) || 0), 0);
  const totalClicks = (clicksData ?? []).reduce((sum, r) => sum + (Number(r.clicks) || 0), 0);
  const totalPending = (pendingPayouts ?? []).reduce((sum, m) => sum + (Number(m.pending_amount) || 0), 0);

  const dailySalesMap: Record<string, number> = {};
  const dailyRevenueMap: Record<string, number> = {};
  const affiliatePeriodStats = new Map<string, { revenue: number; referrals: number }>();
  for (const r of periodSalesData ?? []) {
    const raw = r.created_at_upstream ? String(r.created_at_upstream) : null;
    const date = raw ? raw.split('T')[0].split(' ')[0] : null;
    if (date) {
      dailySalesMap[date] = (dailySalesMap[date] || 0) + 1;
      dailyRevenueMap[date] = (dailyRevenueMap[date] || 0) + (Number(r.total_sales) || 0);
    }
    const email = r.affiliate_email as string | null;
    if (email) {
      const existing = affiliatePeriodStats.get(email) ?? { revenue: 0, referrals: 0 };
      existing.revenue += Number(r.total_sales) || 0;
      existing.referrals += 1;
      affiliatePeriodStats.set(email, existing);
    }
  }

  return {
    kpis: {
      newAffiliates: newAffiliates ?? 0,
      totalAffiliates: totalAffiliates ?? 0,
      activeAffiliates: activeAffiliates ?? 0,
      referralsInPeriod: periodReferrals ?? 0,
      periodRevenue,
      totalRevenue,
      periodCommission,
      totalClicks,
      totalPending,
    },
    snapshots: (snapshots ?? []).map((s) => ({
      ...s,
      daily_sales_count: dailySalesMap[s.snapshot_date] ?? 0,
      daily_revenue: dailyRevenueMap[s.snapshot_date] ?? 0,
    })),
    topAffiliates: (topAffiliateMembers ?? [])
      .map((a) => {
        const periodStats = affiliatePeriodStats.get(a.email);
        return {
          uppromote_id: a.uppromote_id,
          name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email,
          email: a.email,
          status: a.status,
          program: a.program_name,
          revenue: periodStats?.revenue ?? 0,
          commission: Number(a.approved_amount) || 0,
          clicks: Number(a.clicks) || 0,
          referrals: periodStats?.referrals ?? 0,
          pending: Number(a.pending_amount) || 0,
          joined: a.created_at_upstream,
        };
      })
      .sort((a, b) => b.revenue - a.revenue),
    recentReferrals: (recentReferrals ?? []).map((r) => ({
      uppromote_id: r.uppromote_id,
      orderNumber: r.order_number,
      affiliateName: r.affiliate_name ?? r.affiliate_email ?? '—',
      totalSales: Number(r.total_sales) || 0,
      commission: Number(r.commission) || 0,
      status: r.status,
      trackingType: r.tracking_type,
      date: r.created_at_upstream,
    })),
    pendingPayouts: (pendingPayouts ?? []).map((m) => ({
      name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email,
      email: m.email,
      pending: Number(m.pending_amount) || 0,
      paid: Number(m.paid_amount) || 0,
    })),
  };
}

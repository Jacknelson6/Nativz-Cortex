import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const querySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string(),
  end: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin.from('users').select('role').eq('id', user.id).single();
    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { clientId, start, end } = parsed.data;
    const startTs = `${start}T00:00:00Z`;
    const endTs = `${end}T23:59:59Z`;

    // Run all queries in parallel
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
      // New affiliates that joined in period
      admin
        .from('affiliate_members')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .gte('created_at_upstream', startTs)
        .lte('created_at_upstream', endTs),

      // Total affiliates as of end date
      admin
        .from('affiliate_members')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .lte('created_at_upstream', endTs),

      // Active affiliates as of end date
      admin
        .from('affiliate_members')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'active')
        .lte('created_at_upstream', endTs),

      // Referrals in period (from actual referrals table)
      admin
        .from('affiliate_referrals')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .gte('created_at_upstream', startTs)
        .lte('created_at_upstream', endTs),

      // Period sales revenue (from referrals — actual sales, NOT commission)
      admin
        .from('affiliate_referrals')
        .select('total_sales, created_at_upstream, affiliate_email, affiliate_name')
        .eq('client_id', clientId)
        .gte('created_at_upstream', startTs)
        .lte('created_at_upstream', endTs),

      // All-time sales revenue (from referrals)
      admin
        .from('affiliate_referrals')
        .select('total_sales')
        .eq('client_id', clientId),

      // Period commission (from affiliate_members approved_amount for affiliates in period)
      admin
        .from('affiliate_referrals')
        .select('commission')
        .eq('client_id', clientId)
        .gte('created_at_upstream', startTs)
        .lte('created_at_upstream', endTs),

      // Total clicks (cumulative from affiliate_members — UpPromote doesn't expose daily clicks)
      admin
        .from('affiliate_members')
        .select('clicks')
        .eq('client_id', clientId),

      // Snapshots for trend chart (filtered to date range)
      admin
        .from('affiliate_snapshots')
        .select('snapshot_date, total_affiliates, active_affiliates, total_referrals, total_revenue, total_clicks')
        .eq('client_id', clientId)
        .gte('snapshot_date', start)
        .lte('snapshot_date', end)
        .order('snapshot_date', { ascending: true }),

      // Top affiliates by sales revenue (join members with their referral totals)
      admin
        .from('affiliate_members')
        .select('uppromote_id, email, first_name, last_name, status, program_name, approved_amount, pending_amount, clicks, referral_count, total_sales_revenue, created_at_upstream')
        .eq('client_id', clientId)
        .order('total_sales_revenue', { ascending: false }),

      // Recent referrals in period
      admin
        .from('affiliate_referrals')
        .select('uppromote_id, order_number, affiliate_name, affiliate_email, total_sales, commission, status, tracking_type, created_at_upstream')
        .eq('client_id', clientId)
        .gte('created_at_upstream', startTs)
        .lte('created_at_upstream', endTs)
        .order('created_at_upstream', { ascending: false })
        .limit(20),

      // Pending payouts
      admin
        .from('affiliate_members')
        .select('email, first_name, last_name, pending_amount, paid_amount')
        .eq('client_id', clientId)
        .gt('pending_amount', 0)
        .order('pending_amount', { ascending: false })
        .limit(10),
    ]);

    // Revenue = total_sales from referrals (actual sales), NOT commission
    const periodRevenue = (periodSalesData ?? []).reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
    const totalRevenue = (allTimeSalesData ?? []).reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
    const periodCommission = (periodCommissionData ?? []).reduce((sum, r) => sum + (Number(r.commission) || 0), 0);
    const totalClicks = (clicksData ?? []).reduce((sum, r) => sum + (Number(r.clicks) || 0), 0);
    const totalPending = (pendingPayouts ?? []).reduce((sum, m) => sum + (Number(m.pending_amount) || 0), 0);

    // Build daily sales count AND revenue from period referrals (for chart)
    const dailySalesMap: Record<string, number> = {};
    const dailyRevenueMap: Record<string, number> = {};
    // Also build per-affiliate period stats
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

    return NextResponse.json({
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
      topAffiliates: (topAffiliateMembers ?? []).map((a) => {
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
      }).sort((a, b) => b.revenue - a.revenue),
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
    });
  } catch (error) {
    console.error('GET /api/affiliates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

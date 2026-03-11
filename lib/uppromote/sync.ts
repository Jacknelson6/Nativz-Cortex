import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchAllAffiliates,
  fetchAllReferrals,
} from './client';

/** Sync all affiliate data from UpPromote for clients with an API key */
export async function syncAllAffiliateClients() {
  const admin = createAdminClient();

  const { data: clients, error } = await admin
    .from('clients')
    .select('id, name, uppromote_api_key')
    .not('uppromote_api_key', 'is', null)
    .eq('is_active', true);

  if (error) {
    console.error('[affiliate-sync] Query error:', error);
    return { synced: 0 };
  }
  if (!clients?.length) {
    console.log('[affiliate-sync] No clients with UpPromote API keys');
    return { synced: 0 };
  }

  let synced = 0;
  for (const client of clients) {
    try {
      await syncClientAffiliates(client.id, client.uppromote_api_key!);
      synced++;
      console.log(`[affiliate-sync] Synced ${client.name}`);
    } catch (err) {
      console.error(`[affiliate-sync] Failed for ${client.name}:`, err);
    }
  }

  return { synced };
}

/** Sync a single client's affiliate data */
export async function syncClientAffiliates(clientId: string, apiKey: string) {
  const admin = createAdminClient();

  // Fetch affiliates and referrals in parallel
  const [affiliates, referrals] = await Promise.all([
    fetchAllAffiliates(apiKey),
    fetchAllReferrals(apiKey),
  ]);

  // Build per-affiliate aggregates from referrals
  const affiliateStats = new Map<string, { clicks: number; referralCount: number; totalSalesRevenue: number }>();
  for (const r of referrals) {
    const email = r.affiliate.email;
    const existing = affiliateStats.get(email) ?? { clicks: 0, referralCount: 0, totalSalesRevenue: 0 };
    existing.referralCount++;
    existing.totalSalesRevenue += parseFloat(r.total_sales) || 0;
    affiliateStats.set(email, existing);
  }

  // Upsert affiliate members
  if (affiliates.length > 0) {
    const rows = affiliates.map((a) => {
      const stats = affiliateStats.get(a.email);
      return {
        client_id: clientId,
        uppromote_id: a.id,
        email: a.email,
        first_name: a.first_name || null,
        last_name: a.last_name || null,
        status: a.status || 'pending',
        company: a.company || null,
        phone: a.phone || null,
        country: a.country || null,
        website: a.website || null,
        affiliate_link: a.default_affiliate_link || a.custom_affiliate_link || null,
        program_id: a.program_id || null,
        program_name: a.program_name || null,
        coupons: a.coupons?.length ? a.coupons : null,
        paid_amount: a.paid_amount ?? 0,
        approved_amount: a.approved_amount ?? 0,
        pending_amount: a.pending_amount ?? 0,
        referral_count: stats?.referralCount ?? 0,
        total_sales_revenue: stats?.totalSalesRevenue ?? 0,
        created_at_upstream: a.created_at || null,
        synced_at: new Date().toISOString(),
      };
    });

    const { error: affErr } = await admin
      .from('affiliate_members')
      .upsert(rows, { onConflict: 'client_id,uppromote_id' });

    if (affErr) console.error('[affiliate-sync] affiliate upsert error:', affErr);
  }

  // Upsert referrals
  if (referrals.length > 0) {
    const rows = referrals.map((r) => ({
      client_id: clientId,
      uppromote_id: r.id,
      order_id: r.order_id ?? null,
      order_number: r.order_number ?? null,
      affiliate_uppromote_id: r.affiliate.id,
      affiliate_email: r.affiliate.email || null,
      affiliate_name: [r.affiliate.first_name, r.affiliate.last_name].filter(Boolean).join(' ') || null,
      total_sales: parseFloat(r.total_sales) || 0,
      commission: parseFloat(r.commission) || 0,
      status: r.status || 'pending',
      tracking_type: r.tracking_type || null,
      coupon_applied: r.coupon_applied || null,
      customer_email: r.customer_email || null,
      created_at_upstream: r.created_at || null,
      synced_at: new Date().toISOString(),
    }));

    const { error: refErr } = await admin
      .from('affiliate_referrals')
      .upsert(rows, { onConflict: 'client_id,uppromote_id' });

    if (refErr) console.error('[affiliate-sync] referral upsert error:', refErr);
  }

  // Save daily snapshot — revenue = total_sales (actual sales), NOT commission
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const activeAffiliates = affiliates.filter((a) => a.status === 'active').length;
  const totalSalesRevenue = referrals.reduce((sum, r) => sum + (parseFloat(r.total_sales) || 0), 0);

  // Clicks come from DB (imported from CSV), not from UpPromote API
  const { data: clicksRow } = await admin
    .from('affiliate_members')
    .select('clicks')
    .eq('client_id', clientId);
  const totalClicks = (clicksRow ?? []).reduce((sum, r) => sum + (Number(r.clicks) || 0), 0);

  const { error: snapErr } = await admin
    .from('affiliate_snapshots')
    .upsert(
      {
        client_id: clientId,
        snapshot_date: today,
        total_affiliates: affiliates.length,
        active_affiliates: activeAffiliates,
        total_referrals: referrals.length,
        total_revenue: totalSalesRevenue,
        total_clicks: totalClicks,
      },
      { onConflict: 'client_id,snapshot_date' },
    );

  if (snapErr) console.error('[affiliate-sync] snapshot upsert error:', snapErr);

  return {
    affiliates: affiliates.length,
    referrals: referrals.length,
  };
}

import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

function resolveSlug(admin: ReturnType<typeof createAdminClient>) {
  return async (idOrSlug: string) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)) {
      return idOrSlug;
    }
    const { data } = await admin.from('clients').select('id').eq('slug', idOrSlug).single();
    return data?.id ?? null;
  };
}

export const affiliateTools: ToolDefinition[] = [
  {
    name: 'get_affiliate_summary',
    description: 'Get affiliate program summary for a client. Returns KPIs like total affiliates, revenue, referrals, and pending payouts for the specified period.',
    parameters: z.object({
      client_id: z.string().describe('Client ID or slug'),
      days: z.number().optional().describe('Number of days to look back. Default 30.'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const days = (params.days as number) || 30;
        const now = new Date();
        const end = now.toISOString().split('T')[0];
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const startTs = `${start}T00:00:00Z`;
        const endTs = `${end}T23:59:59Z`;

        const clientId = await resolveSlug(admin)(params.client_id as string);
        if (!clientId) return { success: false, error: `Client "${params.client_id}" not found` };

        const [
          { count: totalAffiliates },
          { count: activeAffiliates },
          { count: newAffiliates },
          { data: periodReferrals },
          { data: pendingMembers },
        ] = await Promise.all([
          admin.from('affiliate_members').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
          admin.from('affiliate_members').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'active'),
          admin.from('affiliate_members').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at_upstream', startTs).lte('created_at_upstream', endTs),
          admin.from('affiliate_referrals').select('total_sales, commission').eq('client_id', clientId).gte('created_at_upstream', startTs).lte('created_at_upstream', endTs),
          admin.from('affiliate_members').select('pending_amount').eq('client_id', clientId).gt('pending_amount', 0),
        ]);

        const periodRevenue = (periodReferrals ?? []).reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
        const periodReferralCount = periodReferrals?.length ?? 0;
        const totalPending = (pendingMembers ?? []).reduce((sum, m) => sum + (Number(m.pending_amount) || 0), 0);

        return {
          success: true,
          data: {
            period: `${start} to ${end}`,
            totalAffiliates: totalAffiliates ?? 0,
            activeAffiliates: activeAffiliates ?? 0,
            newAffiliatesInPeriod: newAffiliates ?? 0,
            periodReferrals: periodReferralCount,
            periodRevenue,
            totalPendingPayouts: totalPending,
          },
          cardType: 'affiliate' as const,
          link: { href: '/admin/analytics', label: 'View affiliates' },
        };
      } catch {
        return { success: false, error: 'Failed to fetch affiliate summary' };
      }
    },
  },
  {
    name: 'list_affiliates',
    description: 'List affiliates for a client, optionally filtered by status. Returns name, email, status, revenue, referrals, and pending payout.',
    parameters: z.object({
      client_id: z.string().describe('Client ID or slug'),
      status: z.enum(['active', 'pending', 'approved', 'denied', 'inactive']).optional().describe('Filter by affiliate status'),
      limit: z.number().optional().describe('Max number to return. Default 20.'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const limit = (params.limit as number) || 20;

        const clientId = await resolveSlug(admin)(params.client_id as string);
        if (!clientId) return { success: false, error: `Client "${params.client_id}" not found` };

        let query = admin
          .from('affiliate_members')
          .select('uppromote_id, email, first_name, last_name, status, program_name, total_sales_revenue, referral_count, pending_amount, clicks, created_at_upstream')
          .eq('client_id', clientId)
          .order('total_sales_revenue', { ascending: false })
          .limit(limit);

        if (params.status) {
          query = query.eq('status', params.status as string);
        }

        const { data: members, error } = await query;
        if (error) return { success: false, error: 'Failed to fetch affiliates' };

        const affiliates = (members ?? []).map((a) => ({
          name: [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email,
          email: a.email,
          status: a.status,
          program: a.program_name,
          revenue: Number(a.total_sales_revenue) || 0,
          referrals: Number(a.referral_count) || 0,
          pending: Number(a.pending_amount) || 0,
          clicks: Number(a.clicks) || 0,
          joined: a.created_at_upstream,
        }));

        return {
          success: true,
          data: { affiliates, count: affiliates.length },
          cardType: 'affiliate' as const,
        };
      } catch {
        return { success: false, error: 'Failed to list affiliates' };
      }
    },
  },
  {
    name: 'get_affiliate_referrals',
    description: 'Get recent referrals (sales) for a client\'s affiliate program. Shows order details, affiliate name, revenue, and commission.',
    parameters: z.object({
      client_id: z.string().describe('Client ID or slug'),
      days: z.number().optional().describe('Number of days to look back. Default 30.'),
      limit: z.number().optional().describe('Max referrals to return. Default 20.'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();
        const days = (params.days as number) || 30;
        const limit = (params.limit as number) || 20;
        const now = new Date();
        const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const startTs = `${start}T00:00:00Z`;

        const clientId = await resolveSlug(admin)(params.client_id as string);
        if (!clientId) return { success: false, error: `Client "${params.client_id}" not found` };

        const { data: referrals, error } = await admin
          .from('affiliate_referrals')
          .select('order_number, affiliate_name, affiliate_email, total_sales, commission, status, tracking_type, created_at_upstream')
          .eq('client_id', clientId)
          .gte('created_at_upstream', startTs)
          .order('created_at_upstream', { ascending: false })
          .limit(limit);

        if (error) return { success: false, error: 'Failed to fetch referrals' };

        const rows = (referrals ?? []).map((r) => ({
          orderNumber: r.order_number,
          affiliate: r.affiliate_name ?? r.affiliate_email ?? '—',
          revenue: Number(r.total_sales) || 0,
          commission: Number(r.commission) || 0,
          status: r.status,
          trackingType: r.tracking_type,
          date: r.created_at_upstream,
        }));

        return {
          success: true,
          data: { referrals: rows, count: rows.length, period: `${start} to ${now.toISOString().split('T')[0]}` },
          cardType: 'affiliate' as const,
        };
      } catch {
        return { success: false, error: 'Failed to fetch affiliate referrals' };
      }
    },
  },
  {
    name: 'get_pending_payouts',
    description: 'Get affiliates with pending (unpaid) commission balances for a client.',
    parameters: z.object({
      client_id: z.string().describe('Client ID or slug'),
    }),
    riskLevel: 'read',
    handler: async (params) => {
      try {
        const admin = createAdminClient();

        const clientId = await resolveSlug(admin)(params.client_id as string);
        if (!clientId) return { success: false, error: `Client "${params.client_id}" not found` };

        const { data: members, error } = await admin
          .from('affiliate_members')
          .select('email, first_name, last_name, pending_amount, paid_amount')
          .eq('client_id', clientId)
          .gt('pending_amount', 0)
          .order('pending_amount', { ascending: false });

        if (error) return { success: false, error: 'Failed to fetch pending payouts' };

        const payouts = (members ?? []).map((m) => ({
          name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email,
          email: m.email,
          pending: Number(m.pending_amount) || 0,
          paid: Number(m.paid_amount) || 0,
        }));

        const totalPending = payouts.reduce((sum, p) => sum + p.pending, 0);

        return {
          success: true,
          data: { payouts, totalPending, count: payouts.length },
          cardType: 'affiliate' as const,
        };
      } catch {
        return { success: false, error: 'Failed to fetch pending payouts' };
      }
    },
  },
];

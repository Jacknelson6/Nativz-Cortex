import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  name: string | null;
  slug: string | null;
  lifecycle_state: string;
  mrr_cents: number;
  boosting_budget_cents: number;
  stripe_customer_id: string | null;
  is_active: boolean | null;
  hide_from_roster: boolean | null;
};

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const periodMonth = monthStart.toISOString().slice(0, 10);

  const [clientsRes, lifetimeRes, openArRes, adSpendRes, subsCountRes, contractStatusRes] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, lifecycle_state, mrr_cents, boosting_budget_cents, stripe_customer_id, is_active, hide_from_roster')
      .order('mrr_cents', { ascending: false })
      .order('name', { ascending: true }),
    admin.from('stripe_invoices').select('client_id, amount_paid_cents').not('client_id', 'is', null),
    admin
      .from('stripe_invoices')
      .select('client_id, amount_remaining_cents')
      .eq('status', 'open')
      .not('client_id', 'is', null),
    admin
      .from('client_ad_spend')
      .select('client_id, spend_cents')
      .eq('period_month', periodMonth),
    admin
      .from('stripe_subscriptions')
      .select('client_id')
      .in('status', ['active', 'trialing', 'past_due']),
    admin.from('client_contracts').select('client_id, status, effective_start, effective_end'),
  ]);

  const byClient = new Map<string, { lifetime: number; ar: number; ad: number; subs: number; contract: string | null }>();
  const ensure = (id: string) => {
    const existing = byClient.get(id);
    if (existing) return existing;
    const fresh = { lifetime: 0, ar: 0, ad: 0, subs: 0, contract: null as string | null };
    byClient.set(id, fresh);
    return fresh;
  };

  for (const r of lifetimeRes.data ?? []) if (r.client_id) ensure(r.client_id).lifetime += r.amount_paid_cents ?? 0;
  for (const r of openArRes.data ?? []) if (r.client_id) ensure(r.client_id).ar += r.amount_remaining_cents ?? 0;
  for (const r of adSpendRes.data ?? []) if (r.client_id) ensure(r.client_id).ad += r.spend_cents ?? 0;
  for (const r of subsCountRes.data ?? []) if (r.client_id) ensure(r.client_id).subs += 1;
  for (const r of contractStatusRes.data ?? []) if (r.client_id) ensure(r.client_id).contract = r.status ?? null;

  const rows = ((clientsRes.data ?? []) as ClientRow[])
    .filter((c) => !c.hide_from_roster)
    .map((c) => {
      const extras = byClient.get(c.id) ?? { lifetime: 0, ar: 0, ad: 0, subs: 0, contract: null };
      const netMtd = extras.lifetime - extras.ad;
      return {
        ...c,
        lifetime_revenue_cents: extras.lifetime,
        open_ar_cents: extras.ar,
        ad_spend_mtd_cents: extras.ad,
        active_subscriptions: extras.subs,
        contract_status: extras.contract,
        net_mtd_cents: netMtd,
      };
    });

  return NextResponse.json({ clients: rows });
}

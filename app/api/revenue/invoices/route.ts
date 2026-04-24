import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.string().optional(),
  client_id: z.string().uuid().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  const { status, client_id, q, limit } = parsed.data;

  let query = admin
    .from('stripe_invoices')
    .select(
      'id, number, status, amount_due_cents, amount_paid_cents, amount_remaining_cents, currency, due_date, paid_at, finalized_at, hosted_invoice_url, invoice_pdf, client_id, subscription_id, created_at, clients(name, slug)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') query = query.eq('status', status);
  if (client_id) query = query.eq('client_id', client_id);
  if (q) query = query.ilike('number', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data ?? [] });
}

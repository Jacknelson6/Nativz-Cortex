import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { centsToDollars } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  range: z.enum(['mtd', 'ytd', 'last30', 'last90', 'all']).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });

  const { start, end } = resolveRange(parsed.data);

  let q = admin
    .from('stripe_invoices')
    .select(
      'id, number, status, amount_paid_cents, currency, paid_at, created_at, finalized_at, client_id, clients(name)',
    )
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: true })
    .limit(5000);
  if (start) q = q.gte('paid_at', start);
  if (end) q = q.lte('paid_at', end);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull refunds in the same window so totals row reflects bank-reconcilable
  // net revenue. Individual invoice rows still show gross; refunds are
  // itemized below.
  let refundQ = admin
    .from('stripe_refunds')
    .select('amount_cents, currency, created_at, status, client_id, stripe_charges:charge_id(client_id), stripe_invoices:invoice_id(number, clients(name))')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: true })
    .limit(5000);
  if (start) refundQ = refundQ.gte('created_at', start);
  if (end) refundQ = refundQ.lte('created_at', end);
  const { data: refunds } = await refundQ;

  const header = [
    'Date',
    'Invoice Number',
    'Customer',
    'Memo',
    'Amount',
    'Currency',
    'Status',
    'Stripe Invoice ID',
  ];

  const rows: string[] = [header.map(csvEscape).join(',')];
  // Group totals by currency so a USD + CAD mix doesn't produce a misleading
  // single-sum row. If everything is one currency we still emit just that row.
  const totalsByCurrency = new Map<string, number>();
  for (const inv of data ?? []) {
    const client = inv.clients as { name?: string | null } | null;
    const cents = inv.amount_paid_cents ?? 0;
    const currency = (inv.currency ?? 'usd').toUpperCase();
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + cents);
    rows.push(
      [
        inv.paid_at ? isoDate(inv.paid_at) : '',
        inv.number ?? '',
        client?.name ?? 'Unlinked customer',
        'Stripe invoice payment',
        centsToDollars(cents).toFixed(2),
        currency,
        inv.status,
        inv.id,
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  // Refund rows (negative amounts) interleaved after invoice rows.
  const refundsByCurrency = new Map<string, number>();
  for (const r of refunds ?? []) {
    const cents = r.amount_cents ?? 0;
    const currency = (r.currency ?? 'usd').toUpperCase();
    refundsByCurrency.set(currency, (refundsByCurrency.get(currency) ?? 0) + cents);
    const invoice = r.stripe_invoices as { number?: string | null; clients?: { name?: string | null } | null } | null;
    const customerName = invoice?.clients?.name ?? 'Unlinked customer';
    rows.push(
      [
        r.created_at ? isoDate(r.created_at) : '',
        invoice?.number ?? '',
        customerName,
        'Refund',
        (-centsToDollars(cents)).toFixed(2),
        currency,
        'refunded',
        '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  // Totals row per currency — net (paid − refunded). QuickBooks ignores
  // unknown rows on import; these are for humans eyeballing the CSV or
  // pasting into a spreadsheet.
  const hasAny = (data && data.length > 0) || (refunds && refunds.length > 0);
  if (hasAny) {
    rows.push('');
    const allCurrencies = new Set<string>([
      ...Array.from(totalsByCurrency.keys()),
      ...Array.from(refundsByCurrency.keys()),
    ]);
    for (const currency of Array.from(allCurrencies).sort()) {
      const paid = totalsByCurrency.get(currency) ?? 0;
      const refunded = refundsByCurrency.get(currency) ?? 0;
      const net = paid - refunded;
      rows.push(
        [
          '',
          '',
          `NET TOTAL (${currency})`,
          `${data?.length ?? 0} paid − ${refunds?.length ?? 0} refunds`,
          centsToDollars(net).toFixed(2),
          currency,
          '',
          '',
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }

  const body = rows.join('\n');
  const filename = `cortex-revenue-${start ?? 'all'}_${end ?? 'now'}.csv`;
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function isoDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveRange(
  q: z.infer<typeof querySchema>,
): { start: string | null; end: string | null } {
  if (q.start || q.end) {
    return { start: q.start ? `${q.start}T00:00:00Z` : null, end: q.end ? `${q.end}T23:59:59Z` : null };
  }
  const now = new Date();
  switch (q.range ?? 'ytd') {
    case 'mtd':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        end: null,
      };
    case 'ytd':
      return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: null };
    case 'last30':
      return { start: new Date(Date.now() - 30 * 86400_000).toISOString(), end: null };
    case 'last90':
      return { start: new Date(Date.now() - 90 * 86400_000).toISOString(), end: null };
    case 'all':
    default:
      return { start: null, end: null };
  }
}

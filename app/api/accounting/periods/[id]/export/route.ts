import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor, centsToDollars } from '@/lib/accounting/periods';

/**
 * GET /api/accounting/periods/[id]/export — CSV download of every entry in
 * the period.
 *
 *   ?format=quickbooks (default) — five-column Bills shape that QuickBooks
 *     Online imports cleanly: Date, Vendor, Account, Memo, Amount.
 *   ?format=detailed — long-form columns for spreadsheet review.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') === 'detailed' ? 'detailed' : 'quickbooks';

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: period } = await adminClient
    .from('payroll_periods')
    .select('id, start_date, end_date, half, status')
    .eq('id', id)
    .single();
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 });

  const { data: entries } = await adminClient
    .from('payroll_entries')
    .select('entry_type, team_member_id, payee_label, client_id, video_count, rate_cents, amount_cents, margin_cents, description, created_at')
    .eq('period_id', id)
    .order('entry_type')
    .order('created_at');

  const memberIds = Array.from(new Set((entries ?? []).map((e) => e.team_member_id).filter(Boolean))) as string[];
  const clientIds = Array.from(new Set((entries ?? []).map((e) => e.client_id).filter(Boolean))) as string[];

  const [{ data: members }, { data: clients }] = await Promise.all([
    memberIds.length > 0
      ? adminClient.from('team_members').select('id, full_name').in('id', memberIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    clientIds.length > 0
      ? adminClient.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const memberName = new Map((members ?? []).map((m) => [m.id, m.full_name ?? '']));
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const csv =
    format === 'detailed'
      ? buildDetailedCsv(entries ?? [], memberName, clientName)
      : buildQuickbooksCsv(entries ?? [], memberName, clientName, period.end_date as string);

  const filename =
    format === 'detailed'
      ? `payroll-${period.start_date}-${period.half}-detailed.csv`
      : `quickbooks-bills-${period.start_date}-${period.half}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Payroll-Period': encodeURIComponent(
        labelFor(period.start_date, period.half as 'first-half' | 'second-half'),
      ),
    },
  });
}

const QB_ACCOUNT_BY_TYPE: Record<string, string> = {
  editing: 'Payroll - Editing',
  smm: 'Payroll - SMM',
  affiliate: 'Affiliate Payouts',
  blogging: 'Payroll - Blogging',
  override: 'Payroll - Misc',
  misc: 'Payroll - Misc',
};

interface RawEntry {
  entry_type: string;
  team_member_id: string | null;
  payee_label: string | null;
  client_id: string | null;
  video_count: number | null;
  rate_cents: number | null;
  amount_cents: number | null;
  margin_cents: number | null;
  description: string | null;
  created_at: string;
}

function buildQuickbooksCsv(
  entries: RawEntry[],
  memberName: Map<string, string>,
  clientName: Map<string, string>,
  billDate: string,
): string {
  const header = ['Date', 'Vendor', 'Account', 'Memo', 'Amount'];
  const rows = entries
    .filter((e) => (e.amount_cents ?? 0) > 0)
    .map((e) => {
      const vendor = e.team_member_id
        ? memberName.get(e.team_member_id) ?? ''
        : (e.payee_label ?? '').trim();
      const account = QB_ACCOUNT_BY_TYPE[e.entry_type] ?? 'Payroll - Misc';
      const client = e.client_id ? clientName.get(e.client_id) ?? '' : '';
      const memoParts = [
        client ? client : null,
        e.video_count ? `${e.video_count} videos` : null,
        e.description?.trim() || null,
      ].filter(Boolean);
      const memo = memoParts.join(' · ').replace(/\r?\n/g, ' ');
      const amount = ((e.amount_cents ?? 0) / 100).toFixed(2);
      return [billDate, vendor, account, memo, amount];
    });

  return [header, ...rows].map((cols) => cols.map(csvEscape).join(',')).join('\n');
}

function buildDetailedCsv(
  entries: RawEntry[],
  memberName: Map<string, string>,
  clientName: Map<string, string>,
): string {
  const header = [
    'Type',
    'Payee',
    'Client',
    'Videos',
    'Rate (USD)',
    'Amount (USD)',
    'Margin (USD)',
    'Description',
    'Created',
  ];
  const rows = entries.map((e) => [
    e.entry_type,
    e.team_member_id ? memberName.get(e.team_member_id) ?? '' : e.payee_label ?? '',
    e.client_id ? clientName.get(e.client_id) ?? '' : '',
    String(e.video_count ?? 0),
    e.rate_cents ? centsToDollars(e.rate_cents) : '',
    centsToDollars(e.amount_cents ?? 0),
    e.margin_cents ? centsToDollars(e.margin_cents) : '',
    (e.description ?? '').replace(/\r?\n/g, ' '),
    new Date(e.created_at).toISOString().split('T')[0],
  ]);
  return [header, ...rows].map((cols) => cols.map(csvEscape).join(',')).join('\n');
}

function csvEscape(cell: string): string {
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

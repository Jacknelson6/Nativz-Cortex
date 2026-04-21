import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor, centsToDollars } from '@/lib/accounting/periods';

/**
 * GET /api/accounting/periods/[id]/export — CSV download of every entry in
 * the period. Columns are ordered for the "drop into a spreadsheet and
 * paste into bookkeeping" workflow, with headers the tax person can read.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const rows = (entries ?? []).map((e) => [
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

  const csv = [header, ...rows]
    .map((cols) => cols.map(csvEscape).join(','))
    .join('\n');

  const filename = `payroll-${period.start_date}-${period.half}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      // RFC 7230 restricts header values to ASCII — the period label contains
      // `·` and an en-dash, which make Node throw before the body is sent.
      'X-Payroll-Period': encodeURIComponent(
        labelFor(period.start_date, period.half as 'first-half' | 'second-half'),
      ),
    },
  });
}

function csvEscape(cell: string): string {
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

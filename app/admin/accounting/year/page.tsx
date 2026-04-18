import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { YearMatrixClient } from '@/components/accounting/year-matrix-client';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging' | 'override' | 'misc';

interface RawEntry {
  id: string;
  entry_type: EntryType;
  team_member_id: string | null;
  payee_label: string | null;
  amount_cents: number;
  margin_cents: number;
  video_count: number;
  period_id: string;
}
interface RawPeriod {
  id: string;
  start_date: string;
  half: 'first-half' | 'second-half';
}
interface RawMember { id: string; full_name: string | null }

export default async function AccountingYearPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') redirect('/admin/dashboard');

  const params = await searchParams;
  const year = Number.parseInt(params.year ?? '', 10) || new Date().getFullYear();

  const [{ data: periodsRaw }, { data: membersRaw }] = await Promise.all([
    adminClient
      .from('payroll_periods')
      .select('id, start_date, half')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`)
      .order('start_date'),
    adminClient
      .from('team_members')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name'),
  ]);

  const periods = (periodsRaw ?? []) as RawPeriod[];
  const members = (membersRaw ?? []) as RawMember[];

  const periodIds = periods.map((p) => p.id);
  const { data: entriesRaw } = periodIds.length > 0
    ? await adminClient
        .from('payroll_entries')
        .select('id, entry_type, team_member_id, payee_label, amount_cents, margin_cents, video_count, period_id')
        .in('period_id', periodIds)
    : { data: [] as RawEntry[] };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Accounting · {year}</h1>
          <p className="text-sm text-text-muted mt-1">
            Year-to-date totals by service and person. Click a cell to open the period.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/accounting"
            className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
          >
            Period list
          </Link>
          <YearPicker currentYear={year} />
        </div>
      </div>

      <YearMatrixClient
        year={year}
        periods={periods}
        members={members}
        entries={(entriesRaw ?? []) as RawEntry[]}
      />
    </div>
  );
}

function YearPicker({ currentYear }: { currentYear: number }) {
  const years = [currentYear - 1, currentYear, currentYear + 1];
  return (
    <div className="inline-flex rounded-lg border border-nativz-border bg-surface p-0.5">
      {years.map((y) => (
        <Link
          key={y}
          href={`/admin/accounting/year?year=${y}`}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            y === currentYear
              ? 'bg-accent text-white'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor } from '@/lib/accounting/periods';
import { PeriodDetailClient } from '@/components/accounting/period-detail-client';

export default async function AccountingPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const { data: period } = await adminClient
    .from('payroll_periods')
    .select('id, start_date, end_date, half, status, notes, locked_at, paid_at')
    .eq('id', id)
    .single();
  if (!period) notFound();

  const [{ data: entries }, { data: team }, { data: clients }] = await Promise.all([
    adminClient
      .from('payroll_entries')
      .select('id, entry_type, team_member_id, payee_label, client_id, video_count, rate_cents, amount_cents, margin_cents, description, created_at')
      .eq('period_id', id)
      .order('created_at', { ascending: true }),
    adminClient
      .from('team_members')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name'),
    adminClient
      .from('clients')
      .select('id, name')
      .order('name'),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Link href="/admin/accounting" className="hover:text-text-secondary">Accounting</Link>
        <span>›</span>
        <span className="text-text-secondary">{labelFor(period.start_date, period.half as 'first-half' | 'second-half')}</span>
      </div>
      <PeriodDetailClient
        period={{
          ...period,
          half: period.half as 'first-half' | 'second-half',
          status: period.status as 'draft' | 'locked' | 'paid',
          label: labelFor(period.start_date, period.half as 'first-half' | 'second-half'),
        }}
        initialEntries={entries ?? []}
        teamMembers={team ?? []}
        clients={clients ?? []}
      />
    </div>
  );
}

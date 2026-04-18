import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor } from '@/lib/accounting/periods';
import { SubmitPayrollClient } from '@/components/accounting/submit-payroll-client';

export const dynamic = 'force-dynamic';

export default async function SubmitPayrollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const adminClient = createAdminClient();

  const { data: tok } = await adminClient
    .from('payroll_submission_tokens')
    .select('id, period_id, team_member_id, default_entry_type, expires_at, use_count')
    .eq('token', token)
    .single();

  if (!tok) notFound();

  const expired = new Date(tok.expires_at).getTime() < Date.now();

  const [{ data: period }, { data: member }, { data: clients }] = await Promise.all([
    adminClient
      .from('payroll_periods')
      .select('id, start_date, end_date, half, status')
      .eq('id', tok.period_id)
      .single(),
    adminClient
      .from('team_members')
      .select('id, full_name, role')
      .eq('id', tok.team_member_id)
      .single(),
    adminClient
      .from('clients')
      .select('id, name')
      .order('name'),
  ]);

  if (!period || !member) notFound();

  if (expired || period.status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-text-primary">
            {expired ? 'This link has expired' : 'This period is closed'}
          </h1>
          <p className="text-base text-text-secondary">
            Ask Jack for a new submission link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SubmitPayrollClient
      token={token}
      periodLabel={labelFor(period.start_date, period.half as 'first-half' | 'second-half')}
      memberName={member.full_name ?? 'there'}
      defaultType={(tok.default_entry_type ?? 'editing') as 'editing' | 'smm' | 'affiliate' | 'blogging'}
      clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
      previousSubmissionCount={tok.use_count ?? 0}
    />
  );
}

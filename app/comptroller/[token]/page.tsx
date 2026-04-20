import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor } from '@/lib/accounting/periods';
import { ComptrollerReadonlyClient } from '@/components/accounting/comptroller-readonly-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Read-only payroll view reached via a link-token (no Supabase auth). Admin
 * mints the link from the period detail page, shares it with a Comptroller
 * or CEO, and they can read totals + download the CSV without signing in.
 *
 * Token → period resolution happens server-side with the service-role client
 * so RLS doesn't need a public policy.
 */
export default async function ComptrollerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from('payroll_view_tokens')
    .select('id, token, role, label, expires_at, revoked_at, period_id, first_viewed_at')
    .eq('token', token)
    .maybeSingle();

  if (!tokenRow) notFound();
  if (tokenRow.revoked_at) {
    return <RevokedCard />;
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return <ExpiredCard />;
  }

  const [{ data: period }, { data: entries }] = await Promise.all([
    admin
      .from('payroll_periods')
      .select('id, start_date, end_date, half, status, locked_at, paid_at')
      .eq('id', tokenRow.period_id)
      .single(),
    admin
      .from('payroll_entries')
      .select('id, entry_type, team_member_id, payee_label, client_id, amount_cents, margin_cents, description')
      .eq('period_id', tokenRow.period_id)
      .order('entry_type', { ascending: true }),
  ]);

  if (!period) notFound();

  // Enrich with team_member + client names so the view doesn't leak UUIDs.
  const teamIds = Array.from(
    new Set((entries ?? []).map((e) => e.team_member_id).filter(Boolean) as string[]),
  );
  const clientIds = Array.from(
    new Set((entries ?? []).map((e) => e.client_id).filter(Boolean) as string[]),
  );
  const [{ data: teamRows }, { data: clientRows }] = await Promise.all([
    teamIds.length
      ? admin.from('team_members').select('id, full_name').in('id', teamIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
    clientIds.length
      ? admin.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);
  const teamById = new Map((teamRows ?? []).map((t) => [t.id, t.full_name ?? 'Unknown']));
  const clientById = new Map((clientRows ?? []).map((c) => [c.id, c.name ?? 'Unknown']));

  const enriched = (entries ?? []).map((e) => ({
    ...e,
    payee: e.team_member_id ? (teamById.get(e.team_member_id) ?? 'Unknown') : e.payee_label,
    client_name: e.client_id ? (clientById.get(e.client_id) ?? null) : null,
  }));

  // Mark first view so the admin side can see who actually opened the link.
  if (!tokenRow.first_viewed_at) {
    await admin
      .from('payroll_view_tokens')
      .update({ first_viewed_at: new Date().toISOString() })
      .eq('id', tokenRow.id);
  }

  return (
    <ComptrollerReadonlyClient
      token={tokenRow.token}
      role={tokenRow.role as 'comptroller' | 'ceo'}
      label={tokenRow.label}
      period={{
        id: period.id,
        label: labelFor(period.start_date, period.half as 'first-half' | 'second-half'),
        status: period.status,
        start_date: period.start_date,
        end_date: period.end_date,
        locked_at: period.locked_at,
        paid_at: period.paid_at,
      }}
      entries={enriched}
    />
  );
}

function ExpiredCard() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <div className="rounded-2xl border border-nativz-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold text-text-primary">Link expired</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Ask Nativz to mint you a fresh one.
        </p>
      </div>
    </div>
  );
}

function RevokedCard() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <div className="rounded-2xl border border-nativz-border bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold text-text-primary">Link revoked</h1>
        <p className="mt-2 text-sm text-text-secondary">
          This share link has been turned off. Ask Nativz for a new one if you still need access.
        </p>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NewSubscriptionForm } from '@/components/competitor-intelligence/new-subscription-form';

export const dynamic = 'force-dynamic';

export default async function NewSubscriptionPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const [{ data: me }, { data: clients }] = await Promise.all([
    admin.from('users').select('role, is_super_admin, email').eq('id', user.id).single(),
    admin.from('clients').select('id, name, agency').eq('is_active', true).order('name'),
  ]);
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="cortex-page-gutter max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Competitor intelligence · automation
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">New recurring report</h1>
        <p className="text-sm text-text-muted">
          Pick a client, choose a cadence, and add the people who should receive the report.
          Cortex reads from the client&apos;s active benchmarks when it&apos;s time to send.
        </p>
        <Link
          href="/admin/competitor-intelligence/reports"
          className="inline-block text-xs text-text-muted hover:text-accent-text"
        >
          ← Back to subscriptions
        </Link>
      </header>

      <NewSubscriptionForm clients={clients ?? []} defaultRecipient={me?.email ?? null} />
    </div>
  );
}

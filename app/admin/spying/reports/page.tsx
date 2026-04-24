import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SubscriptionsTable } from '@/components/spying/subscriptions-table';
import { ReportHistoryFeed } from '@/components/spying/report-history-feed';

export const dynamic = 'force-dynamic';

export default async function CompetitorReportsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/admin/dashboard');
  }

  const [{ data: subscriptions }, { data: reports }, { data: clients }] = await Promise.all([
    admin
      .from('competitor_report_subscriptions')
      .select(
        'id, client_id, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at, client:clients(name, agency)',
      )
      .order('next_run_at', { ascending: true }),
    admin
      .from('competitor_reports')
      .select(
        'id, subscription_id, client_id, generated_at, period_start, period_end, email_status, email_error, client:clients(name, agency)',
      )
      .order('generated_at', { ascending: false })
      .limit(50),
    admin.from('clients').select('id, name, agency').eq('is_active', true).order('name'),
  ]);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · automation
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-tight text-text-primary">
              Recurring competitor reports
            </h1>
            <p className="max-w-2xl text-sm text-text-muted">
              Schedule a branded competitor update for any client. Cortex pulls the latest
              benchmark snapshots, emails the recipients on cadence, and archives every run.
            </p>
          </div>
          <Link
            href="/admin/spying/reports/new"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-xs font-semibold uppercase tracking-[2px] text-white transition-colors hover:bg-accent/90"
            style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
          >
            + New subscription
          </Link>
        </div>
        <nav className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
          <Link href="/admin/spying" className="hover:text-cyan-300">
            ← Back to Competitor intelligence
          </Link>
          <Link href="/admin/analytics?tab=benchmarking" className="hover:text-cyan-300">
            Benchmarking analytics →
          </Link>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Active subscriptions ({subscriptions?.length ?? 0})
        </h2>
        <SubscriptionsTable subscriptions={subscriptions ?? []} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Recent runs ({reports?.length ?? 0})
        </h2>
        <ReportHistoryFeed reports={reports ?? []} />
      </section>

      {(clients?.length ?? 0) === 0 && (
        <p className="text-xs text-text-muted">
          No active clients found. Add a client before creating a subscription.
        </p>
      )}
    </div>
  );
}

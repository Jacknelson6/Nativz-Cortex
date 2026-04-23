import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TrendMonitorsTable } from '@/components/trend-finder/trend-monitors-table';
import { TrendReportsFeed } from '@/components/trend-finder/trend-reports-feed';

export const dynamic = 'force-dynamic';

export default async function TrendMonitorsPage() {
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

  const [{ data: subscriptions }, { data: reports }] = await Promise.all([
    admin
      .from('trend_report_subscriptions')
      .select(
        'id, client_id, name, topic_query, keywords, brand_names, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at, client:clients(name, agency)',
      )
      .order('next_run_at', { ascending: true }),
    admin
      .from('trend_reports')
      .select(
        'id, subscription_id, client_id, generated_at, period_start, period_end, summary, email_status, email_error, subscription:trend_report_subscriptions(name), client:clients(name, agency)',
      )
      .order('generated_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <header className="space-y-2">
        <p
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
          style={{ fontFamily: 'Rubik, system-ui, sans-serif', fontStyle: 'italic' }}
        >
          Trend Finder · brand listening
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1
              className="text-3xl font-bold text-text-primary"
              style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
            >
              Trend monitors
            </h1>
            <p
              className="max-w-2xl text-sm text-white/70"
              style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
            >
              Keep an ongoing ear on any topic — brand mentions, keyword cues, or market chatter.
              Cortex searches the web on cadence and emails a summary of what people are saying.
            </p>
          </div>
          <Link
            href="/admin/search/monitors/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#9314CE] px-5 py-2 text-xs font-semibold uppercase tracking-[2px] text-white transition-colors hover:bg-[#7A0FB0]"
            style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
          >
            + New monitor
          </Link>
        </div>
        <nav className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
          <Link href="/admin/search/new" className="hover:text-cyan-300">
            ← Back to Trend Finder
          </Link>
          <Link href="/admin/competitor-intelligence/reports" className="hover:text-cyan-300">
            Competitor reports →
          </Link>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Active monitors ({subscriptions?.length ?? 0})
        </h2>
        <TrendMonitorsTable subscriptions={subscriptions ?? []} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Recent reports ({reports?.length ?? 0})
        </h2>
        <TrendReportsFeed reports={reports ?? []} />
      </section>
    </div>
  );
}
